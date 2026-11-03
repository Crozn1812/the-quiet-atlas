import { expect, it } from "vitest";
import { canSimulate, initialSession, sessionReducer } from "../../../src/state/session";
it("requires world mode and every pause reason to clear", () => {
  let state = initialSession();
  expect(canSimulate(state)).toBe(false);
  state = sessionReducer(state, { type: "mode", mode: "world" });
  const original = state;
  for (const reason of ["overlay", "hiddenTab", "windowBlur", "error"] as const) state = sessionReducer(state, { type: "pause", reason, paused: true });
  expect(original.pauseReasons.size).toBe(0);
  for (const reason of ["overlay", "hiddenTab", "windowBlur"] as const) {
    state = sessionReducer(state, { type: "pause", reason, paused: false });
    expect(canSimulate(state)).toBe(false);
  }
  expect(canSimulate(state)).toBe(false);
  state = sessionReducer(state, { type: "pause", reason: "error", paused: false });
  expect(canSimulate(state)).toBe(true);
});
it("error mode pauses; recovery preserves unrelated reasons", () => {
  let state = sessionReducer(initialSession(), { type: "pause", reason: "overlay", paused: true });
  state = sessionReducer(state, { type: "mode", mode: "recoverableError" });
  expect(state.pauseReasons.has("error")).toBe(true);
  state = sessionReducer(state, { type: "mode", mode: "world" });
  expect([...state.pauseReasons]).toEqual(["overlay"]);
});

it("safe point is copied; recovery preserves secrets and zones", () => {
  let state = initialSession();
  state.sessionProgress.secrets = new Set(["reflection"]);
  state.sessionProgress.visitedZones = new Set(["roots"]);
  const point = { x: 2, y: 1, z: 3 };
  state = sessionReducer(state, { type: "safePosition", position: point });
  point.x = 99;
  const progress = state.sessionProgress;
  state = sessionReducer(state, { type: "mode", mode: "world" });
  state = sessionReducer(state, { type: "recover" });
  expect(state.position).toEqual({ x: 2, y: 1, z: 3 });
  expect(state.sessionProgress).toBe(progress);
  expect([...state.sessionProgress.secrets]).toEqual(["reflection"]);
  expect([...state.sessionProgress.visitedZones]).toEqual(["roots"]);
});