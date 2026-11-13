// FL-03: conservative sky / open fog coverage in the TOP 45% of High ingame shots.
// Usage: node tools/review/sky-fraction.mjs <shot-directory> [--check] [--masks]
// Calibration: displayed RGB from the actual forest sky dome, cloud undersides
// and distant jade air in main / FL-03 High 1600x900 shots (not a generic white
// threshold): blue-grey sky ~[165,185,205], cloud ~[190,213,232], shaded cloud
// ~[140,164,178], distant fog ~[115,135,145]. Pale warm clouds / mist also count.
// Bright fogged geometry and cream HUD labels count conservatively as open air;
// this is a colour proxy, NOT a depth/object-ID segmentation. Inspect masks.
// No per-image fitting, crop changes or UI removal. The denominator includes
// every pixel in the top crop, so before and after use the identical classifier.
import { readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function isForestSky(r, g, b) {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const coolSkyOrFog = luma >= 115 && b - r >= 10 && g - r >= 4
    && b - g >= -3 && b - r <= 85;
  const paleCloudOrMist = luma >= 165 && Math.min(r, g, b) >= 120
    && Math.max(r, g, b) - Math.min(r, g, b) <= 65;
  return coolSkyOrFog || paleCloudOrMist;
}

async function main() {
  const [dir, ...flags] = process.argv.slice(2);
  if (!dir || flags.some(flag => !["--check", "--masks"].includes(flag))) {
    throw new Error("Usage: node tools/review/sky-fraction.mjs <shot-directory> [--check] [--masks]");
  }
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const store = path.join(root, "node_modules/.pnpm");
  const entry = readdirSync(store).find(name => name.startsWith("sharp@"));
  if (!entry) throw new Error("sharp not found in node_modules/.pnpm");
  const sharp = createRequire(path.join(root, "package.json"))(path.join(store, entry, "node_modules/sharp"));
  const required = ["first-light", "roots", "workshop", "milestones"];
  const files = readdirSync(dir).filter(file => /^ingame-.*\.png$/.test(file)).sort();
  const results = [];
  for (const file of files) {
    const { data, info } = await sharp(path.join(dir, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rows = Math.floor(info.height * 0.45), total = info.width * rows;
    const mask = flags.includes("--masks") ? Buffer.alloc(info.width * info.height * 3) : undefined;
    let sky = 0;
    for (let pixel = 0; pixel < total; pixel++) {
      const offset = pixel * info.channels;
      const hit = isForestSky(data[offset], data[offset + 1], data[offset + 2]);
      if (hit) sky++;
      if (mask) {
        mask[pixel * 3] = hit ? 255 : Math.round(data[offset] * 0.3);
        mask[pixel * 3 + 1] = hit ? 80 : Math.round(data[offset + 1] * 0.3);
        mask[pixel * 3 + 2] = hit ? 180 : Math.round(data[offset + 2] * 0.3);
      }
    }
    const zone = file.slice(7, -4), fraction = sky / total, gated = required.includes(zone);
    results.push({ file, width: info.width, height: info.height, cropRows: rows, skyPixels: sky, totalPixels: total,
      fraction, required: gated, pass: !gated || fraction <= 0.15 });
    console.log(`${file}\t${(fraction * 100).toFixed(2)}%\t${gated ? fraction <= 0.15 ? "PASS" : "FAIL" : "informational"}`);
    if (mask) await sharp(mask, { raw: { width: info.width, height: info.height, channels: 3 } })
      .webp({ lossless: true }).toFile(path.join(dir, `sky-mask-${zone}.webp`));
  }
  const missing = required.filter(zone => !results.some(result => result.file === `ingame-${zone}.png`));
  writeFileSync(path.join(dir, "sky-fraction.json"), JSON.stringify({ crop: "top 45%", classifier: "forest-displayed-rgb-v1", limit: 0.15, missing, results }, null, 2) + "\n");
  if (flags.includes("--check") && (missing.length || results.some(result => !result.pass))) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
