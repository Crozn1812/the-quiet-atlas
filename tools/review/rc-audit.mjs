// RC-04: real UI inputs plus explicitly labelled QA travel/secret hooks.
// Run ALONE after build: node tools/review/rc-audit.mjs <outDir> [baseUrl] [vi|en|all]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const [outDir, base = "http://127.0.0.1:4180", requested = "all"] = process.argv.slice(2);
if (!outDir || !["vi", "en", "all"].includes(requested)) throw new Error("Usage: rc-audit.mjs <outDir> [baseUrl] [vi|en|all]");
await mkdir(outDir, { recursive: true });
const zones = ["first-light", "workshop", "roots", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"];
const contentHints = {
  "first-light": /A first hello|Lời chào đầu/,
  workshop: /Workbench by the stream|Bàn thợ cạnh suối/,
  roots: /The root stump|Gốc rễ/,
  milestones: /Milestone rocks|Cụm đá dấu mốc/,
  "old-trail": /Old trail marker|Cột mốc đường cũ/,
  horizon: /Sea-facing viewer|Ống nhòm nhìn ra biển/,
  "quiet-shore": /Piano on the seaside porch|Piano trên hiên hướng biển/,
  "last-postcard": /The last mailbox|Hộp thư cuối đường/,
};
const report = { startedAt: new Date().toISOString(), base, viewport: "1600x900", browser: null,
  status: "RUNNING", method: "Headed Edge; goTo/visitSecret/nearVehicle are QA hooks; E/menu/vehicle/railing use real inputs. Full keyboard journey is separate. Screenshots require human visual review.", steps: [] };
let browser, page, locale;
const world = () => page.locator(".world-viewport[data-world-chunk]");
const canvas = () => world().locator("canvas");
const menu = () => page.locator(".world-menu dialog");
const closeDialog = async () => {
  for (let i = 0; i < 3 && await page.locator("dialog[open]").count(); i++) await page.keyboard.press("Escape");
  if (await canvas().count()) await canvas().focus();
};
const save = async () => {
  await writeFile(path.join(outDir, "results.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(path.join(outDir, "steps.md"), ["# RC UI audit — measured steps", "", report.method, "",
    `Status: ${report.status}; browser: ${report.browser ?? "not launched"}`, "",
    "| Status | Locale | Step | Evidence / result |", "|---|---|---|---|",
    ...report.steps.map(s => `| ${s.status} | ${s.locale} | ${s.id} | ${s.error ? s.error.replaceAll("|", "\\|").replaceAll("\n", " ") : JSON.stringify(s.detail ?? {}).replaceAll("|", "\\|")} · ${s.screenshot ? `[image](${s.screenshot})` : "no screenshot"} |`), ""].join("\n"));
};
async function shot(name) {
  const filename = `${locale}-${name}.png`;
  await page.screenshot({ path: path.join(outDir, filename), timeout: 10_000 });
  return filename;
}
async function step(id, action) {
  const row = { id, locale, status: "RUNNING", startedAt: new Date().toISOString() };
  report.steps.push(row);
  await save();
  try { row.detail = await action(); row.status = "PASS"; }
  catch (error) { row.status = "FAIL"; row.error = String(error); console.error(`${locale} ${id}: ${error}`); }
  finally {
    try { row.screenshot = await shot(id); } catch (error) { row.screenshotError = String(error); row.status = "FAIL"; }
    row.endedAt = new Date().toISOString();
    await save();
    console.log(`${locale} ${id}: ${row.status}`);
  }
  return row.status === "PASS";
}
async function hook(name, value) {
  return world().evaluate(async (node, [method, argument]) => {
    const journey = node.__tqaJourney;
    if (typeof journey?.[method] !== "function") throw new Error(`Missing journey hook ${method}`);
    return await journey[method](argument);
  }, [name, value]);
}
const position = () => hook("position");
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
async function hold(key, ms) {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(ms); } finally { await page.keyboard.up(key); }
}
async function approach(target, maxTicks = 100, stopWhen) {
  let best = Infinity, stalled = 0;
  for (let i = 0; i < maxTicks; i++) {
    if (stopWhen && await stopWhen()) return true;
    const delta = await world().evaluate((node, t) => {
      const j = node.__tqaJourney, p = j.position(), yaw = j.cameraYaw();
      const dx = t.x - p.x, dz = t.z - p.z;
      return { distance: Math.hypot(dx, dz), x: dx * Math.cos(yaw) - dz * Math.sin(yaw), z: dx * Math.sin(yaw) + dz * Math.cos(yaw) };
    }, target);
    if (delta.distance < .65) return true;
    if (delta.distance < best - .1) { best = delta.distance; stalled = 0; } else stalled++;
    if (stalled > 20) return false;
    const key = Math.abs(delta.x) > Math.abs(delta.z) ? delta.x > 0 ? "d" : "a" : delta.z > 0 ? "s" : "w";
    await hold(key, 100);
  }
  return false;
}
async function seekContent(zone) {
  await canvas().focus();
  const hint = () => world().evaluate(node => node.querySelector("[data-world-interaction-hint]")?.textContent ?? "");
  if (contentHints[zone].test(await hint())) return { approach: "arrival" };
  const origin = await position(), yaw = await hook("cameraYaw");
  const observations = [];
  // First walk the centre corridor downstream; authored set-pieces can be placed +16 m
  // from the zone anchor (the arrival is ~4 m before it). Then inspect both shoulders.
  // Include the upstream porch alternatives as well. Every move remains real WASD.
  const forwardSweep = [0, 4, 8, 12, 16, 20, 24, -4, -8];
  const route = [...forwardSweep.map(forward => [forward, 0]),
    ...[3, -3, 6, -6].flatMap(right => forwardSweep.map(forward => [forward, right]))];
  for (const [forward, right] of route) {
    const target = { x: origin.x - Math.sin(yaw) * forward + Math.cos(yaw) * right,
      z: origin.z - Math.cos(yaw) * forward - Math.sin(yaw) * right };
    const reached = await approach(target, 100, async () => contentHints[zone].test(await hint()));
    const observation = { forward, right, reached, position: await position(), hint: await hint() };
    observations.push(observation);
    if (contentHints[zone].test(observation.hint)) return { approach: "real WASD search", origin, yaw, observations };
  }
  throw new Error(`No content hint after real-key approach at ${zone}; actual approach observations=${JSON.stringify(observations)}. No synthetic content fallback used.`);
}
async function enter(mode) {
  await page.goto(`${base}/${locale}/`);
  await page.bringToFront();
  await expect(page.getByRole("button", { name: "Enter World", exact: true })).toBeVisible();
  await shot(`welcome-${mode}`);
  await page.getByRole("button", { name: "Enter World", exact: true }).click();
  await page.waitForTimeout(300);
  const loadingMode = await page.locator(".world-entry[data-app-mode]").getAttribute("data-app-mode");
  const loadingText = await page.locator("#world-reason").innerText();
  await shot(`loading-${mode}`);
  await expect(world()).toHaveAttribute("data-world-intro", "playing", { timeout: 90_000 });
  await shot(`intro-${mode}-start`);
  if (mode === "skip") {
    await page.locator("[data-world-intro-skip]").click();
  } else {
    for (const interval of [1500, 2500, 3000, 3000]) {
      await page.waitForTimeout(interval);
      await shot(`intro-full-${Date.now()}`);
    }
  }
  await expect(world()).toHaveAttribute("data-world-intro", "done", { timeout: 60_000 });
  await expect(world()).toHaveAttribute("data-world-build", "done", { timeout: 90_000 });
  await canvas().focus();
  await expect(world()).toHaveAttribute("data-world-paused", "false");
  return { mode, loadingMode, loadingText, loadingObserved: loadingMode === "loading", skipHookUsed: false };
}
async function openMenu() {
  await closeDialog();
  await page.locator(".world-hud button[aria-haspopup='dialog']").click();
  await expect(menu()).toBeVisible();
}
async function portfolio(mobileWidth) {
  const prefix = mobileWidth ? `mobile-${mobileWidth}` : "desktop";
  await step(`${prefix}-welcome`, async () => {
    await page.goto(`${base}/${locale}/`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (mobileWidth) {
      await expect(page.getByRole("button", { name: "Enter World", exact: true })).toBeHidden();
      await expect(page.locator("#world-reason")).toContainText(locale === "vi" ? /chuột/ : /mouse/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
  await step(`${prefix}-quick`, async () => {
    await page.goto(`${base}/${locale}/quick/`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
  if (mobileWidth) return;
  // Collect the Quick links before following its actual CV landing page.
  const caseLinks = await page.locator(`a[href*="/${locale}/projects/"]`).evaluateAll(nodes => [...new Set(nodes.map(a => a.href))]);
  await step("cv-links", async () => {
    await page.locator('a[href="/cv/"]').first().click();
    await expect(page).toHaveURL(new URL("/cv/", base).href);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("CV");
    const hrefs = await page.locator('a[href*=".pdf"]').evaluateAll(nodes => nodes.map(a => a.href));
    expect([...new Set(hrefs)].length, "CV landing provides EN and VI PDFs").toBe(2);
    const responses = [];
    for (const href of [...new Set(hrefs)]) {
      const response = await page.request.get(href);
      expect(response.ok(), `${href} HTTP status`).toBe(true);
      const contentType = response.headers()["content-type"] ?? "";
      expect(contentType, `${href} PDF content type`).toMatch(/^application\/pdf(?:;|$)/i);
      const bytes = await response.body();
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      responses.push({ href, status: response.status(), contentType, bytes: bytes.length });
    }
    return { responses, manualPdfReading: "NOT RUN" };
  });
  await step("case-links-present", async () => { expect(caseLinks.length).toBeGreaterThan(0); return { links: caseLinks }; });
  for (const [i, href] of caseLinks.entries()) await step(`case-study-${i + 1}`, async () => {
    const response = await page.goto(href);
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    return { href };
  });
}
try {
  await save();
  browser = await chromium.launch({ headless: false, channel: "msedge" });
  report.browser = browser.version();
  for (locale of requested === "all" ? ["vi", "en"] : [requested]) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => { window.__tqaJourney = true; });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    let entered = await step("intro-full", () => enter("full"));
    if (entered) await step("exit-after-full-intro", async () => {
      await page.locator(".world-hud").getByRole("button", { name: /^(Rời world|Exit world)$/ }).click();
      await expect(page.locator('[data-app-mode="welcome"]')).toBeVisible();
      await expect(world()).toHaveCount(0);
    });
    entered = await step("intro-skip-real", () => enter("skip"));
    if (entered) {
      for (const zone of zones) {
        await step(`zone-${zone}-high`, async () => {
          await closeDialog();
          await hook("goTo", zone);
          await openMenu();
          await menu().locator('input[name="world-menu-quality"][value="high"]').check();
          await menu().getByRole("button", { name: /^× / }).click();
          await canvas().focus();
          await page.waitForTimeout(1200);
          await expect(world()).toHaveAttribute("data-world-quality", "high");
          return { travel: "QA goTo", zone: await hook("zone"), position: await position() };
        });
        await step(`zone-${zone}-close-camera`, async () => {
          await closeDialog(); await canvas().focus();
          const box = await canvas().boundingBox(); expect(box).toBeTruthy();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          // Wheel delta -2000 at 0.01 m/pixel clamps desired camera distance to 4 m.
          // Pitch is fixed by the product. This captures the lowest normal orbit via close zoom;
          // it does not claim ArrowDown support or automatic visual acceptance.
          try {
            await page.mouse.wheel(0, -2000); await page.waitForTimeout(1000);
            await expect(world()).toHaveAttribute("data-world-paused", "false");
            await shot(`zone-${zone}-close-camera-review`);
          } finally {
            // From the 4 m clamp, +800 pixels restores the normal 12 m desired distance.
            await page.mouse.wheel(0, 800); await page.waitForTimeout(750);
          }
          return { method: "real mouse wheel, fixed-pitch orbit", requestedDistanceM: 4, restoredDistanceM: 12,
            visualApproval: "NOT RUN — human must review character/landmark occlusion and camera clipping in screenshot" };
        });
        await step(`overlay-${zone}-key-e`, async () => {
          await closeDialog();
          const approach = await seekContent(zone);
          await page.keyboard.press("e");
          const overlay = page.locator("dialog.world-content[open]");
          await expect(overlay).toBeVisible();
          await expect(overlay.locator(`[data-zone="${zone}"]`)).toBeVisible();
          await expect(world()).toHaveAttribute("data-world-paused", "true");
          return { ...approach, openedBy: "real E" };
        });
        await step(`overlay-${zone}-close`, async () => {
          await closeDialog();
          await expect(page.locator("dialog.world-content[open]")).toHaveCount(0);
          await expect(world()).toHaveAttribute("data-world-paused", "false");
        });
      }
      await step("journal", async () => {
        await closeDialog(); await page.keyboard.press("j");
        const dialog = page.getByRole("dialog", { name: locale === "vi" ? "Sổ Atlas" : "Atlas Journal" });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("button")).toHaveCount(9);
        await expect(world()).toHaveAttribute("data-world-paused", "true");
      });
      for (const quality of ["low", "balanced", "high"]) await step(`menu-quality-${quality}`, async () => {
        await openMenu();
        await menu().locator(`input[name="world-menu-quality"][value="${quality}"]`).check();
        await expect(world()).toHaveAttribute("data-world-quality", quality);
      });
      await step("menu-reduced-motion", async () => {
        await openMenu();
        const control = menu().getByRole("button", { name: /^(Giảm chuyển động|Reduced motion):/ });
        await control.click(); await expect(control).toHaveAttribute("aria-pressed", "true");
        await expect(world()).toHaveAttribute("data-world-motion", "reduced");
        await shot("menu-motion-on");
        await control.click(); await expect(control).toHaveAttribute("aria-pressed", "false");
        await expect(world()).toHaveAttribute("data-world-motion", "full");
      });
      await step("menu-sound", async () => {
        await openMenu();
        const control = menu().getByRole("button", { name: /^(Âm thanh|Sound):/ });
        await expect(control).toBeEnabled();
        await control.click(); await expect(control).toHaveAttribute("aria-pressed", "true");
        await shot("menu-sound-on");
        await control.click(); await expect(control).toHaveAttribute("aria-pressed", "false");
        return { audibleSound: "manual review required" };
      });
      await step("menu-language", async () => {
        await openMenu();
        const other = locale === "vi" ? "en" : "vi";
        await menu().getByRole("button", { name: other === "vi" ? "Tiếng Việt" : "English", exact: true }).click();
        await expect(world()).toHaveAttribute("data-world-locale", other);
        await expect(page.locator("html")).toHaveAttribute("lang", other);
        await shot("menu-other-language");
        await menu().getByRole("button", { name: locale === "vi" ? "Tiếng Việt" : "English", exact: true }).click();
        await expect(world()).toHaveAttribute("data-world-locale", locale);
      });
      await step("chooser-key-e", async () => {
        await closeDialog(); await hook("goTo", "first-light"); await canvas().focus();
        await expect(world().locator("[data-world-interaction-hint]")).toContainText(/Đi tới|Travel/);
        await page.keyboard.press("e");
        const chooser = page.getByRole("dialog", { name: locale === "vi" ? "Đi tới…" : "Travel to…" });
        await expect(chooser).toBeVisible();
        await expect(chooser.locator('[data-zone="first-light"]')).toBeDisabled();
        await shot("chooser-open");
        await chooser.locator('[data-zone="workshop"]').click();
        await expect(chooser).toHaveCount(0);
        await expect(world()).toHaveAttribute("data-world-teleport", "idle", { timeout: 60_000 });
        expect(await hook("zone")).toBe("workshop");
      });
      await step("bike-mount", async () => {
        await closeDialog(); await hook("nearVehicle"); await canvas().focus(); await page.keyboard.press("e");
        await expect(world()).toHaveAttribute("data-world-vehicle", "manual");
      });
      await step("bike-manual-movement", async () => {
        await expect(world()).toHaveAttribute("data-world-vehicle", "manual");
        const before = await position(); await hold("w", 3000); const after = await position();
        expect(distance(before, after), "bike movement metres").toBeGreaterThan(1);
        return { before, after, metres: distance(before, after) };
      });
      await step("bike-cruise", async () => {
        await page.keyboard.press("c"); await expect(world()).toHaveAttribute("data-world-vehicle", "cruise");
        const before = await position(); await page.waitForTimeout(2500); const after = await position();
        expect(distance(before, after), "cruise movement metres").toBeGreaterThan(1);
        return { before, after, metres: distance(before, after) };
      });
      await step("bike-brake", async () => {
        await hold("s", 2200); await expect(world()).toHaveAttribute("data-world-vehicle", "manual");
        // S can reverse after stopping. Release, let coasting settle, then measure stationary drift.
        await page.waitForTimeout(1200);
        const before = await position(); await page.waitForTimeout(700); const after = await position();
        expect(distance(before, after), "after brake drift metres").toBeLessThan(.3);
        return { drift: distance(before, after) };
      });
      await step("bike-dismount", async () => {
        await page.keyboard.press("e"); await expect(world()).toHaveAttribute("data-world-vehicle", "parked");
      });
      await step("secret-page-not-yet", async () => {
        await closeDialog(); await hook("goTo", "quiet-shore"); await canvas().focus();
        await world().evaluate(node => {
          node.__rcSecrets = [];
          node.addEventListener("tqa:secret-found", event => node.__rcSecrets.push(event.detail));
        });
        expect(await hook("visitSecret", "unwritten-page")).toBe(true);
        await expect(world()).toHaveAttribute("data-world-ending", "idle");
        await expect(world().locator("[data-world-story-feedback]")).toBeVisible();
        expect(await world().evaluate(node => node.__rcSecrets)).toEqual([]);
        return { method: "QA visitSecret; early page must not trigger ending" };
      });
      for (const id of ["reflection", "forgotten-sound", "unmarked-road", "unwritten-page"]) await step(`secret-${id}`, async () => {
        await canvas().focus(); expect(await hook("visitSecret", id)).toBe(true);
        await page.waitForTimeout(700);
        const discoveries = await world().evaluate(node => node.__rcSecrets);
        expect(discoveries.some(item => item.id === id), `discovery event for ${id}`).toBe(true);
        return { method: "QA visitSecret", id, discoveries };
      });
      await step("ending-full", async () => {
        await expect(world()).toHaveAttribute("data-world-ending", "playing");
        for (const interval of [1500, 6000, 8000, 8000]) { await page.waitForTimeout(interval); await shot(`ending-${Date.now()}`); }
        await expect(world()).toHaveAttribute("data-world-ending", "seen", { timeout: 60_000 });
        expect(await world().evaluate(node => node.__rcSecrets.map(item => item.id))).toEqual(["reflection", "forgotten-sound", "unmarked-road", "unwritten-page"]);
      });
      await step("railing-real-key-approach", async () => {
        await closeDialog(); await hook("goTo", "last-postcard"); await canvas().focus();
        const target = await hook("lookoutPosition"); expect(target).toBeTruthy();
        expect(await approach(target, 120), "reached lookout by real WASD").toBe(true);
        await expect(world().locator("[data-world-interaction-hint]")).toContainText(/Ngắm biển|Look out to sea/);
        await page.keyboard.press("e"); await expect(world()).toHaveAttribute("data-world-lean", "on");
        await expect(page.locator(".world-hud")).toBeHidden(); await page.waitForTimeout(1500);
      });
      await step("railing-exit", async () => {
        await page.keyboard.press("Escape"); await expect(world()).not.toHaveAttribute("data-world-lean", "on");
        await expect(world()).toHaveAttribute("data-world-paused", "false");
      });
      await step("exit-world", async () => {
        await closeDialog();
        await page.locator(".world-hud").getByRole("button", { name: /^(Rời world|Exit world)$/ }).click();
        await expect(page.locator('[data-app-mode="welcome"]')).toBeVisible();
        await expect(world()).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Enter World", exact: true })).toBeFocused();
      });
    } else {
      report.steps.push({ id: "world-features-dependent", locale, status: "NOT RUN", error: "Intro/entry failed; world feature audit cannot start." });
      await save();
    }
    await portfolio();
    await step("uncaught-errors", async () => { expect(errors).toEqual([]); return { errors }; });
    await context.close();
    for (const width of [390, 320]) {
      const mobile = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      page = await mobile.newPage(); page.setDefaultTimeout(15_000);
      await portfolio(width); await mobile.close();
    }
  }
  report.status = report.steps.some(s => s.status === "FAIL") ? "FAIL" : "PASS";
} catch (error) {
  report.status = "FAIL"; report.fatal = String(error); process.exitCode = 1;
} finally {
  report.endedAt = new Date().toISOString();
  await save(); await browser?.close();
  if (report.status !== "PASS") process.exitCode = 1;
}
