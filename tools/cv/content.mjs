import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// Only these public modules may be evaluated. Never follow a drafts import.
export function readContent(root = repoRoot) {
  const allowed = new Set([
    "src/content/index.ts",
    "src/content/schema.ts",
    "src/i18n/locales.ts",
  ]);
  const external = createRequire(import.meta.url);
  function load(file) {
    if (!allowed.has(file)) throw new Error(`Non-public module: ${file}`);
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText;
    const loaded = { exports: {} };
    function requirePublic(id) {
      if (id === "zod") return external(id);
      if (id === "./evidence.json") {
        return JSON.parse(fs.readFileSync(path.join(root, "src/content/evidence.json"), "utf8"));
      }
      if (id === "./schema") return load("src/content/schema.ts");
      if (id === "@/i18n/locales") return load("src/i18n/locales.ts");
      throw new Error(`Non-public import: ${id}`);
    }
    vm.runInNewContext(code, {
      exports: loaded.exports,
      module: loaded,
      require: requirePublic,
      URL,
    }, { filename: file });
    return loaded.exports;
  }
  return load("src/content/index.ts").content;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function documentHtml(locale, body, style = "") {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>CV</title><style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #172c2b; padding: 32px; line-height: 1.5; }
    h1, h2 { line-height: 1.2; } article { break-inside: avoid; } ${style}
    </style></head><body>${body}</body></html>`;
}
