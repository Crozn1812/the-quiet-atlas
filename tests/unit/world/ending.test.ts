import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createEnding, ENDING_DURATION, type EndingOptions } from "../../../src/features/world/cinematic/ending";
import { createEndingController, ENDING_REDUCED_MOTION_DURATION } from "../../../src/features/world/cinematic/ending-controller";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";

function onGround(point: Readonly<Vector3>): Vector3 {
  return new Vector3(point.x, worldHeight(point.x, point.z), point.z);
}

const bench = onGround(ZONES.find(zone => zone.id === "quiet-shore")!.position);
const postcard = onGround(ZONES.find(zone => zone.id === "last-postcard")!.position);
const player = onGround(pathPointAt(0.997));
const options: EndingOptions = {
  bench,
  gameplayPose: {
    position: player.clone().add(new Vector3(0, 7, 10)),
    target: player.clone().add(new Vector3(0, 1.3, 0)),
    fov: 55,
  },
};

describe("ending camera route", () => {
  it("lasts 36 seconds, opens at the bench, reveals the coast and holds on Last Postcard", () => {
    const ending = createEnding(options);
    expect(ending.duration).toBe(36);
    expect(ending.duration).toBeGreaterThanOrEqual(30);
    expect(ending.duration).toBeLessThanOrEqual(45);
    const opening = ending.sample(0);
    expect(opening.position.distanceTo(bench)).toBeLessThanOrEqual(6);
    expect(opening.target.distanceTo(bench)).toBeLessThan(2);
    expect(opening.target.z).toBeLessThan(bench.z); // Seated subject faces the sea.
    const wide = ending.sample(17);
    expect(wide.position.y).toBeGreaterThan(opening.position.y + 8);
    expect(wide.position.distanceTo(bench)).toBeGreaterThan(opening.position.distanceTo(bench));
    expect(wide.fov).toBeGreaterThan(opening.fov);
    expect(wide.target.z).toBeLessThan(bench.z);
    expect(ending.sample(23).position.z).toBeLessThan(wide.position.z);
    expect(ending.sample(29).position).toEqual(ending.sample(31).position);
    expect(ending.sample(29).target).toEqual(postcard);
    expect(ending.sample(29).sunsetBoost).toBe(1);

    const final = ending.finalFrame();
    expect(final.position).toEqual(options.gameplayPose.position);
    expect(final.target).toEqual(options.gameplayPose.target);
    expect(final.fov).toBe(options.gameplayPose.fov);
    const angle = final.target.clone().sub(final.position).angleTo(postcard.clone().sub(final.position));
    expect(angle).toBeLessThanOrEqual(25 * Math.PI / 180);
    expect(final).toMatchObject({ sunsetBoost: 0, mistBoost: 0, letterbox: 0, paperOpacity: 0 });
  });

  it("keeps every 60 Hz frame safe, finite and smooth, including alternate benches and a floor-level handoff", () => {
    const alternate = onGround(bench.clone().add(new Vector3(-4, 0, 3)));
    const lowCamera = new Vector3(postcard.x + 2, 0, postcard.z + 5);
    lowCamera.y = Math.max(worldHeight(lowCamera.x, lowCamera.z) + 0.8, waterLevelAt(lowCamera.z));
    const cases: EndingOptions[] = [
      options,
      { ...options, bench: alternate },
      { ...options, gameplayPose: { position: lowCamera, target: postcard, fov: 60 } },
    ];
    for (const input of cases) {
      const ending = createEnding(input);
      let previous = ending.sample(0);
      let velocity = new Vector3();
      let targetVelocity = new Vector3();
      let maxVelocityChange = 0;
      let maxTargetVelocityChange = 0;
      for (let i = 0; i <= (ENDING_DURATION + 1) * 60; i++) {
        const frame = ending.sample(i / 60);
        expect([...frame.position, ...frame.target, frame.fov].every(Number.isFinite)).toBe(true);
        expect(frame.position.distanceTo(frame.target)).toBeGreaterThan(0.1);
        expect(frame.position.y).toBeGreaterThanOrEqual(worldHeight(frame.position.x, frame.position.z) + 0.8);
        expect(frame.position.y).toBeGreaterThanOrEqual(waterLevelAt(frame.position.z));
        for (const value of [frame.sunsetBoost, frame.mistBoost, frame.letterbox, frame.paperOpacity]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        const nextVelocity = frame.position.clone().sub(previous.position).multiplyScalar(60);
        const nextTargetVelocity = frame.target.clone().sub(previous.target).multiplyScalar(60);
        maxVelocityChange = Math.max(maxVelocityChange, velocity.distanceTo(nextVelocity));
        maxTargetVelocityChange = Math.max(maxTargetVelocityChange, targetVelocity.distanceTo(nextTargetVelocity));
        previous = frame;
        velocity = nextVelocity;
        targetVelocity = nextTargetVelocity;
      }
      expect(maxVelocityChange).toBeLessThan(1);
      expect(maxTargetVelocityChange).toBeLessThan(1);
      // Also probe the near-endpoint where quintic easing rounds to exactly one.
      expect(Number.isFinite(ending.sample(ENDING_DURATION - 1e-8).position.y)).toBe(true);
    }
  });

  it("has matching velocities at shot boundaries and no horizontal spline overshoot", () => {
    const ending = createEnding(options);
    const boundaries = [0, 5, 17, 29, 32, 36];
    const h = 0.001;
    for (const time of boundaries) {
      const before = ending.sample(time - h);
      const at = ending.sample(time);
      const after = ending.sample(time + h);
      for (const key of ["position", "target"] as const) {
        const left = at[key].clone().sub(before[key]).divideScalar(h);
        const right = after[key].clone().sub(at[key]).divideScalar(h);
        expect(left.distanceTo(right)).toBeLessThan(0.001);
      }
    }
    for (let i = 1; i < boundaries.length; i++) {
      const start = boundaries[i - 1]!;
      const end = boundaries[i]!;
      const from = ending.sample(start);
      const to = ending.sample(end);
      for (let step = 0; step <= 100; step++) {
        const frame = ending.sample(start + (end - start) * step / 100);
        for (const key of ["position", "target"] as const) {
          for (const axis of ["x", "z"] as const) {
            expect(frame[key][axis]).toBeGreaterThanOrEqual(Math.min(from[key][axis], to[key][axis]) - 1e-9);
            expect(frame[key][axis]).toBeLessThanOrEqual(Math.max(from[key][axis], to[key][axis]) + 1e-9);
          }
        }
      }
    }
  });

  it("lands on dry terrain within 10 metres and isolates every input/output vector", () => {
    const input = { bench: bench.clone(), gameplayPose: {
      position: options.gameplayPose.position.clone(), target: options.gameplayPose.target.clone(), fov: 55,
    } };
    const ending = createEnding(input);
    const expected = ending.sample(23.456);
    const landing = ending.finalPlayerPosition;
    expect(landing.y).toBe(worldHeight(landing.x, landing.z));
    expect(landing.y).toBeGreaterThan(waterLevelAt(landing.z));
    expect(landing.distanceTo(postcard)).toBeLessThanOrEqual(10);
    input.bench.setScalar(1000);
    input.gameplayPose.position.setScalar(1000);
    input.gameplayPose.target.setScalar(1000);
    ending.sample(23.456).position.setScalar(1000);
    ending.sample(23.456).target.setScalar(1000);
    ending.finalFrame().position.setScalar(1000);
    ending.finalFrame().target.setScalar(1000);
    ending.finalPlayerPosition.setScalar(1000);
    expect(ending.sample(23.456)).toEqual(expected);
    expect(ending.finalPlayerPosition).toEqual(landing);
    expect(ending.finalFrame()).toEqual(createEnding(options).finalFrame());
    expect(ending.sample(-10)).toEqual(ending.sample(0));
    expect(ending.sample(100)).toEqual(ending.finalFrame());
  });

  it("rejects invalid times, bench coordinates, unsafe handoffs and cameras aimed away from the postcard", () => {
    const ending = createEnding(options);
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => ending.sample(value)).toThrow(RangeError);
      expect(() => createEnding({ ...options, bench: new Vector3(value, 0, 0) })).toThrow(RangeError);
      for (const key of ["position", "target"] as const) {
        expect(() => createEnding({ ...options, gameplayPose: { ...options.gameplayPose, [key]: new Vector3(1, value, 1) } })).toThrow(RangeError);
      }
    }
    for (const fov of [NaN, Infinity, 0, -1, 180]) {
      expect(() => createEnding({ ...options, gameplayPose: { ...options.gameplayPose, fov } })).toThrow(RangeError);
    }
    const invalidPoses = [
      { ...options.gameplayPose, position: new Vector3(0, -10, -900) },
      { ...options.gameplayPose, target: options.gameplayPose.position },
      { ...options.gameplayPose, target: options.gameplayPose.position.clone().add(new Vector3(0, 0, 10)) },
    ];
    for (const gameplayPose of invalidPoses) expect(() => createEnding({ bench, gameplayPose })).toThrow(RangeError);
  });
});

describe("ending controller", () => {
  it("advances only while playing and completes at exactly 36 seconds with idempotent start", () => {
    const controller = createEndingController(options);
    expect(controller.state).toBe("idle");
    expect(controller.inputLocked).toBe(false);
    expect(controller.tick(50)).toEqual(createEnding(options).sample(0));
    expect(controller.elapsed).toBe(0);
    controller.start();
    expect(controller.state).toBe("playing");
    expect(controller.inputLocked).toBe(true);
    controller.tick(5);
    controller.start();
    expect(controller.elapsed).toBe(5);
    for (let i = 0; i < 31 * 60; i++) controller.tick(1 / 60);
    expect(controller.state).toBe("done");
    expect(controller.inputLocked).toBe(false);
    expect(controller.elapsed).toBe(ENDING_DURATION);
    expect(controller.tick(100)).toEqual(createEnding(options).finalFrame());
    expect(controller.start()).toEqual(createEnding(options).finalFrame());
  });

  it("skip before start or during any shot matches natural completion and returns fresh vectors", () => {
    const natural = createEndingController(options);
    natural.start();
    const expected = natural.tick(100);
    for (const time of [0, 1, 8, 23, 30, 35.99]) {
      const controller = createEndingController(options);
      if (time > 0) { controller.start(); controller.tick(time); }
      expect(controller.skip()).toEqual(expected);
      expect(controller.state).toBe("done");
      expect(controller.inputLocked).toBe(false);
      expect(controller.elapsed).toBe(controller.duration);
      expect(controller.tick(1)).toEqual(expected);
      controller.skip().position.setScalar(-1);
      controller.skip().target.setScalar(-1);
      controller.finalPlayerPosition.setScalar(-1);
      expect(controller.skip()).toEqual(expected);
      expect(controller.finalPlayerPosition).toEqual(natural.finalPlayerPosition);
    }
  });

  it("reduced motion only fades paper over 0.6 seconds with a fixed final pose", () => {
    const controller = createEndingController({ ...options, reducedMotion: true });
    expect(controller.duration).toBe(ENDING_REDUCED_MOTION_DURATION);
    expect(controller.duration).toBe(0.6);
    expect(controller.duration).toBeLessThanOrEqual(0.8);
    const final = createEnding(options).finalFrame();
    expect(controller.start()).toEqual({ ...final, paperOpacity: 1 });
    let opacity = 1;
    for (let i = 1; i <= 36; i++) {
      const frame = controller.tick(1 / 60);
      expect(frame).toEqual({ ...final, paperOpacity: frame.paperOpacity });
      expect(frame.paperOpacity).toBeGreaterThanOrEqual(0);
      expect(frame.paperOpacity).toBeLessThanOrEqual(opacity);
      expect(controller.inputLocked).toBe(i < 36);
      opacity = frame.paperOpacity;
    }
    expect(opacity).toBe(0);
    expect(controller.state).toBe("done");
    const skipped = createEndingController({ ...options, reducedMotion: true });
    skipped.start(); skipped.tick(0.3);
    expect(skipped.skip()).toEqual(final);
    expect(skipped.finalPlayerPosition).toEqual(controller.finalPlayerPosition);
  });

  it("is independent of tick partitioning and rejects invalid dt without advancing", () => {
    const a = createEndingController(options);
    const b = createEndingController(options);
    a.start(); b.start();
    a.tick(3); a.tick(4);
    expect(a.tick(0)).toEqual(b.tick(7));
    for (const dt of [-1, NaN, Infinity, -Infinity]) expect(() => a.tick(dt)).toThrow(RangeError);
    expect(a.elapsed).toBe(7);
    expect(a.state).toBe("playing");
    expect(a.tick(100)).toEqual(b.tick(100));
  });
});
