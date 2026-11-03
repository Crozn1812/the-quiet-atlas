import { expect, it } from "vitest";
import { createController } from "../../../src/features/world/rapier";
import { createLocomotion, FALL_Y } from "../../../src/features/world/locomotion";
import { FIXED_DT } from "../../../src/features/world/timestep";
import { HEIGHT } from "../../../src/features/world/scene";
import { initialSession, sessionReducer } from "../../../src/state/session";
import { inputReducer } from "../../../src/features/interaction/input";

it("recovers a fall and a blocked input without losing progress", async () => {
  const physics = await createController();
  try {
    const motion = createLocomotion(physics);
    let state = sessionReducer(initialSession(), { type: "mode", mode: "world" });
    state.sessionProgress.secrets = new Set(["reflection"]);
    state.sessionProgress.visitedZones = new Set(["roots"]);
    physics.teleport({ x: 0, y: FALL_Y - 1, z: 0 });
    state = motion.step(state, new Set(), 0, FIXED_DT);
    expect(physics.position).toMatchObject(state.sessionProgress.lastSafePosition);
    expect(physics.verticalVelocity).toBe(0);
    physics.teleport({ x: 3, y: HEIGHT + 0.02, z: -1.24 });
    for (let i = 0; i < 190; i++) state = motion.step(state, new Set(["KeyW"]), 0, FIXED_DT);
    expect(physics.position.z).toBeGreaterThan(3);
    expect([...state.sessionProgress.secrets]).toEqual(["reflection"]);
    expect([...state.sessionProgress.visitedZones]).toEqual(["roots"]);
  } finally {
    physics.dispose();
  }
});

for (const type of ["blur", "hidden"] as const) {
  it(`${type}: next simulation step has zero velocity and no held keys`, async () => {
    const physics = await createController();
    try {
      physics.teleport({ x: 0, y: 8, z: 4 });
      physics.step(0, 0, FIXED_DT);
      expect(physics.verticalVelocity).toBeLessThan(0);
      const keys = inputReducer(new Set(["KeyW", "ShiftLeft"]), { type });
      const state = sessionReducer(sessionReducer(initialSession(), { type: "mode", mode: "world" }), {
        type: "pause",
        reason: type === "blur" ? "windowBlur" : "hiddenTab",
        paused: true,
      });
      const before = physics.position.clone();
      createLocomotion(physics).step(state, keys, 0, FIXED_DT);
      expect(keys.size).toBe(0);
      expect(physics.verticalVelocity).toBe(0);
      expect(physics.position).toEqual(before);
    } finally {
      physics.dispose();
    }
  });
}

it("Rapier blocks the shared 60 degree ramp", async () => {
  const physics = await createController();
  try {
    physics.teleport({ x: -4, y: HEIGHT + 0.02, z: 4 });
    for (let i = 0; i < 240; i++) physics.step(0, -3, FIXED_DT);
    expect(physics.position.z).toBeGreaterThan(0.8);
    expect(physics.position.y).toBeLessThan(HEIGHT + 0.35);
  } finally {
    physics.dispose();
  }
});
it("records a stable valid ground point and snaps down the gentle ramp", async () => {
  const physics = await createController();
  try {
    const motion = createLocomotion(physics);
    let state = sessionReducer(initialSession(), { type: "mode", mode: "world" });
    for (let i = 0; i < 150; i++) state = motion.step(state, new Set(["KeyW"]), 0, FIXED_DT);
    expect(state.sessionProgress.lastSafePosition.z).toBeLessThan(0);
    const high = physics.position.y;
    let groundedSteps = 0;
    for (let i = 0; i < 80; i++) {
      state = motion.step(state, new Set(["KeyS"]), 0, FIXED_DT);
      if (physics.grounded) groundedSteps++;
    }
    expect(groundedSteps).toBeGreaterThan(75);
    expect(physics.position.y).toBeLessThan(high - 0.3);
    const safe = { ...state.sessionProgress.lastSafePosition };
    physics.teleport({ x: 0, y: FALL_Y - 1, z: 0 });
    state = motion.step(state, new Set(), 0, FIXED_DT);
    expect(physics.position).toMatchObject(safe);
  } finally {
    physics.dispose();
  }
});
it("Rapier blocks a forest trunk cylinder", async () => {
  const { createTerrain } = await import("../../../src/features/world/terrain");
  const physics = await createController(createTerrain(), [
    { x: 0, y: 0, z: 0, radius: 0.28, height: 4 },
  ]);
  try {
    for (let i = 0; i < 180; i++) {
      physics.step(0, -5, FIXED_DT);
      // Sliding around the cylinder is allowed; entering its volume is not.
      expect(Math.hypot(physics.position.x, physics.position.z)).toBeGreaterThan(0.61);
    }
  } finally {
    physics.dispose();
  }
});