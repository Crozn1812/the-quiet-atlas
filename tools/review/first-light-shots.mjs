import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const [out,base="http://127.0.0.1:4415"] = process.argv.slice(2);
if (!out) throw new Error("Usage: first-light-shots.mjs outDir baseUrl");
await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url);
const sharp=createRequire(require.resolve("next/package.json"))("sharp");
const browser=await chromium.launch({channel:"msedge"});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("console",m=>{if(m.type()==="error" || (m.type()==="warning" && /webgl|shader|compile|link/i.test(m.text())))errors.push(m.text());});
await page.addInitScript(()=>{window.__tqaJourney=true;window.__tqaSkipIntro=true;});
await page.goto(`${base}/vi/`);
await page.getByRole("button",{name:/Enter World|Vào thế giới/}).click();
const world=page.locator('[data-world-build="done"][data-world-intro="done"]');
await world.waitFor({timeout:120000});
await page.waitForLoadState("networkidle");
await page.addStyleTag({content:'.world-hud,[data-hud-keys],[data-zone-title],.zone-title,.interaction-hint{visibility:hidden!important}'});
const origin=await world.evaluate(el=>el.__tqaJourney.position());
const metadata={base,origin,errors,frames:[]};
for (const quality of (process.env.TQA_QUICK ? [process.env.TQA_QUALITY ?? "balanced"] : ["low","balanced","high"])) {
 await world.evaluate((el,q)=>el.dispatchEvent(new CustomEvent("tqa:set-quality",{detail:{quality:q}})),quality);
 await world.locator("canvas").focus(); await page.waitForTimeout(1200);
 for (const [name,pose] of [["gameplay",null],["eye",{position:[origin.x+4,origin.y+2.5,origin.z+13],target:[origin.x,origin.y+3,origin.z-8]}],["overview",{position:[origin.x+28,origin.y+29,origin.z+32],target:[origin.x,origin.y+1,origin.z]}]]) {
  if(process.env.TQA_OVERLAY_ONLY || (process.env.TQA_QUICK && name === "overview")) continue;
  await world.evaluate((el,detail)=>el.dispatchEvent(new CustomEvent("tqa:postcard",{detail})),pose);
  await page.waitForTimeout(300);
  const file=`${quality}-${name}.webp`;
  const hide = name === "gameplay" ? undefined : await page.addStyleTag({content:"body *{visibility:hidden!important}canvas{visibility:visible!important}"});
  const png=await world.locator("canvas").screenshot();
  if(hide) await hide.evaluate(el=>el.remove());
  await sharp(png).webp({quality:90}).toFile(path.join(out,file));
  metadata.frames.push(file);
 }
 if(process.env.TQA_QUICK) continue;
 await world.evaluate(el=>{el.dispatchEvent(new CustomEvent("tqa:postcard",{detail:null}));el.dispatchEvent(new CustomEvent("tqa:open-content",{detail:{zoneId:"first-light"}}));});
 await page.locator("dialog.world-content img").evaluate(img=>img.decode());
 await page.screenshot({path:path.join(out,`${quality}-overlay.png`)});
 if(process.env.TQA_OVERLAY_ONLY) metadata.frames.push(`${quality}-overlay.png`);
 await page.setViewportSize({width:390,height:844}); await page.screenshot({path:path.join(out,`${quality}-overlay-mobile.png`)});
 if(process.env.TQA_OVERLAY_ONLY) metadata.frames.push(`${quality}-overlay-mobile.png`);
 await page.setViewportSize({width:1600,height:1000});
 await page.locator("dialog.world-content").getByRole("button",{name:/× (Đóng|Close)/}).click();
}
await writeFile(path.join(out,process.env.TQA_OVERLAY_ONLY ? "capture-overlay.json" : "capture.json"),JSON.stringify(metadata,null,2));
await browser.close();
if(errors.length) throw new Error(errors.join("\n"));
console.log(JSON.stringify(metadata));
