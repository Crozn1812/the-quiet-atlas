import { ZONES } from "../../src/features/world/layout/zones";
import { SIGNPOSTS } from "../../src/features/navigation/signposts";
import { PATH_BRIDGES, pathLength, pathPointAt } from "../../src/features/world/layout/path";
import { nearestPath } from "../../src/features/world/terrain/samples";
import { enterWorld, ensureWindowFocus, trackConsoleErrors } from "./helpers";
import { attachVehicleDiagnostics, recordVehicleDiagnostics } from "./helpers/vehicle-diagnostics";
import { expect, test, type Locator } from "./test";

interface Journey {
  nearVehicle(): void;
  zone(): string | null;
  vehicle(): { x: number; z: number; heading: number; speed: number; mode: string; cruise: boolean };
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
    // QF-01 made High the default; on software WebGL the deferred build then outlasts the wait. Build on Low.
    await world!.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "low" } })));
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
        // QF-02: holding S past rest reverses (1.5 m/s), so a slow frame can skip the zero crossing.
        // Forward motion has stopped once the signed speed is at or below .2.
        await expect.poll(async () => await world!.evaluate(el => (el as JourneyElement).__tqaJourney.vehicle().speed),
          { timeout: 15_000, intervals: [16] }).toBeLessThan(.2);
        await page.keyboard.up("s");
        await expect.poll(async () => Math.abs(await world!.evaluate(el => (el as JourneyElement).__tqaJourney.vehicle().speed)),
          { timeout: 15_000 }).toBe(0);
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

async function mountForJourney(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.addInitScript(() => { (window as unknown as { __tqaJourney: boolean }).__tqaJourney = true; });
  const world = await enterWorld(page, "en");
  test.skip(!world, "NOT RUN: WebGL2 unavailable");
  await ensureWindowFocus(page);
  // QF-01 made High the default; on software WebGL the deferred build then outlasts the wait. Build on Low.
  await world!.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "low" } })));
  await expect(world!).toHaveAttribute("data-world-build", "done", { timeout: 90_000 });
  await world!.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality: "low" } })));
  await world!.locator("canvas").focus();
  await world!.evaluate(el => (el as JourneyElement).__tqaJourney.nearVehicle());
  await page.keyboard.press("e");
  await expect(world!).toHaveAttribute("data-world-vehicle", "manual");
  await expect.poll(async () => (await pose(world!)).transitioning, { timeout: 15_000 }).toBe(false);
  return world!;
}

// Feedback driver only presses W/A/D and reads the existing opt-in journey hook.
// It never changes pose, speed, physics time or collision state.
async function driveWaypoints(world: Locator, points: { x: number; z: number }[]) {
  return world.evaluate(async (el, points) => {
    const journey = (el as JourneyElement).__tqaJourney;
    const held = new Set<string>();
    const key = (code: string, down: boolean) => {
      if (down === held.has(code)) return;
      if (down) held.add(code); else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
    };
    let index = 0, lastProgress = performance.now();
    const deadline = performance.now() + 480_000;
    try {
      while (index < points.length) {
        if (performance.now() > deadline || performance.now() - lastProgress > 30_000) throw new Error(JSON.stringify({ waypoint: index, vehicle: journey.vehicle(), target: points[index] }));
        const state = journey.vehicle(), target = points[index]!;
        const distance = Math.hypot(target.x - state.x, target.z - state.z);
        if (distance < 1.2) { index++; lastProgress = performance.now(); continue; }
        const angle = Math.atan2(target.x - state.x, target.z - state.z) - state.heading;
        const error = Math.atan2(Math.sin(angle), Math.cos(angle));
        key("KeyA", error > .025); key("KeyD", error < -.025);
        key("KeyW", state.speed < (Math.abs(error) > .3 ? 2 : 4));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      return journey.position();
    } finally { for (const code of [...held]) key(code, false); }
  }, points);
}

test("rides from First Light along the path over a bridge to the far bank", async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackConsoleErrors(page);
  const world = await mountForJourney(page);
  const bridge = PATH_BRIDGES[0]!;
  const length = pathLength();
  const destination = ZONES.find(zone => zone.t > bridge.tEnd)!;
  const end = destination.t * length - 10;
  const points = Array.from({ length: Math.ceil((end - 12) / 2) + 1 }, (_, i) => {
    const station = Math.min(end, 12 + i * 2);
    const p = pathPointAt(station / length);
    const tangent = pathPointAt((station + .1) / length).sub(pathPointAt((station - .1) / length)).normalize();
    // Real travel signs stand on the route centre. Ease around their river side;
    // both bridge approaches and the span remain on the authored centreline.
    const offset = Math.max(...SIGNPOSTS.map(post => {
      const signStation = nearestPath(post.position.x, post.position.z).t * length;
      const delta = Math.abs(station - signStation);
      return delta < 16 ? 2.4 * (1 + Math.cos(Math.PI * delta / 16)) / 2 : 0;
    }));
    return { x: p.x + tangent.z * offset, z: p.z - tangent.x * offset };
  });
  const arrived = await driveWaypoints(world, points);
  expect(nearestPath(arrived.x, arrived.z).t).toBeGreaterThan(bridge.tEnd);
  expect(await world.evaluate(el => (el as JourneyElement).__tqaJourney.zone())).toBe(destination.id);
  expect(Math.hypot(arrived.x - points.at(-1)!.x, arrived.z - points.at(-1)!.z)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test("steers five metres off the path without a corridor wall", async ({ page }) => {
  test.setTimeout(180_000);
  const world = await mountForJourney(page);
  // Follow the dry outer bank; the opposite side is the river.
  const length = pathLength();
  const points = [14, 20, 26, 32].map(s => {
    const p = pathPointAt(s / length);
    const t = pathPointAt((s + .1) / length).sub(pathPointAt((s - .1) / length)).normalize();
    return { x: p.x - 5.3 * t.z, z: p.z + 5.3 * t.x };
  });
  const arrived = await driveWaypoints(world, points);
  expect(nearestPath(arrived.x, arrived.z).distance).toBeGreaterThan(5);
});

test("cruise cancels immediately on C, Esc, brake, UI and blur", async ({ page }) => {
  const world = await mountForJourney(page);
  for (const reason of ["c", "Escape", "s", "ui", "blur"]) {
    await page.keyboard.press("c");
    await expect(world).toHaveAttribute("data-world-vehicle", "cruise");
    if (reason === "ui") await world.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:pause", { detail: { reason: "overlay", paused: true } })));
    else if (reason === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await page.keyboard.press(reason);
    await expect(world).toHaveAttribute("data-world-vehicle", "manual");
    if (reason === "Escape") {
      await expect(page.locator(".world-menu dialog")).toHaveAttribute("open", "");
      await page.keyboard.press("Escape");
      await expect(world).toHaveAttribute("data-world-paused", "false");
    }
    if (reason === "ui") await world.evaluate(el => el.dispatchEvent(new CustomEvent("tqa:pause", { detail: { reason: "overlay", paused: false } })));
    if (reason === "blur") await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  }
});
