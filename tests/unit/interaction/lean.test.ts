import { AnimationClip, Box3, Group, PerspectiveCamera, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRailingLookout } from "../../../src/features/interaction/lean";
import { createCharacter } from "../../../src/features/world/character/runtime";
import { createCoastRailing } from "../../../src/features/world/road/railing";
import { createInteraction, type InteractionTarget } from "../../../src/features/interaction/targets";
import { surfaceHeight } from "../../../src/features/world/terrain/height";
import { HEIGHT } from "../../../src/features/world/scene";
import { ROAD_LIFT } from "../../../src/features/world/road/layout";
import { placeZoneScenes } from "../../../src/features/world/zones";
import { resolveHorizonBench } from "../../../src/features/world/zones/horizon";

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const elements: { textContent: string; style: object; setAttribute: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[] = [];
  const doc = { activeElement: null as unknown, createElement() {
    const element = { textContent: "", style: {}, setAttribute: vi.fn(), remove: vi.fn() };
    elements.push(element); return element;
  } };
  vi.stubGlobal("document", doc);
  const container = Object.assign(new EventTarget(), { dataset: {} as Record<string, string>, append: vi.fn(), appendChild: vi.fn() });
  const character = createCharacter(new Group(), ["Idle", "Walk", "Run"].map(name => new AnimationClip(name, 1, [])));
  const railing = createCoastRailing();
  const position = new Vector3(railing.target!.position.x, railing.target!.position.y, railing.target!.position.z);
  const camera = new PerspectiveCamera(55, 16 / 9, .1, 1000);
  camera.position.copy(position).add(new Vector3(0, 6, 8));
  let enabled = true, reduced = false;
  const clearInput = vi.fn();
  const lookout = createRailingLookout({ container: container as unknown as HTMLElement, character, camera,
    target: railing.target, forward: railing.forward, player: () => position, moveTo: p => position.copy(p),
    enabled: () => enabled, reducedMotion: () => reduced, locale: () => "vi", clearInput });
  return { lookout, doc, elements, container, position, camera, clearInput,
    disable() { enabled = false; }, reduce() { reduced = true; },
    dispose() { lookout.dispose(); character.dispose(); railing.dispose(); }, target: railing.target! };
}

describe("RD-01 keyboard lookout", () => {
  it("steps from the reachable hint to the rail while keeping feet on the road", () => {
    const s = setup();
    const hint = s.position.clone();
    expect(s.lookout.begin()).toBe(true);
    expect(Math.hypot(s.position.x - hint.x, s.position.z - hint.z)).toBeCloseTo(.4);
    expect(s.position.y - HEIGHT).toBeCloseTo(surfaceHeight(s.position.x, s.position.z) + ROAD_LIFT);
    expect(s.lookout.keydown({ code: "KeyE" })).toBe(true);
    expect(s.lookout.begin()).toBe(true);
    expect(Math.hypot(s.position.x - hint.x, s.position.z - hint.z)).toBeCloseTo(.4);
    s.dispose();
  });
  it.each(["KeyE", "Escape", "KeyW", "KeyA", "KeyS", "KeyD"])("enters with nearest-target E and exits with %s", code => {
    const s = setup();
    const interaction = createInteraction({ container: s.container as unknown as HTMLElement, targets: [s.target],
      player: () => s.position, enabled: () => true, visit: vi.fn(), locale: () => "vi", lookout: () => s.lookout.begin() });
    interaction.update();
    expect(s.elements.at(-1)!.textContent).toBe("E — Ngắm biển");
    expect(interaction.keydown({ code: "KeyE" })).toBe(true);
    expect(s.container.dataset.worldLean).toBe("on");
    expect(s.lookout.keydown({ code })).toBe(code === "KeyE" || code === "Escape");
    expect(s.lookout.active).toBe(false);
    expect(s.container.dataset.worldLean).toBeUndefined();
    interaction.dispose(); s.dispose();
  });

  it("rejects distant activation, preserves focused typing/repeats, cancels on pause, and restores camera", () => {
    const s = setup();
    s.position.x += 4; expect(s.lookout.begin()).toBe(false); s.position.x -= 4;
    expect(s.lookout.begin()).toBe(true);
    s.doc.activeElement = { closest: () => ({}) };
    expect(s.lookout.keydown({ code: "KeyE" })).toBe(false);
    s.doc.activeElement = null;
    expect(s.lookout.keydown({ code: "KeyE", repeat: true })).toBe(false);
    const gameplay = s.camera.position.clone();
    s.lookout.update(.1);
    expect(s.camera.position.distanceTo(gameplay)).toBeGreaterThan(0);
    s.disable(); s.lookout.update(.1);
    expect(s.lookout.active).toBe(false);
    for (let i = 0; i < 8; i++) { s.camera.position.copy(gameplay); s.lookout.update(.1); }
    expect(s.camera.position.distanceTo(gameplay)).toBe(0);
    s.dispose();
    expect(s.elements.every(element => element.remove.mock.calls.length === 1)).toBe(true);
    expect(s.lookout.begin()).toBe(false);
  });

  it("reduced motion snaps to a stable framing and leaves both figure and sunset inside landscape view", () => {
    const s = setup(); s.reduce(); s.lookout.begin(); s.lookout.update(.1);
    const before = s.camera.position.clone(), rotation = s.camera.quaternion.clone();
    s.lookout.update(.1);
    expect(s.camera.position.equals(before)).toBe(true);
    expect(s.camera.quaternion.equals(rotation)).toBe(true);
    s.camera.updateMatrixWorld();
    const figure = s.position.clone().add(new Vector3(0, .4, 0)).project(s.camera);
    const sun = s.position.clone().add(new Vector3(.8, Math.tan(3.5 * Math.PI / 180), -.6).multiplyScalar(500)).project(s.camera);
    for (const p of [figure, sun]) { expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1); }
    s.dispose();
  });
});

describe("HZ-02 Horizon bench lookout", () => {
  it.each(["KeyE", "Escape", "KeyW", "KeyA", "KeyS", "KeyD"])("shows English 'E — Sit and watch', sits on E, and stands up outside the bench collider on %s", async code => {
    const s = setup();
    const bench = resolveHorizonBench(surfaceHeight);
    const targets: InteractionTarget[] = [s.target, s.lookout.benchTarget];
    s.position.copy(bench.stand);
    const interaction = createInteraction({
      container: s.container as unknown as HTMLElement, targets,
      player: () => s.position, enabled: () => true, visit: vi.fn(),
      locale: () => "vi", lookout: target => s.lookout.begin(target),
    });
    interaction.update();
    expect(s.elements.at(-1)!.textContent).toBe("E — Sit and watch");
    expect(s.lookout.positionFor()).toEqual({ x: bench.stand.x, y: bench.stand.y, z: bench.stand.z });
    expect(interaction.keydown({ code: "KeyE" })).toBe(true);
    expect(s.lookout.active).toBe(true);
    expect(s.lookout.mode).toBe("bench");
    expect(s.container.dataset.worldLean).toBe("on");
    expect(s.position.distanceTo(bench.seat)).toBeLessThan(1e-5);
    expect(s.lookout.keydown({ code })).toBe(code === "KeyE" || code === "Escape");
    expect(s.lookout.active).toBe(false);
    expect(s.container.dataset.worldLean).toBeUndefined();
    expect(s.position.distanceTo(bench.stand)).toBeLessThan(1e-5);
    const [horizon] = placeZoneScenes(surfaceHeight, ["horizon"]);
    try {
      const benchBox = new Box3().setFromObject(horizon!.boxes[1]!);
      expect(benchBox.containsPoint(s.position)).toBe(false);
    } finally {
      horizon?.dispose();
    }
    interaction.dispose(); s.dispose();
  });

  it("frames both the seated figure and the seaward overlook in reduced motion", () => {
    const s = setup();
    const bench = resolveHorizonBench(surfaceHeight);
    s.reduce();
    s.position.copy(bench.stand);
    s.camera.position.copy(bench.stand).add(new Vector3(0, 4, 6));
    expect(s.lookout.begin(s.lookout.benchTarget)).toBe(true);
    s.lookout.update(.1);
    const before = s.camera.position.clone(), rotation = s.camera.quaternion.clone();
    s.lookout.update(.1);
    expect(s.camera.position.equals(before)).toBe(true);
    expect(s.camera.quaternion.equals(rotation)).toBe(true);
    s.camera.updateMatrixWorld();
    const camDir = new Vector3();
    s.camera.getWorldDirection(camDir);
    expect(camDir.dot(bench.forward)).toBeGreaterThan(0.8);
    const toCamera = s.camera.position.clone().sub(bench.seat);
    expect(toCamera.dot(bench.forward)).toBeLessThan(0);
    const horizDist = Math.hypot(toCamera.x, toCamera.z);
    expect(horizDist).toBeGreaterThanOrEqual(2.5);
    expect(horizDist).toBeLessThanOrEqual(3.5);
    const seatSurfaceY = surfaceHeight(bench.seat.x, bench.seat.z) + 0.45;
    const heightAboveSeat = s.camera.position.y - seatSurfaceY;
    expect(heightAboveSeat).toBeGreaterThanOrEqual(1.6);
    expect(heightAboveSeat).toBeLessThanOrEqual(2.0);

    const figure = s.position.clone().add(new Vector3(0, -.1, 0)).project(s.camera);
    const overlook = bench.seat.clone().addScaledVector(bench.forward, 18).add(new Vector3(0, .25, 0)).project(s.camera);
    for (const p of [figure, overlook]) {
      expect(Math.abs(p.x)).toBeLessThan(1);
      expect(Math.abs(p.y)).toBeLessThan(1);
    }
    s.dispose();
  });
});
