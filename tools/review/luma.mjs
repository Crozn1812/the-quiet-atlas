// Lead review: mean screen luma (greyscale 0..1) of every PNG in a folder. Usage: node tools/review/luma.mjs <dir>
// sharp is a transitive dependency (Next.js), so resolve it from the pnpm store.
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const store = `${root}node_modules/.pnpm/`;
const entry = readdirSync(store).find(name => name.startsWith("sharp@"));
if (!entry) throw new Error("sharp not found in node_modules/.pnpm");
export const sharp = createRequire(`${root}package.json`)(`${store}${entry}/node_modules/sharp`);
export async function meanLuma(input) {
  const stats = await sharp(input).greyscale().stats();
  return stats.channels[0].mean / 255;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  for (const file of readdirSync(dir).filter(name => name.endsWith(".png")).sort()) {
    console.log(`${file}\t${(await meanLuma(`${dir}/${file}`)).toFixed(3)}`);
  }
}
