import { expect, it } from "vitest";
import { initialVehicle, mount, step, toggleCruise, type VehicleInput } from "../../../src/features/vehicle/model";
import { createVehicleControls } from "../../../src/features/world/vehicle/controls";


it("S brakes then reverses while held; explicit brake holds rest", () => {
  const controls = createVehicleControls();
  let state = { ...mount(initialVehicle({ x: 0, z: 20 }), 0).state, speed: 3 };
  const advance = (input: VehicleInput, frames = 120) => {
    for (let i = 0; i < frames; i++) state = step(state, 1 / 60, controls.input(input));
  };
  advance({ brake: true, w: true });
  expect(state.speed).toBe(0);
  const stopped = state.z;
  advance({ brake: true });
  expect(state.z).toBe(stopped);
  advance({}, 1);
  advance({ s: true });
  expect(state.speed).toBe(-1.5);
});

it.each([3, -1.5])("E brakes speed %s to zero despite held throttle/steering/cruise, then waits for the rider", speed => {
  const controls = createVehicleControls();
  let state = toggleCruise({ ...mount(initialVehicle({ x: 0, z: 20 }), 0).state, speed });
  controls.requestDismount();
  expect(controls.readyToDismount(state, false)).toBe(false);
  for (let i = 0; i < 120; i++) {
    state = step(state, 1 / 60, controls.input({ w: true, s: true, d: true }));
    expect(speed * state.speed).toBeGreaterThanOrEqual(0);
  }
  expect(state).toMatchObject({ speed: 0, x: 0, cruise: false });
  expect(controls.readyToDismount(state, true)).toBe(false);
  expect(controls.readyToDismount(state, false)).toBe(true);
  controls.finishDismount();
  expect(controls.dismountPending).toBe(false);
  controls.requestDismount();
  controls.reset();
  expect(controls.readyToDismount(state, false)).toBe(false);
});
