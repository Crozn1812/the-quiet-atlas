// Lead QF review: headed Edge, High, gameplay view at each zone arrival (plus an optional turn).
// Usage: node tools/review/qf-zone-views.mjs <outDir> <baseUrl> [zone,zone,…]
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const [outDir, base, list] = process.argv.slice(2);
if (!outDir || !base) throw new Error("Usage: qf-zone-views.mjs <outDir> <baseUrl> [zones]");
const zones = (list ?? "first-light,roots,workshop,milestones,old-trail,horizon,quiet-shore,last-postcard").split(",");
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: false, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(180_000);
  await page.addInitScript(skip => { window.__tqaJourney = true; if (skip) window.__tqaSkipIntro = true;
    window.__qfLog = []; const t0 = performance.now();
    new MutationObserver(list => { for (const m of list) { const el = m.target; if (m.attributeName?.startsWith("data-world-")) window.__qfLog.push(`${Math.round(performance.now() - t0)} ${m.attributeName}=${el.getAttribute(m.attributeName)}`); } }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-world-quality", "data-world-build", "data-world-intro"] });
  }, !process.env.QF_INTRO);
  await page.goto(`${base}/en/`);
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"][data-world-intro="done"]');
  await world.waitFor({ state: "visible" });
  const canvas = world.locator("canvas");
  console.log("quality", await world.getAttribute("data-world-quality"), await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const e = gl?.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; }));
  // Explicit menu choice, like a viewer (HR binders follow the quality event).
  for (const q of (process.env.QF_MENU ? ["low", "high"] : [])) {
    await canvas.focus(); await page.keyboard.press("Escape");
    await page.locator(`.world-menu dialog button[value="${q}"]`).click();
    await page.keyboard.press("Escape");
  }
  console.log("dataset", JSON.stringify(await world.evaluate(el => ({ ...el.dataset }))));
  if (process.env.QF_PAUSE) { await canvas.focus(); await page.keyboard.press("Escape"); await page.waitForTimeout(500); await page.keyboard.press("Escape"); }
  await page.waitForTimeout(Number(process.env.QF_WAIT ?? 0));
  const hide = ".world-viewport > :not(canvas), .world-hud { visibility: hidden !important; }";
  for (const zone of zones) {
    await world.evaluate((el, id) => el.__tqaJourney.goTo(id), zone);
    await canvas.focus();
    for (const [suffix, turn] of [["a", 0], ["b", 700]]) {
      if (turn) { await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(turn); await page.keyboard.up("ArrowLeft"); }
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3500);
      const style = await page.addStyleTag({ content: hide });
      await canvas.screenshot({ path: path.join(outDir, `${zone}-${suffix}.png`) });
      await style.evaluate(node => node.remove());
    }
    const fr = await page.evaluate(() => new Promise(r => { const t = []; let l = performance.now(); const f = n => { t.push(n - l); l = n; if (t.length < 180) requestAnimationFrame(f); else { t.sort((a, b) => a - b); r([t[90], t[171]].map(Math.round)); } }; requestAnimationFrame(f); }));
    console.log("shot", zone, await world.getAttribute("data-world-quality"), "median/p95 ms", fr);
  }
  console.log((await page.evaluate(() => window.__qfLog)).join(" | "));
} finally { await browser.close(); }
