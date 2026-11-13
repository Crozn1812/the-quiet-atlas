import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";
import { attachVehicleDiagnostics, recordVehicleDiagnostics } from "./helpers/vehicle-diagnostics";
import { expect, test, type Locator } from "./test";

interface Journey {
  nearVehicle(): void;
  position(): { x: number; y: number; z: number };
  rider(): { transitioning: boolean; rootUp: number; torsoUp: number; distanceToBike: number };
}
type JourneyElement = HTMLElement & { __tqaJourney: Journey };
const position = (world: Locator) => world.evaluate(el => (el as JourneyElement).__tqaJourney.position());
const pose = (world: Locator) => world.evaluate(el => (el as JourneyElement).__tqaJourney.rider());
// SwiftShader can take longer than a wall-clock sleep to draw a frame. Two
// consecutive rAF callbacks guarantee a world tick between position samples.
const positionAfterFrames = (world: Locator) => world.evaluate(async el => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  return (el as JourneyElement).__tqaJourney.position();
});

test.use({ reducedMotion: "no-preference", viewport: { width: 1280, height: 720 } });
test.describe.configure({ timeout: 120_000 });
test.beforeEach(async ({ page }) => recordVehicleDiagnostics(page));
test.afterEach(async ({ page }, testInfo) => attachVehicleDiagnostics(page, testInfo));

for (const scenario of ["brake to rest", "E while rolling", "E during mount"] as const) {
  test(`vehicle with motion: ${scenario} ends upright beside the parked bike`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.addInitScript(() => { (window as unknown as { __tqaJourney: boolean }).__tqaJourney = true; });
    const world = await enterWorld(page, "en");
    test.skip(!world, "NOT RUN: WebGL2 unavailable");
    await ensureWindowFocus(page);
    // Deferred scenery only builds while the session can simulate. A second
    // Edge worker may start blurred, so restore focus before waiting for it.
    await expect(world!).toHaveAttribute("data-world-build", "done", { timeout: 90_000 });
    // High is pinned using the same event as the menu; motion stays enabled.
    await world!.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "high" } })));
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);
    await world!.locator("canvas").focus();
    await world!.evaluate(el => (el as JourneyElement).__tqaJourney.nearVehicle());
    await page.waitForTimeout(800);
    await page.keyboard.press("e");
    await expect(world!).toHaveAttribute("data-world-vehicle", "manual");
    if (scenario !== "E during mount") {
      await expect.poll(async () => (await pose(world!)).transitioning, { timeout: 15_000 }).toBe(false);
      const start = await position(world!);
      await page.keyboard.down("w");
      await page.waitForTimeout(1500);
      await page.keyboard.down("d");
      // Keep driving until simulation, rather than 3 s of wall time, has moved
      // the bike. Use the default assertion deadline and original distance.
      await expect.poll(async () => {
        const driven = await positionAfterFrames(world!);
        return Math.hypot(driven.x - start.x, driven.z - start.z);
      }).toBeGreaterThan(.1);
      await page.keyboard.up("d");
      await page.keyboard.up("w");
      if (scenario === "brake to rest") {
        await page.keyboard.down("s");
        await expect.poll(async () => {
          const before = await position(world!);
          const after = await positionAfterFrames(world!);
          return Math.hypot(after.x - before.x, after.z - before.z);
        }, { timeout: 15_000 }).toBeLessThan(.002);
        // Keep holding past zero: braking must not silently become reversing.
        const stopped = await position(world!);
        await page.waitForTimeout(500);
        const after = await positionAfterFrames(world!);
        expect(Math.hypot(after.x - stopped.x, after.z - stopped.z)).toBeLessThan(.002);
        await page.keyboard.up("s");
      }
    }
    await page.keyboard.press("e");
    await expect(world!).toHaveAttribute("data-world-vehicle", "parked", { timeout: 15_000 });
    await expect.poll(async () => (await pose(world!)).transitioning, { timeout: 15_000 }).toBe(false);
    const standing = await pose(world!);
    expect(standing.rootUp).toBeGreaterThan(.99);
    expect(standing.torsoUp).toBeGreaterThan(.95);
    expect(standing.distanceToBike).toBeGreaterThan(.8);
    expect(standing.distanceToBike).toBeLessThan(1.7);
    await expect(world!).toHaveAttribute("data-world-quality", "high");
    expect(errors).toEqual([]);
  });
}
