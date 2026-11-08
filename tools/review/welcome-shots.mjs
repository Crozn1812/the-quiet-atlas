// Current-engine Welcome review. Run: node tools/review/welcome-shots.mjs hero|before|after <outDir> [baseUrl]
// hero writes candidates only; inspect before replacing public/welcome images.
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const [mode, directory, suppliedBase = "http://127.0.0.1:4403/"] = process.argv.slice(2);
if (!["before", "after", "hero"].includes(mode) || !directory) throw new Error("Usage: welcome-shots.mjs hero|before|after <outDir> [baseUrl]");
const base = new URL(suppliedBase);
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Use a local build");
const out = resolve(directory);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: false });
const errors = [];
try {
  if (mode === "hero") {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(120_000);
    page.on("pageerror", error => errors.push(String(error)));
    await page.addInitScript(() => { window.__tqaJourney = true; window.__tqaSkipIntro = true; });
    await page.goto(new URL("/en/", base).href);
    await page.getByRole("button", { name: "Enter World", exact: true }).click();
    const world = page.locator('[data-world-build="done"][data-world-intro="done"]');
    await world.waitFor({state:"visible"});
    if (await world.getAttribute("data-world-postcard") !== "ready") throw new Error("Missing review-only camera hook");
    await world.evaluate(el => el.__tqaJourney.goTo("last-postcard"));
    await world.locator("canvas").focus();
    await page.keyboard.press("Escape");
    await page.locator('.world-menu dialog input[value="high"]').check();
    await page.keyboard.press("Escape");
    const views = [[-20,4,4,0,4,-28],[-8,3,6,7,3,-23],[-28,5,0,-5,5,-35]];
    const manifest = [];
    for (const [index, view] of views.entries()) {
      await world.evaluate((el, v) => { const p=el.__tqaJourney.position(); el.dispatchEvent(new CustomEvent("tqa:postcard",{detail:{position:[p.x+v[0],p.y+v[1],p.z+v[2]],target:[p.x+v[3],p.y+v[4],p.z+v[5]]}})); },view);
      const hidden = await page.addStyleTag({content:'body *:not(canvas):not(:has(canvas)),.world-hud,[data-hud-keys]{visibility:hidden!important}'});
      await page.waitForTimeout(1800);
      if (await world.getAttribute("data-world-quality") !== "high") throw new Error("Quality dropped below High");
      const clip = await world.locator("canvas").boundingBox();
      const png = await page.screenshot({path:join(out,`hero-source-${index}.png`),clip});
      await hidden.evaluate(el=>el.remove());
      for (const [width, limit] of [[1920,60_000],[960,25_000]]) {
        let bytes,quality;
        for(quality=85;quality>=25;quality--){bytes=await sharp(png).resize(width,width*9/16).webp({quality,effort:6}).toBuffer();if(bytes.length<=limit)break;}
        if(bytes.length>limit)throw new Error(`${width}: exceeds ${limit}`);
        const file=`hero-${index}-${width}.webp`;await writeFile(join(out,file),bytes);
        manifest.push({file,bytes:bytes.length,width,height:width*9/16,quality,view});
      }
    }
    await writeFile(join(out,"hero-manifest.json"),JSON.stringify({source:base.href,quality:"high",captured:new Date().toISOString(),candidates:manifest},null,2));
    console.log(JSON.stringify(manifest));
  } else {
    const checks=[];
    for(const [label,width,height] of [["desktop",1366,800],["mobile",390,844],["narrow",320,640]]){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:"reduce"});
      const page=await context.newPage();
      page.on("pageerror",error=>errors.push(String(error)));
      for(const locale of ["vi","en"]){
        await page.goto(new URL(`/${locale}/`,base).href);
        await page.waitForFunction(()=>document.querySelector('[data-app-mode="editorial"]')||document.querySelector('nav[aria-label="World"] button:not(:disabled)'));
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
        await page.screenshot({path:join(out,`welcome-${mode}-${locale}-${label}.png`)});
        const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,panel:(()=>{const r=document.querySelector('.corner-panel').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};})()}));
        const audit=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
        const blocking=audit.violations.filter(v=>["critical","serious"].includes(v.impact));
        checks.push({locale,label,...metrics,blocking});
        if(metrics.overflow||blocking.length)throw new Error(`Welcome ${locale}/${label}: ${JSON.stringify(checks.at(-1))}`);
      }
      await context.close();
    }
    await writeFile(join(out,`welcome-${mode}-checks.json`),JSON.stringify(checks,null,2));
    console.log(`${checks.length} Welcome viewport/locale audits: PASS`);
  }
  if(errors.length)throw new Error(errors.join("\n"));
}finally{await browser.close();}

