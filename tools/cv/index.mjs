import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { readContent } from "./content.mjs";
import { cvFiles } from "./files.mjs";
import { cvHtml, cleanMetadata } from "./render.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const output = path.join(repoRoot, "out/cv");
await fs.access(path.join(repoRoot, "out/index.html"));
await fs.mkdir(output, { recursive: true });
const files = cvFiles();
const html = await fs.readFile(path.join(output, "index.html"), "utf8");
for (const url of Object.values(files)) {
  if (!html.includes(`href="${url}"`)) {
    throw new Error("build v\u00e0 tool CV d\u00f9ng CV_VERSION_DATE kh\u00e1c nhau: rebuild with the same CV_VERSION_DATE");
  }
}
const content = readContent();
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
try {
  const page = await browser.newPage();
  await page.route("**/*", route => route.abort());
  for (const locale of ["en", "vi"]) {
    await page.setContent(cvHtml(content, locale));
    await page.evaluate(() => document.fonts.ready);
    const pdf = cleanMetadata(await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
    }));
    const filename = path.basename(files[locale]);
    await fs.writeFile(path.join(output, filename), pdf);
    console.log(`${filename}: ${pdf.length} bytes; Title=CV; Author/Creator/Producer/dates cleared`);
  }
  for (const filename of await fs.readdir(output)) {
    if (/^cv-nguyen-huu-bao-duy-(en|vi)-\d{4}-\d{2}-\d{2}\.pdf$/.test(filename)
      && !Object.values(files).includes(`/cv/${filename}`)) {
      await fs.rm(path.join(output, filename));
    }
  }
  await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(files));
} finally {
  await browser.close();
}
