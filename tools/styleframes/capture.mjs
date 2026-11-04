// B2-031/033 — deterministic style-frame capture (Lead tool; not part of CI).
// Usage: node tools/styleframes/capture.mjs <outDir> [--video] [--presets=A,B,C] [--shots=forest-dawn,coast-dusk]
// Needs the bench running: pnpm exec vite tools/styleframes (port 4190). Stills: <preset>-<shot>.png.
// --video: PNG sequence t = n/30 s for 0..18 s per combo under <outDir>/seq/<preset>-<shot>/ (encode with ffmpeg).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const outDir = resolve(args.find(arg => !arg.startsWith("--")) ?? "styleframes-out");
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split("=")[1]?.split(",");
const presets = option("presets") ?? ["A", "B", "C"];
const shots = option("shots") ?? ["forest-dawn", "coast-dusk"];
const video = args.includes("--video");
const FPS = 30;
const SECONDS = 18;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));

async function frame(preset, shot, t, file) {
  await page.goto(`http://127.0.0.1:4190/?preset=${preset}&shot=${shot}&quality=High&t=${t}&clean=1`);
  await page.waitForFunction(() => window.__frameReady === true, null, { timeout: 30_000 });
  await page.screenshot({ path: file });
}

for (const preset of presets) for (const shot of shots) {
  await frame(preset, shot, 0, join(outDir, `${preset}-${shot}.png`));
  console.log(`still ${preset}-${shot}`);
  if (!video) continue;
  const dir = join(outDir, "seq", `${preset}-${shot}`);
  mkdirSync(dir, { recursive: true });
  // Same page, scrub the bench's time input: identical camera path without re-initialising the scene.
  for (let n = 0; n <= SECONDS * FPS; n++) {
    await page.evaluate(t => {
      const input = document.getElementById("time");
      input.value = t;
      input.dispatchEvent(new Event("input"));
    }, (n / FPS).toFixed(4));
    await page.waitForFunction(() => window.__frameReady === true, null, { timeout: 30_000 });
    await page.screenshot({ path: join(dir, `${String(n).padStart(4, "0")}.png`) });
  }
  console.log(`sequence ${preset}-${shot}`);
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
