import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { readContent, documentHtml, escapeHtml as e } from "../cv/content.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

await fs.access(path.join(repoRoot, "out/index.html"));
await fs.mkdir(path.join(repoRoot, "out/og"), { recursive: true });
const content = readContent();
const pages = [{ key: "entry", locale: "en", title: "The Quiet Atlas", description: "English · Tiếng Việt" }];
for (const p of content.profiles) {
  for (const mode of ["welcome", "quick", "privacy"]) {
    pages.push({
      key: `${p.locale}-${mode}`,
      locale: p.locale,
      title: mode === "welcome" ? "The Quiet Atlas" : mode === "quick" ? "Quick Portfolio" : "Privacy",
      description: `${p.name} · ${p.role} · ${p.level}`,
    });
  }
}
for (const p of content.projects) {
  pages.push({
    key: `${p.locale}-projects-${p.slug}`,
    locale: p.locale,
    title: p.title,
    description: `${p.reviewStatus !== "approved" ? "Draft · " : ""}${p.summary}`,
  });
}
pages.push({ key: "cv", locale: "en", title: "CV · EN / VI", description: "The Quiet Atlas" });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route("**/*", route => route.abort());
  for (const item of pages) {
    await page.setContent(documentHtml(item.locale, `
      <p>THE QUIET ATLAS / ${e(item.locale.toUpperCase())}</p>
      <h1>${e(item.title)}</h1>
      <p>${e(item.description)}</p>
    `, "body { margin: 0; padding: 72px; background: #edf0e6; border-top: 16px solid #375d51; } h1 { font-size: 64px; max-width: 1056px; } p { font-size: 28px; }"));
    await page.evaluate(() => document.fonts.ready);
    const filename = path.join(repoRoot, "out/og", `${item.key}.png`);
    await page.screenshot({ path: filename });
    console.log(`${filename}: ${(await fs.stat(filename)).size} bytes`);
  }
} finally {
  await browser.close();
}
