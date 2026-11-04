import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { createIntro, INTRO_DURATION, type CameraPose } from "../../../src/features/world/cinematic/intro";
import { createIntroController, REDUCED_MOTION_DURATION } from "../../../src/features/world/cinematic/controller";
import { RIVER_CONTROL_POINTS, riverPointAt } from "../../../src/features/world/layout/river";
import { ZONES } from "../../../src/features/world/layout/zones";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";

const spawn = ZONES.find(zone => zone.id === "first-light")!.position;
const spawnHeight = worldHeight(spawn.x, spawn.z);
const gameplay: CameraPose = {
  position: new Vector3(spawn.x, spawnHeight + 7, spawn.z + 10),
  target: new Vector3(spawn.x, spawnHeight + 1.3, spawn.z),
  fov: 55,
};

function expectGameplay(frame: CameraPose) {
  expect(frame.position.distanceTo(gameplay.position)).toBeLessThan(1e-3);
  expect(frame.target.distanceTo(gameplay.target)).toBeLessThan(1e-3);
  expect(frame.fov).toBe(gameplay.fov);
}

describe("intro camera route", () => {
  it("lasts 18–24 seconds and frames four alternating river bends from near vertical", () => {
    const intro = createIntro(gameplay);
    expect(intro.duration).toBeGreaterThanOrEqual(18);
    expect(intro.duration).toBeLessThanOrEqual(24);
    const first = intro.sample(0);
    expect(first.position.y).toBeGreaterThanOrEqual(120);
    const direction = first.target.clone().sub(first.position).normalize();
    expect(direction.dot(new Vector3(0, -1, 0))).toBeGreaterThan(Math.cos(5 * Math.PI / 180));
    const camera = new PerspectiveCamera(first.fov, 1, 0.1, 2000);
    camera.position.copy(first.position);
    camera.lookAt(first.target);
    camera.updateMatrixWorld();
    // Four alternating extrema describe two S bends, inside a square viewport.
    for (const [x, z] of RIVER_CONTROL_POINTS.slice(1, 5)) {
      const projected = new Vector3(x, waterLevelAt(z), z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.95);
      expect(Math.abs(projected.y)).toBeLessThan(0.95);
      expect(projected.z).toBeGreaterThan(-1);
      expect(projected.z).toBeLessThan(1);
    }
  });

  it("descends along the river toward spawn, builds mist, and holds a 1–2 m detail shot", () => {
    const intro = createIntro(gameplay);
    let previousHeight = Infinity;
    let previousProgress = Infinity;
    let previousMist = -1;
    for (let t = 2; t <= 15; t += 0.1) {
      const frame = intro.sample(t);
      const river = nearestRiver(frame.position.x, frame.position.z);
      expect(river.distance).toBeLessThan(20.1);
      expect(river.t).toBeLessThanOrEqual(previousProgress + 1e-4);
      expect(frame.position.y).toBeLessThanOrEqual(previousHeight + 1e-6);
      expect(frame.mistBoost).toBeGreaterThanOrEqual(previousMist);
      previousHeight = frame.position.y;
      previousProgress = river.t;
      previousMist = frame.mistBoost;
    }
    for (let i = 0; i <= 120; i++) {
      const frame = intro.sample(15 + i / 60);
      const heightAboveWater = frame.position.y - waterLevelAt(frame.position.z);
      expect(heightAboveWater).toBeGreaterThanOrEqual(1);
      expect(heightAboveWater).toBeLessThanOrEqual(2);
      expect(frame.position.distanceTo(new Vector3(spawn.x, frame.position.y, spawn.z))).toBeLessThan(12);
      expect(frame.mistBoost).toBe(1);
    }
    expectGameplay(intro.sample(intro.duration));
    expect(intro.sample(intro.duration).letterbox).toBe(0);
    expect(intro.sample(intro.duration).mistBoost).toBe(0);
  });

  it("keeps every 60 Hz sample safe, finite and smooth through the handoff", () => {
    const intro = createIntro(gameplay);
    const dt = 1 / 60;
    let previous = intro.sample(0);
    let previousVelocity = new Vector3();
    let maxVelocityChange = 0;
    for (let i = 0; i <= (INTRO_DURATION + 1) * 60; i++) {
      const frame = intro.sample(i * dt);
      expect([...frame.position, ...frame.target, frame.fov].every(Number.isFinite)).toBe(true);
      expect(frame.position.distanceTo(frame.target)).toBeGreaterThan(0.1);
      expect(frame.position.y).toBeGreaterThanOrEqual(worldHeight(frame.position.x, frame.position.z) + 0.8);
      expect(frame.position.y).toBeGreaterThanOrEqual(waterLevelAt(frame.position.z));
      for (const value of [frame.mistBoost, frame.letterbox, frame.paperOpacity]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      const velocity = frame.position.clone().sub(previous.position).divideScalar(dt);
      maxVelocityChange = Math.max(maxVelocityChange, velocity.distanceTo(previousVelocity));
      previous = frame;
      previousVelocity = velocity;
    }
    // Vector delta catches abrupt turns as well as speed jumps; 1 m/s per 60 Hz step.
    expect(maxVelocityChange).toBeLessThan(1);
  });

  it("is deterministic, clamps finite times, and isolates input/output mutations", () => {
    const input = { position: gameplay.position.clone(), target: gameplay.target.clone(), fov: gameplay.fov };
    const intro = createIntro(input);
    input.position.setScalar(-1000);
    input.target.setScalar(-1000);
    const expected = intro.sample(12.345);
    intro.sample(5).position.setScalar(0);
    expect(intro.sample(12.345)).toEqual(expected);
    expect(intro.sample(-10)).toEqual(intro.sample(0));
    expectGameplay(intro.sample(100));
    const end = intro.finalFrame();
    end.position.setScalar(-1000);
    end.target.setScalar(-1000);
    expectGameplay(intro.finalFrame());
    expectGameplay(createIntro(gameplay).sample(INTRO_DURATION));
  });

  it("accepts safe alternate handoffs and rejects unsafe/invalid poses and times", () => {
    for (const [x, z] of [[spawn.x - 6, spawn.z + 5], [spawn.x + 12, spawn.z - 8]] as const) {
      const pose = { ...gameplay, position: new Vector3(x, worldHeight(x, z) + 0.8, z) };
      const intro = createIntro(pose);
      expect(intro.sample(INTRO_DURATION).position).toEqual(pose.position);
      for (let i = 0; i <= INTRO_DURATION * 60; i++) {
        const { position } = intro.sample(i / 60);
        expect(position.y).toBeGreaterThanOrEqual(worldHeight(position.x, position.z) + 0.8);
        expect(position.y).toBeGreaterThanOrEqual(waterLevelAt(position.z));
      }
    }
    const river = riverPointAt(0.1);
    expect(() => createIntro({ ...gameplay, position: new Vector3(river.x, waterLevelAt(river.z) - 1, river.z) })).toThrow(RangeError);
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => createIntro(gameplay).sample(value)).toThrow(RangeError);
      expect(() => createIntro({ ...gameplay, position: new Vector3(value, 1, 1) })).toThrow(RangeError);
      expect(() => createIntro({ ...gameplay, target: new Vector3(1, value, 1) })).toThrow(RangeError);
    }
    for (const fov of [NaN, Infinity, 0, 180, -1]) expect(() => createIntro({ ...gameplay, fov })).toThrow(RangeError);
    expect(() => createIntro({ ...gameplay, target: gameplay.position })).toThrow(RangeError);
  });
});

describe("intro controller", () => {
  it("only advances while playing, locks gameplay, and completes at exactly 22 seconds", () => {
    const controller = createIntroController({ gameplayPose: gameplay });
    expect(controller.state).toBe("idle");
    expect(controller.inputLocked).toBe(false);
    expect(controller.tick(50)).toEqual(createIntro(gameplay).sample(0));
    expect(controller.elapsed).toBe(0);
    controller.start();
    expect(controller.state).toBe("playing");
    expect(controller.inputLocked).toBe(true);
    controller.tick(5);
    controller.start();
    expect(controller.elapsed).toBe(5);
    for (let i = 0; i < 17 * 60; i++) controller.tick(1 / 60);
    expect(controller.state).toBe("done");
    expect(controller.elapsed).toBe(INTRO_DURATION);
    expect(controller.inputLocked).toBe(false);
    expectGameplay(controller.tick(0));
    expectGameplay(controller.tick(100));
    expectGameplay(controller.start());
  });

  it("makes skip and natural completion identical, including before start and repeated skip", () => {
    const natural = createIntroController({ gameplayPose: gameplay });
    natural.start();
    const expected = natural.tick(100);
    for (const time of [0, 1, 10, 16, 21.99]) {
      const skipped = createIntroController({ gameplayPose: gameplay });
      if (time > 0) { skipped.start(); skipped.tick(time); }
      expect(skipped.skip()).toEqual(expected);
      expect(skipped.state).toBe("done");
      expect(skipped.inputLocked).toBe(false);
      expect(skipped.tick(1)).toEqual(expected);
      skipped.skip().position.setScalar(-1);
      expect(skipped.skip()).toEqual(expected);
    }
    expect(createIntroController({ gameplayPose: gameplay }).state).toBe("idle");
  });

  it("reduced motion uses only a 0.4 second paper fade with a fixed gameplay pose", () => {
    const controller = createIntroController({ gameplayPose: gameplay, reducedMotion: true });
    expect(controller.duration).toBe(REDUCED_MOTION_DURATION);
    expect(controller.duration).toBeLessThanOrEqual(0.5);
    expect(controller.start().paperOpacity).toBe(1);
    let opacity = 1;
    for (let i = 1; i <= 24; i++) {
      const frame = controller.tick(1 / 60);
      expectGameplay(frame);
      expect(frame.letterbox).toBe(0);
      expect(frame.mistBoost).toBe(0);
      expect(frame.paperOpacity).toBeLessThanOrEqual(opacity);
      opacity = frame.paperOpacity;
      expect(controller.inputLocked).toBe(i < 24);
    }
    expect(opacity).toBe(0);
    expect(controller.state).toBe("done");
    const skipped = createIntroController({ gameplayPose: gameplay, reducedMotion: true });
    skipped.start();
    expect(skipped.skip()).toEqual(controller.tick(0));
  });

  it("is independent of tick partitioning and rejects invalid dt without advancing", () => {
    const a = createIntroController({ gameplayPose: gameplay });
    const b = createIntroController({ gameplayPose: gameplay });
    a.start(); b.start();
    a.tick(3); a.tick(4);
    expect(a.tick(0)).toEqual(b.tick(7));
    for (const dt of [-1, NaN, Infinity, -Infinity]) expect(() => a.tick(dt)).toThrow(RangeError);
    expect(a.elapsed).toBe(7);
    expect(a.state).toBe("playing");
  });
});
