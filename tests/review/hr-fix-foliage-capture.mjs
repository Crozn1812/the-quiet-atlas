// Reuse the audit's exact camera poses, GPU checks and measurements.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const label = process.argv[2] ?? "after";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Use a fresh evidence label");
const root = path.resolve(import.meta.dirname, "../..");
let source = await readFile(path.join(root, "tools/review/hr-audit.mjs"), "utf8");
source = source.replace('from "./luma.mjs"', `from ${JSON.stringify(pathToFileURL(path.join(root, "tools/review/luma.mjs")).href)}`)
  .replace('const base = "http://127.0.0.1:4203";', 'const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:4203";')
  .replace('await page.goto(`${base}/en/`);', `
    if (process.env.CAPTURE_BASELINE) {
      const baseline = path.resolve(root, process.env.CAPTURE_BASELINE);
      if (!baseline.startsWith(root + path.sep)) throw new Error("Baseline must be inside the workspace");
      await page.route(base + "/**", async route => {
        const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
        const file = path.resolve(baseline, "." + pathname, ...(pathname.endsWith("/") ? ["index.html"] : []));
        if (!file.startsWith(baseline + path.sep)) return route.abort();
        try { await access(file); await route.fulfill({ path: file }); }
        catch { await route.continue(); }
      });
    }
    page.on("console", message => { if (message.type() === "error") manifest.errors.push(message.text().slice(0, 2000)); });
    await page.goto(\`\${base}/en/\`); console.log("Welcome loaded");`)
  .replace('await world.waitFor({ state: "visible" });', 'await world.waitFor({ state: "visible" }); console.log("World playable and dressing ready");')
  .replace('await page.waitForLoadState("networkidle");', 'console.log(`Settling ${shot.id}`); await page.waitForLoadState("networkidle");')
  .replace('from "@playwright/test"', `from ${JSON.stringify(import.meta.resolve("@playwright/test"))}`)
  .replace('from "./hr-audit-layout.mjs"', `from ${JSON.stringify(pathToFileURL(path.join(root, "tools/review/hr-audit-layout.mjs")).href)}`)
  .replace('path.resolve(import.meta.dirname, "../..")', JSON.stringify(root))
  .replace(/const dest = .*;/, `const dest = path.join(root, "test-results/hr-fix-foliage", ${JSON.stringify(label)});`)
  .replace('const manifest = {', `
const wanted = new Set(["first-light-overview", "first-light-close", "first-light-path", "roots-overview", "roots-close", "roots-up", "roots-path", "old-trail-close", "old-trail-path", "horizon-close", "horizon-left-holes", "quiet-shore-overview", "quiet-shore-close", "quiet-shore-path", "last-postcard-overview", "low-first-light"]);
const selected = process.env.CAPTURE_IDS ? new Set(process.env.CAPTURE_IDS.split(",")) : wanted;
shots.splice(0, shots.length, ...shots.filter(shot => selected.has(shot.id)));
const manifest = {`);
process.argv[2] = "--capture";
await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
