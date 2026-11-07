// Lead review: mean RGB and HSV (hue°, sat, value) of the lower-left ground patch (x100–500, y550–800 at 1600×900)
// of every PNG in a folder. Usage: node tools/review/ground-hue.mjs <dir>
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const store = `${root}node_modules/.pnpm/`;
const sharp = createRequire(`${root}package.json`)(`${store}${readdirSync(store).find(name => name.startsWith("sharp@"))}/node_modules/sharp`);
function hsv(r, g, b) {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return [(h + 360) % 360, max ? d / max : 0, max];
}
const dir = process.argv[2];
for (const file of readdirSync(dir).filter(name => name.endsWith(".png")).sort()) {
  const stats = await sharp(`${dir}/${file}`).extract({ left: 100, top: 550, width: 400, height: 250 }).stats();
  const [r, g, b] = stats.channels.map(channel => channel.mean);
  const [h, s, v] = hsv(r, g, b);
  console.log(`${file}\thue ${h.toFixed(0)}\tsat ${s.toFixed(2)}\tval ${v.toFixed(2)}`);
}
