import { expect, it } from "vitest";
import { initialVehicle, mount, step, toggleCruise, type VehicleInput } from "../../../src/features/vehicle/model";
import { createVehicleControls } from "../../../src/features/world/vehicle/controls";

const corridor = { length: 100, halfWidthAt: () => 3,
  pointAt: (s: number) => ({ x: 0, z: s }), tangentAt: () => ({ x: 0, z: 1 }) };

it("holds S at rest after braking; a fresh S press can reverse", () => {
  const controls = createVehicleControls();
  let state = { ...mount(initialVehicle(corridor, 20), 0).state, speed: 3 };
  const advance = (input: VehicleInput, frames = 120) => {
    for (let i = 0; i < frames; i++) state = step(state, corridor, 1 / 60, controls.input(state, input));
  };
  advance({ s: true, w: true });
  expect(state.speed).toBe(0);
  const stopped = state.s;
  advance({ s: true });
  expect(state.s).toBe(stopped);
  advance({}, 1);
  advance({ s: true });
  expect(state.speed).toBe(-1.5);
});

it.each([3, -1.5])("E brakes speed %s to zero despite held throttle/steering/cruise, then waits for the rider", speed => {
  const controls = createVehicleControls();
  let state = toggleCruise({ ...mount(initialVehicle(corridor, 20), 0).state, speed });
  controls.requestDismount();
  expect(controls.readyToDismount(state, false)).toBe(false);
  for (let i = 0; i < 120; i++) {
    state = step(state, corridor, 1 / 60, controls.input(state, { w: true, s: true, d: true }));
    expect(speed * state.speed).toBeGreaterThanOrEqual(0);
  }
  expect(state).toMatchObject({ speed: 0, lateral: 0, cruise: false });
  expect(controls.readyToDismount(state, true)).toBe(false);
  expect(controls.readyToDismount(state, false)).toBe(true);
  controls.finishDismount();
  expect(controls.dismountPending).toBe(false);
  controls.requestDismount();
  controls.reset();
  expect(controls.readyToDismount(state, false)).toBe(false);
});
