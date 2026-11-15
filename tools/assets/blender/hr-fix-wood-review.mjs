// Reuse the audit's exact camera/layout, instrumentation and capture protocol.
// The audit script stays unchanged; only destination, server and selection differ.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const folder = process.env.WOOD_REVIEW ?? 'after';
let source = await readFile(path.join(root, 'tools/review/hr-audit.mjs'), 'utf8');
source = source.replace('const root = path.resolve(import.meta.dirname, "../..");', `const root = ${JSON.stringify(root)};`)
  .replace('const dest = path.join(root, "test-results/hr-audit", ...(supplement ? ["supplement"] : matchHorizon ? ["horizon-match"] : []));',
    `const dest = path.join(root, "test-results/hr-fix-wood", ${JSON.stringify(folder)});`)
  .replace('const base = "http://127.0.0.1:4203";', `const base = ${JSON.stringify(process.env.WOOD_BASE ?? 'http://127.0.0.1:4203')};`)
  .replace('if (mode === "--plan") {', `
const selected = new Set(${JSON.stringify((process.env.WOOD_SHOTS ?? 'first-light-close,first-light-path,workshop-overview,workshop-close,workshop-up,old-trail-close,old-trail-path,bridge-1,bridge-2,signpost,road-railing,road-surface,low-first-light').split(','))});
shots.splice(0, shots.length, ...shots.filter(s => selected.has(s.id)));
if (mode === "--plan") {`);
for (const file of ['luma.mjs', 'hr-audit-layout.mjs']) source = source.replace(`"./${file}"`, JSON.stringify(pathToFileURL(path.join(root, 'tools/review', file)).href));
source = source.replace('"@playwright/test"', JSON.stringify(import.meta.resolve('@playwright/test')));
source=source.replace('let responseBytes = 0;', `page.on("console", message => {
  if(message.type() === "error") manifest.errors.push("console: " + message.text().slice(0,2000));
});
let responseBytes = 0;`);
// Dev HMR keeps a request open; final export captures retain the audit's idle wait.
if (process.env.WOOD_BASE?.includes(':4213')) source=source
  .replace('await page.waitForLoadState("networkidle");','await page.waitForTimeout(2000);')
  .replace('page.on("pageerror", e => manifest.errors.push(e.message));','page.on("pageerror", e => { manifest.errors.push(e.message); console.error(e.stack); });')
  .replace('const entered = Date.now();','console.log("welcome loaded"); const entered = Date.now();')
  .replace('manifest.enterToPlayableIntroDoneMs = Date.now() - entered;','console.log("intro done"); manifest.enterToPlayableIntroDoneMs = Date.now() - entered;')
  .replace('manifest.enterToBuildDoneMs = Date.now() - entered;','console.log("build done"); manifest.enterToBuildDoneMs = Date.now() - entered;');
await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
