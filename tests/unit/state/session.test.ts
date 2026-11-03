import { expect, it } from "vitest";
import { canSimulate, initialSession, sessionReducer } from "../../../src/state/session";
it("requires world mode and every pause reason to clear", () => {
  let state = initialSession();
  expect(canSimulate(state)).toBe(false);
  state = sessionReducer(state, { type: "mode", mode: "world" });
  const original = state;
  for (const reason of ["overlay", "hiddenTab", "windowBlur", "error"] as const) state = sessionReducer(state, { type: "pause", reason, paused: true });
  expect(original.pauseReasons.size).toBe(0);
  for (const reason of ["overlay", "hiddenTab", "windowBlur"] as const) state = sessionReducer(state, { type: "pause", reason, paused: false });
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
