import { expect, it } from "vitest";
import { inputToMoveVector, RUN_SPEED, WALK_SPEED } from "../../../src/features/interaction/movement";

for (const [degrees, x, z] of [[0, 0, -1], [90, -1, 0], [180, 0, 1], [270, 1, 0]] as const) {
  it(`camera yaw ${degrees}: WASD rotates together`, () => {
    const yaw = degrees * Math.PI / 180;
    for (const [key, expectedX, expectedZ] of [
      ["KeyW", x, z],
      ["KeyS", -x, -z],
      ["KeyD", -z, x],
      ["KeyA", z, -x],
    ] as const) {
      const move = inputToMoveVector(new Set([key]), yaw, false);
      expect(move.x).toBeCloseTo(expectedX * WALK_SPEED);
      expect(move.z).toBeCloseTo(expectedZ * WALK_SPEED);
    }
  });
}
it("normalizes diagonals and uses named running speed", () => {
  const move = inputToMoveVector(new Set(["KeyW", "KeyD"]), 0, true);
  expect(Math.hypot(move.x, move.z)).toBeCloseTo(RUN_SPEED);
  expect(inputToMoveVector(new Set(["KeyW", "KeyS"]), 0, false)).toEqual({ x: 0, z: 0 });
});