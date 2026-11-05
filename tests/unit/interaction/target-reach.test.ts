import { expect, it } from "vitest";
import { INTERACTION_RADIUS, pickTarget, ZONE_CONTENT_REACH } from "../../../src/features/interaction/targets";

// B2-150: zone set-pieces stand ~4.7 m off the path; their own reach lets the path show their hint.
it("uses each target's reach, falls back to the shared radius, and still picks the nearest", () => {
  const player = { x: 0, y: 0, z: 0 };
  const far = { id: "zone", zoneId: "roots" as const, position: { x: 5, y: 0, z: 0 }, reach: ZONE_CONTENT_REACH };
  const sign = { id: "sign", zoneId: "roots" as const, position: { x: 3, y: 0, z: 0 } };
  const near = { id: "near", zoneId: "roots" as const, position: { x: 2, y: 0, z: 0 } };
  expect(pickTarget(player, [far, sign], INTERACTION_RADIUS)?.id).toBe("zone"); // sign at 3 m is beyond 2.5 m
  expect(pickTarget(player, [far, near], INTERACTION_RADIUS)?.id).toBe("near");
  expect(pickTarget(player, [{ ...far, position: { x: 7, y: 0, z: 0 } }], INTERACTION_RADIUS)).toBeNull();
  expect(pickTarget(player, [{ ...far, reach: Number.NaN }], INTERACTION_RADIUS)).toBeNull();
});
