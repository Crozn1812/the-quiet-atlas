import { expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { initialVehicle, mount, step, vehiclePosition } from "../../../src/features/vehicle/model";
import { createVehicleControls } from "../../../src/features/world/vehicle/controls";
import { stepVehicleController } from "../../../src/features/world/vehicle/motion";
import { createController } from "../../../src/features/world/rapier";
import { HEIGHT, rotation, type Controller } from "../../../src/features/world/scene";

const corridor = { length: 100, halfWidthAt: () => 3,
  pointAt: (s: number) => ({ x: 0, z: s - 50 }), tangentAt: () => ({ x: 0, z: 1 }) };
const dt = 1 / 60;

it.each([-44, -30, -15, 0, 15, 30, 44])("holds a braked bike on a %s degree Rapier slope and releases for throttle/reverse", async degrees => {
  const controller = await createController(undefined, [], { streamed: true });
  try {
    const angle = degrees * Math.PI / 180;
    controller.world.createCollider(controller.RAPIER.ColliderDesc.cuboid(20, .2, 20)
      .setTranslation(0, -.2 / Math.cos(angle), 0).setRotation(rotation(angle)));
    controller.teleport({ x: 0, y: HEIGHT + .1, z: 0 });
    for (let i = 0; i < 120; i++) controller.step(0, 0, dt);
    expect(controller.grounded).toBe(true);
    let state = { ...mount(initialVehicle(corridor, 50 + controller.position.z), 0).state, speed: .5 };
    const controls = createVehicleControls();
    const advance = (input: { s?: boolean; w?: boolean }, frames: number) => {
      for (let i = 0; i < frames; i++) {
        const proposal = step(state, corridor, dt, controls.input(state, input));
        stepVehicleController(controller, state, proposal, vehiclePosition(proposal, corridor), dt);
        state = proposal;
      }
    };
    advance({ s: true }, 120);
    expect(state.speed).toBe(0);
    const stopped = controller.position.clone();
    advance({ s: true }, 300);
    expect(controller.position.distanceTo(stopped)).toBe(0);
    advance({}, 1);
    advance({ s: true }, 60);
    expect(state.speed).toBeLessThan(0);
    expect(controller.position.distanceTo(stopped)).toBeGreaterThan(.1);
    const reversed = controller.position.clone();
    advance({ w: true }, 180);
    expect(state.speed).toBeGreaterThan(0);
    expect(controller.position.distanceTo(reversed)).toBeGreaterThan(.1);
  } finally {
    controller.dispose();
  }
});

it("lets a stopped airborne bike settle before holding its ground contact", () => {
  const controller = { position: new Vector3(), grounded: false,
    step: vi.fn(), resetVelocity: vi.fn() } as unknown as Controller;
  const state = mount(initialVehicle(corridor, 50), 0).state;
  stepVehicleController(controller, state, state, vehiclePosition(state, corridor), dt);
  expect(controller.step).toHaveBeenCalledWith(0, 0, dt);
  expect(controller.resetVelocity).not.toHaveBeenCalled();
});
