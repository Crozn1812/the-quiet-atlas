import { expect, it } from "vitest";
import { Vector3 } from "three";
import { createIntro } from "../../../src/features/world/cinematic/intro";
import { createEnding } from "../../../src/features/world/cinematic/ending";
import { createIntroController } from "../../../src/features/world/cinematic/controller";
import { createEndingController } from "../../../src/features/world/cinematic/ending-controller";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { worldHeight } from "../../../src/features/world/terrain/height";

const introPose = { position: new Vector3(0, 20, 10), target: new Vector3(0, 3, 0), fov: 55 };
const bench = ZONES.find(zone => zone.id === "quiet-shore")!.position.clone();
bench.y = worldHeight(bench.x, bench.z);
const landing = pathPointAt(0.997);
landing.y = worldHeight(landing.x, landing.z);
const endingOptions = { bench, gameplayPose: {
  position: landing.clone().add(new Vector3(0, 7, 10)), target: landing, fov: 55,
} };

it("carries shot focus through every lens move and fades the C look to the exact gameplay pose", () => {
  for (const route of [createIntro(introPose), createEnding(endingOptions)]) {
    let previousStrength = 1;
    for (let time = 0; time < route.duration; time += 1 / 60) {
      const frame = route.sample(time);
      expect(frame.cinematic!.focus).toBeCloseTo(frame.position.distanceTo(frame.target), 10);
      expect(frame.cinematic!.strength).toBeGreaterThanOrEqual(0);
      expect(frame.cinematic!.strength).toBeLessThanOrEqual(previousStrength);
      previousStrength = frame.cinematic!.strength;
    }
    expect(route.finalFrame().cinematic).toBeUndefined();
    expect(route.sample(route.duration).cinematic).toBeUndefined();
    expect(previousStrength).toBeLessThan(0.00001);
  }
});

it("skips and reduced motion never carry a cinematic DOF/lighting override", () => {
  for (const reducedMotion of [false, true]) {
    const controllers = [
      createIntroController({ gameplayPose: introPose, reducedMotion }),
      createEndingController({ ...endingOptions, reducedMotion }),
    ];
    for (const controller of controllers) {
      if (reducedMotion) {
        expect(controller.start().cinematic).toBeUndefined();
        expect(controller.tick(controller.duration / 2).cinematic).toBeUndefined();
      } else {
        expect(controller.start().cinematic).toBeDefined();
      }
      expect(controller.skip().cinematic).toBeUndefined();
      expect(controller.inputLocked).toBe(false);
    }
  }
});
