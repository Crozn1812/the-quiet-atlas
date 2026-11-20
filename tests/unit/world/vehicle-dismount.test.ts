import { expect, it } from "vitest";
import { initialVehicle, mount } from "../../../src/features/vehicle/model";
import { requestDismount } from "../../../src/features/world/vehicle/dismount";

it.each([0, Math.PI / 2, -Math.PI / 2, Math.PI])("steps beside the actual heading %s and preserves the parked coordinates", heading => {
  const state = mount(initialVehicle({ x: 37, z: -200 }, heading), 0).state;
  const result = requestDismount(state, {
    surfaceHeight: () => 4, waterLevelAt: () => 0, contains: () => true, clear: () => true,
  }, "en");
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const dx = result.position!.x - state.x, dz = result.position!.z - state.z;
  expect(Math.hypot(dx, dz)).toBeCloseTo(.9);
  expect(dx * Math.sin(heading) + dz * Math.cos(heading)).toBeCloseTo(0);
  expect(result.state).toMatchObject({ x: 37, z: -200, heading, mode: "walk", speed: 0 });
});
