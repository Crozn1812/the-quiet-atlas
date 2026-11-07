// Lead review: mean screen luma (greyscale 0..1) of every PNG in a folder. Usage: node tools/review/luma.mjs <dir>
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const sharp = require("sharp");
const dir = process.argv[2];
for (const file of readdirSync(dir).filter(name => name.endsWith(".png")).sort()) {
  const stats = await sharp(`${dir}/${file}`).greyscale().stats();
  console.log(`${file}\t${(stats.channels[0].mean / 255).toFixed(3)}`);
}
