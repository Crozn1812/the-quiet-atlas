import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cancelCruise, dismount, initialVehicle, mount, step, toggleCruise, vehiclePosition,
  VEHICLE_LIMITS, type CruiseCancelReason, type VehicleInput,
  type VehicleState,
} from "../../../src/features/vehicle/model";
import { VEHICLE_LABELS } from "../../../src/features/vehicle/labels";

const riding = (z = 10): VehicleState => mount(initialVehicle({ x: 0, z }), 0).state;
const advance = (state: VehicleState, input: VehicleInput, frames = 300) => {
  for (let i = 0; i < frames; i++) state = step(state, 1 / 60, input);
  return state;
};

describe("vehicle model", () => {
  it("starts at absolute coordinates without a path constraint", () => {
    expect(initialVehicle()).toEqual({ mode: "walk", cruise: false, x: 0, z: 0, speed: 0, heading: 0 });
    expect(initialVehicle({ x: 100, z: -200 }, 1)).toMatchObject({ x: 100, z: -200, heading: 1 });
    const state = initialVehicle();
    expect(toggleCruise(state)).toBe(state);
    expect(step(state, .25, { w: true })).toBe(state);
  });

  it.each([0, 2])("mounts only within range, including distance %s", distance => {
    const initial = initialVehicle();
    expect(mount(initial, distance)).toMatchObject({ ok: true, state: { mode: "ride" } });
    expect(initial.mode).toBe("walk");
    expect(mount(riding(), distance)).toMatchObject({ ok: false, reason: "already-riding" });
  });

  it.each([2.001, 10, -1, NaN, Infinity])("refuses invalid or distant mount %s", distance => {
    const state = initialVehicle();
    expect(mount(state, distance)).toEqual({ ok: false, reason: "too-far", state });
  });

  it("accelerates smoothly, caps forward speed and coasts toward rest", () => {
    const start = riding();
    const first = step(start, 0.1, { w: true });
    expect(first.speed).toBeCloseTo(VEHICLE_LIMITS.acceleration * 0.1);
    const fast = advance(start, { w: true });
    expect(fast.speed).toBe(8);
    expect(step(fast, 0.1, {}).speed).toBeCloseTo(7.8);
    expect(advance(fast, {}).speed).toBe(0);
    expect(start).toEqual(riding());
  });

  it("S brakes forward motion before reversing slowly; S wins over W", () => {
    const fast = advance(riding(), { w: true });
    expect(step(fast, 0.1, { s: true, w: true }).speed).toBeCloseTo(7.4);
    const reverse = advance(fast, { s: true });
    expect(reverse.speed).toBe(-1.5);
    expect(step(reverse, 0.1, { w: true }).speed).toBeCloseTo(-0.9);
    expect(dismount(reverse, true)).toMatchObject({ ok: false, reason: "moving" });
  });

  it("turns symmetrically with bounded yaw, cannot pivot at rest and reverses steering", () => {
    const state = riding();
    expect(step(state, .25, { d: true }).heading).toBe(0);
    const a = advance(state, { w: true, a: true }, 60);
    const d = advance(state, { w: true, d: true }, 60);
    expect(a.x).toBeCloseTo(-d.x);
    expect(a.heading).toBeCloseTo(-d.heading);
    expect(a.heading).toBeGreaterThan(0);
    const fast = { ...state, speed: 8 };
    expect(step(fast, .1, { w: true, a: true }).heading).toBeCloseTo(VEHICLE_LIMITS.maxTurnRate * .1);
    expect(step({ ...state, speed: -1 }, .1, { s: true, a: true }).heading).toBeLessThan(0);
  });

  it("can drive over five metres sideways and beyond former path endpoints", () => {
    const state = { ...riding(), heading: Math.PI / 2 };
    const driven = advance(state, { w: true });
    expect(driven.x).toBeGreaterThan(20);
    expect(driven.z).toBeCloseTo(state.z);
    expect(advance(riding(999), { w: true }).z).toBeGreaterThan(1000);
    expect(advance(riding(0), { s: true }).z).toBeLessThan(0);
  });

  it("cruises along its current heading; A/D still steer the cruise (free roam, ADR 0020)", () => {
    const start = { ...riding(), x: 8, heading: .7 };
    const state = advance(toggleCruise(start), { w: true });
    expect(state.cruise).toBe(true);
    expect(state.speed).toBe(5);
    expect(state.heading).toBeCloseTo(.7);
    expect(Math.atan2(state.x - start.x, state.z - start.z)).toBeCloseTo(.7);
    const steered = advance(toggleCruise(start), { d: true });
    expect(steered.cruise).toBe(true);
    expect(steered.heading).toBeLessThan(.7);
    expect(vehiclePosition(state)).toEqual({ x: state.x, z: state.z });
  });

  it("slows smoothly below 6m and stops immediately below 2m, even at dt=0", () => {
    const state = { ...toggleCruise(riding()), speed: 5 };
    const slowing = step(state, 0.1, { obstacleAhead: 4 });
    expect(slowing.speed).toBeLessThan(5);
    expect(slowing.speed).toBeGreaterThan(0);
    for (const dt of [0, 1 / 60, 0.25]) {
      const stopped = step(state, dt, { obstacleAhead: 1.99 });
      expect(stopped).toMatchObject({ cruise: true, speed: 0, z: state.z });
    }
    expect(step(state, 0.1, { obstacleAhead: 7 }).speed).toBeCloseTo(5);
  });

  it("never crosses the obstacle stop buffer and resumes when the obstacle clears", () => {
    let state = { ...toggleCruise(riding()), speed: 8 };
    const obstacleS = state.z + 5;
    for (let i = 0; i < 600; i++) {
      state = step(state, 1 / 60, { obstacleAhead: obstacleS - state.z });
      expect(state.z).toBeLessThanOrEqual(obstacleS - 2);
    }
    expect(state.speed).toBeLessThan(0.001);
    expect(advance(state, {}).speed).toBe(5);
    expect(step(state, 0.1, { obstacleAhead: NaN }).speed).toBe(0);
  });

  const cancellations: [CruiseCancelReason, VehicleInput][] = [
    ["escape", { escape: true }], ["c", { c: true }],
    ["ui-open", { uiOpen: true }], ["blur", { blur: true }], ["brake", { s: true }],
  ];
  it.each(cancellations)("cancels %s immediately via input and explicit action", (reason, input) => {
    const state = { ...toggleCruise(riding()), speed: 5 };
    expect(step(state, 0, input).cruise).toBe(false);
    expect(cancelCruise(state, reason).cruise).toBe(false);
    expect(state.cruise).toBe(true);
  });

  it.each([{ uiOpen: true }, { blur: true }])("UI/focus loss stops motion and cannot resume cruise", input => {
    const state = { ...toggleCruise(riding()), speed: 5 };
    const paused = step(state, 0.25, { ...input, w: true, d: true });
    expect(paused).toMatchObject({ speed: 0, z: state.z, x: state.x, cruise: false });
    expect(step(paused, 1 / 60, {})).toEqual(paused);
  });

  it("toggles cruise only when riding", () => {
    const state = riding();
    expect(toggleCruise(toggleCruise(state))).toEqual(state);
  });

  it.each([-1.5, -0.5, 0.5, 8])("blocks dismount while moving at %s", speed => {
    expect(dismount({ ...riding(), speed }, true)).toMatchObject({ ok: false, reason: "moving" });
  });

  it("requires safe ground and clears cruise and velocity on successful dismount", () => {
    const state = { ...toggleCruise(riding()), speed: 0 };
    expect(dismount(state, false)).toEqual({ ok: false, state, reason: "unsafe-ground" });
    expect(dismount(state, true)).toMatchObject({
      ok: true, state: { mode: "walk", cruise: false, speed: 0, z: state.z },
    });
    expect(dismount({ ...state, speed: -0.49 }, true).ok).toBe(false);
    expect(dismount(initialVehicle(), true)).toMatchObject({ ok: false, reason: "not-riding" });
    expect(state.mode).toBe("ride");
  });

  it("caps long frames and ignores invalid dt while still processing cancellation", () => {
    const state = riding();
    expect(step(state, 100, { w: true })).toEqual(step(state, 0.25, { w: true }));
    for (const dt of [-1, NaN, Infinity, 0]) {
      expect(step(state, dt, { w: true })).toEqual(state);
      expect(step(toggleCruise(state), dt, { escape: true }).cruise).toBe(false);
    }
  });

  it("provides the requested short EN/VI hints", () => {
    expect(VEHICLE_LABELS).toEqual({
      en: { ride: "E — Ride", getOff: "E — Get off", cruise: "C — Cruise" },
      vi: { ride: "E — Lên xe", getOff: "E — Xuống xe", cruise: "C — Tự chạy" },
    });
  });

  it("keeps all vehicle source free of browser, persistence and rendering dependencies", () => {
    for (const file of readdirSync("src/features/vehicle")) {
      const source = readFileSync(`src/features/vehicle/${file}`, "utf8");
      for (const forbidden of ["localStorage", "sessionStorage", "document.cookie"]) {
        expect(source).not.toContain(forbidden);
      }
      expect(source).not.toMatch(/\b(?:document|window)\b|from\s+["'](?:three|react|@dimforge|.*world)/);
    }
  });
});
