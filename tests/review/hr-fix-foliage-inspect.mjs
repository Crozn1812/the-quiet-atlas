// Read-only renderer inspection and temporary visibility isolation for A03.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const dest = "test-results/hr-fix-foliage/inspect";
await mkdir(dest, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(120000);
  await page.addInitScript(() => {
    window.__tqaJourney = true; window.__tqaSkipIntro = true;
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__foliageScenes = new Set();
    window.__THREE_DEVTOOLS__.addEventListener("observe", ({ detail }) => {
      if (!detail.isWebGLRenderer) return;
      const render = detail.render;
      detail.render = function (scene, camera) {
        window.__foliageScenes.add(scene);
        if (window.__foliageNoPost) {
          if (!scene.isScene || scene.children.length < 5) return;
          this.setRenderTarget(null);
        }
        if (window.__foliageNoAir) scene.traverse(o => {
          if (o.material?.uniforms?.airEnabled) o.material.uniforms.airEnabled.value = 0;
        });
        return render.call(this, scene, camera);
      };
    });
  });
  await page.goto(process.env.CAPTURE_BASE ?? "http://localhost:4303/en/");
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  const world = page.locator('.world-viewport[data-world-build="done"]');
  await world.waitFor(); await page.locator("canvas").focus(); await page.keyboard.press("Escape");
  await page.locator('.world-menu dialog input[value="high"]').check(); await page.keyboard.press("Escape");
  await world.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:postcard", { detail: {
    position: [10.47, 8.82, 2.56], target: [13.37, 8.42, 1.76],
  } })));
  await page.waitForTimeout(15000);
  const data = await page.evaluate(() => {
    const objects = [];
    for (const scene of window.__foliageScenes) scene.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      const material = object.material;
      if (material.uniforms?.airEnabled) window.__foliageAir = material.uniforms.airEnabled;
      if (!/hr-tree|far-|grove|forest/.test(object.name + object.parent?.name)) return;
      objects.push({ name: object.name, parent: object.parent?.name, count: object.count,
        material: material.name, fog: material.fog, alphaTest: material.alphaTest,
        cacheKey: material.customProgramCacheKey(), color: material.color?.toArray(),
        tint: Array.from(object.geometry.attributes.hrTint?.array ?? []).slice(0, 3),
        fade: Array.from(object.geometry.attributes.hrFade?.array ?? []).slice(0, 3) });
    });
    return objects;
  });
  await writeFile(`${dest}/objects.json`, JSON.stringify(data, null, 2));
  await page.screenshot({ path: `${dest}/normal.png` });
  await page.evaluate(() => { window.__foliageNoAir = true; });
  await page.waitForTimeout(1000); await page.screenshot({ path: `${dest}/no-air.png` });
  await page.evaluate(() => {
    for (const scene of window.__foliageScenes) scene.traverse(object => {
      if (object.isMesh && object.material?.fog) { object.material.fog = false; object.material.needsUpdate = true; }
    });
  });
  await page.waitForTimeout(2000); await page.screenshot({ path: `${dest}/no-fog.png` });
  await page.evaluate(() => { window.__foliageNoPost = true; });
  await page.waitForTimeout(2000); await page.screenshot({ path: `${dest}/no-post.png` });
  console.log(`Inspected ${data.length} forest objects`);
} finally { await browser.close(); }
