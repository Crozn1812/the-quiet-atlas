import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import zlib from "node:zlib";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// Small verifier for Chromium's generated PDFs, not a general PDF parser.
export function extractText(buffer) {
  const objects = new Map();
  const source = buffer.toString("latin1");
  for (const match of source.matchAll(/(\d+) 0 obj\b([\s\S]*?)endobj/g)) {
    const body = match[2];
    const stream = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
    const text = stream
      ? (/\/FlateDecode/.test(body) ? zlib.inflateSync(Buffer.from(stream[1], "latin1")) : Buffer.from(stream[1], "latin1")).toString("latin1")
      : body;
    objects.set(match[1], { body, text });
  }
  const maps = new Map();
  for (const [id, object] of objects) {
    const ref = object.body.match(/\/ToUnicode (\d+) 0 R/);
    if (!ref) continue;
    const cmap = objects.get(ref[1])?.text ?? "";
    const map = new Map();
    for (const section of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of section[1].matchAll(/<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>/g)) {
        map.set(parseInt(pair[1], 16), String.fromCodePoint(parseInt(pair[2], 16)));
      }
    }
    for (const section of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const range of section[1].matchAll(/<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>/g)) {
        const start = parseInt(range[1], 16);
        const end = parseInt(range[2], 16);
        const first = parseInt(range[3], 16);
        for (let code = start; code <= end; code++) {
          map.set(code, String.fromCodePoint(first + code - start));
        }
      }
    }
    maps.set(id, map);
  }
  const fonts = new Map();
  for (const font of source.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    if (maps.has(font[2])) fonts.set(font[1], maps.get(font[2]));
  }
  let result = "";
  for (const { text } of objects.values()) {
    if (!text.includes("BT")) continue;
    let map;
    for (const token of text.matchAll(/\/(F\d+) [\d.]+ Tf|<([\dA-Fa-f]+)>\s*Tj/g)) {
      if (token[1]) map = fonts.get(token[1]);
      if (token[2]) {
        for (let i = 0; i < token[2].length; i += 4) {
          result += map?.get(parseInt(token[2].slice(i, i + 4), 16)) ?? "�";
        }
        result += "\n";
      }
    }
  }
  return result;
}

const files = JSON.parse(await fs.readFile(path.join(repoRoot, "out/cv/manifest.json"), "utf8"));
for (const [locale, file] of Object.entries(files)) {
  const pdf = await fs.readFile(path.join(repoRoot, "out", file));
  const source = pdf.toString("latin1");
  if (!source.includes("/Title (CV)")) throw new Error("Wrong Title");
  for (const key of ["Author", "Creator", "Producer", "CreationDate", "ModDate"]) {
    if (new RegExp(`/${key}\\s*\\((?!\\))`).test(source)) throw new Error(`Uncleared ${key}`);
  }
  const text = extractText(pdf);
  const name = locale === "vi" ? "Nguyễn Hữu Bảo Duy" : "Nguyen Huu Bao Duy";
  if (!text.replace(/\n/g, "").includes(name)) throw new Error(`PDF name missing: ${name}`);
  console.log(`${locale}: extracted ${name}; metadata verified; ${pdf.length} bytes`);
}
