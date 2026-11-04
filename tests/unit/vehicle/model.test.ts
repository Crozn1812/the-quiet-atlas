import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cancelCruise, dismount, initialVehicle, mount, step, toggleCruise, vehiclePosition,
  VEHICLE_LIMITS, type CruiseCancelReason, type VehicleCorridor, type VehicleInput,
  type VehicleState,
} from "../../../src/features/vehicle/model";
import { VEHICLE_LABELS } from "../../../src/features/vehicle/labels";

const straight: VehicleCorridor = {
  length: 1000,
  halfWidthAt: () => 3,
  pointAt: s => ({ x: 0, z: s }),
  tangentAt: () => ({ x: 0, z: 1 }),
};
const curved: VehicleCorridor = {
  length: 300,
  halfWidthAt: s => 0.5 + 2 * (1 + Math.sin(s / 3)),
  pointAt: s => ({ x: 50 * (1 - Math.cos(s / 50)), z: 50 * Math.sin(s / 50) }),
  // Deliberately unnormalised to exercise the world-space offset helper.
  tangentAt: s => ({ x: 2 * Math.sin(s / 50), z: 2 * Math.cos(s / 50) }),
};
const riding = (corridor = straight, s = 10): VehicleState =>
  mount(initialVehicle(corridor, s), 0).state;
const advance = (state: VehicleState, input: VehicleInput, frames = 300) => {
  for (let i = 0; i < frames; i++) state = step(state, straight, 1 / 60, input);
  return state;
};

describe("vehicle model", () => {
  it("starts a fresh walking session and clamps spawn within the corridor", () => {
    expect(initialVehicle(straight)).toEqual({
      mode: "walk", cruise: false, s: 0, lateral: 0, speed: 0, heading: 0,
    });
    expect(initialVehicle(straight, -5, 100)).toMatchObject({ s: 0, lateral: 2.5 });
    expect(initialVehicle(straight, 2000, -100)).toMatchObject({ s: 1000, lateral: -2.5 });
    const state = initialVehicle(straight);
    expect(toggleCruise(state)).toBe(state);
    expect(step(state, straight, 0.25, { w: true })).toBe(state);
  });

  it.each([0, 2])("mounts only within range, including distance %s", distance => {
    const initial = initialVehicle(straight);
    expect(mount(initial, distance)).toMatchObject({ ok: true, state: { mode: "ride" } });
    expect(initial.mode).toBe("walk");
    expect(mount(riding(), distance)).toMatchObject({ ok: false, reason: "already-riding" });
  });

  it.each([2.001, 10, -1, NaN, Infinity])("refuses invalid or distant mount %s", distance => {
    const state = initialVehicle(straight);
    expect(mount(state, distance)).toEqual({ ok: false, reason: "too-far", state });
  });

  it("accelerates smoothly, caps forward speed and coasts toward rest", () => {
    const start = riding();
    const first = step(start, straight, 0.1, { w: true });
    expect(first.speed).toBeCloseTo(VEHICLE_LIMITS.acceleration * 0.1);
    const fast = advance(start, { w: true });
    expect(fast.speed).toBe(8);
    expect(step(fast, straight, 0.1, {}).speed).toBeCloseTo(7.8);
    expect(advance(fast, {}).speed).toBe(0);
    expect(start).toEqual(riding());
  });

  it("S brakes forward motion before reversing slowly; S wins over W", () => {
    const fast = advance(riding(), { w: true });
    expect(step(fast, straight, 0.1, { s: true, w: true }).speed).toBeCloseTo(7.4);
    const reverse = advance(fast, { s: true });
    expect(reverse.speed).toBe(-1.5);
    expect(step(reverse, straight, 0.1, { w: true }).speed).toBeCloseTo(-0.9);
    expect(dismount(reverse, true)).toMatchObject({ ok: false, reason: "moving" });
  });

  it.each([straight, curved])("keeps seeded random motion inside corridor and speed limits", corridor => {
    let seed = 15015;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    let state = riding(corridor);
    for (let i = 0; i < 1000; i++) {
      if (random() < 0.04) state = toggleCruise(state);
      state = step(state, corridor, random() * 0.4, {
        w: random() < 0.7, s: random() < 0.15,
        a: random() < 0.5, d: random() < 0.5,
        obstacleAhead: random() < 0.2 ? random() * 8 : undefined,
      });
      expect(state.speed).toBeGreaterThanOrEqual(-1.5);
      expect(state.speed).toBeLessThanOrEqual(8);
      expect(state.s).toBeGreaterThanOrEqual(0);
      expect(state.s).toBeLessThanOrEqual(corridor.length);
      expect(Math.abs(state.lateral)).toBeLessThanOrEqual(
        Math.max(0, corridor.halfWidthAt(state.s) - 0.5),
      );
      expect(Number.isFinite(state.heading)).toBe(true);
    }
  });

  it("steers A/D symmetrically, clamps both edges, and stays still without speed", () => {
    const state = riding();
    expect(step(state, straight, 0.25, { d: true }).lateral).toBe(0);
    expect(advance(state, { w: true, d: true }).lateral).toBe(2.5);
    expect(advance(state, { w: true, a: true }).lateral).toBe(-2.5);
    expect(advance(state, { w: true, a: true, d: true }).lateral).toBe(0);
  });

  it("clamps lateral when the corridor narrows, including less than the margin", () => {
    const narrow = { ...straight, halfWidthAt: (s: number) => s > 10.1 ? 0.2 : 3 };
    const state = { ...riding(), speed: 8, lateral: 2.5 };
    expect(step(state, narrow, 0.1, { w: true }).lateral).toBe(0);
  });

  it("cruises at 5 along the curved tangent and ignores W and lateral steering", () => {
    const corridor = { ...curved, halfWidthAt: () => 3 };
    let state = toggleCruise({ ...riding(corridor), lateral: 0.1 });
    for (let i = 0; i < 180; i++) {
      state = step(state, corridor, 1 / 60, { w: true, d: true });
    }
    expect(state.cruise).toBe(true);
    expect(state.speed).toBe(5);
    expect(state.lateral).toBe(0.1);
    expect(state.heading).toBeCloseTo(state.s / 50);
    const point = curved.pointAt(state.s);
    const position = vehiclePosition(state, curved);
    expect(Math.hypot(position.x - point.x, position.z - point.z)).toBeCloseTo(0.1);
    expect(vehiclePosition({ ...state, cruise: false }, curved)).toEqual(position);
  });

  it("slows smoothly below 6m and stops immediately below 2m, even at dt=0", () => {
    const state = { ...toggleCruise(riding()), speed: 5 };
    const slowing = step(state, straight, 0.1, { obstacleAhead: 4 });
    expect(slowing.speed).toBeLessThan(5);
    expect(slowing.speed).toBeGreaterThan(0);
    for (const dt of [0, 1 / 60, 0.25]) {
      const stopped = step(state, straight, dt, { obstacleAhead: 1.99 });
      expect(stopped).toMatchObject({ cruise: true, speed: 0, s: state.s });
    }
    expect(step(state, straight, 0.1, { obstacleAhead: 7 }).speed).toBeCloseTo(5);
  });

  it("never crosses the obstacle stop buffer and resumes when the obstacle clears", () => {
    let state = { ...toggleCruise(riding()), speed: 8 };
    const obstacleS = state.s + 5;
    for (let i = 0; i < 600; i++) {
      state = step(state, straight, 1 / 60, { obstacleAhead: obstacleS - state.s });
      expect(state.s).toBeLessThanOrEqual(obstacleS - 2);
    }
    expect(state.speed).toBeLessThan(0.001);
    expect(advance(state, {}).speed).toBe(5);
    expect(step(state, straight, 0.1, { obstacleAhead: NaN }).speed).toBe(0);
  });

  const cancellations: [CruiseCancelReason, VehicleInput][] = [
    ["escape", { escape: true }], ["c", { c: true }],
    ["ui-open", { uiOpen: true }], ["blur", { blur: true }], ["brake", { s: true }],
  ];
  it.each(cancellations)("cancels %s immediately via input and explicit action", (reason, input) => {
    const state = { ...toggleCruise(riding()), speed: 5 };
    expect(step(state, straight, 0, input).cruise).toBe(false);
    expect(cancelCruise(state, reason).cruise).toBe(false);
    expect(state.cruise).toBe(true);
  });

  it.each([{ uiOpen: true }, { blur: true }])("UI/focus loss stops motion and cannot resume cruise", input => {
    const state = { ...toggleCruise(riding()), speed: 5 };
    const paused = step(state, straight, 0.25, { ...input, w: true, d: true });
    expect(paused).toMatchObject({ speed: 0, s: state.s, lateral: state.lateral, cruise: false });
    expect(step(paused, straight, 1 / 60, {})).toEqual(paused);
  });

  it("toggles cruise only when riding", () => {
    const state = riding();
    expect(toggleCruise(toggleCruise(state))).toEqual(state);
  });

  it.each([-1.5, -0.5, 0.5, 8])("blocks dismount while moving at %s", speed => {
    expect(dismount({ ...riding(), speed }, true)).toMatchObject({ ok: false, reason: "moving" });
  });

  it("requires safe ground and clears cruise and velocity on successful dismount", () => {
    const state = { ...toggleCruise(riding()), speed: 0.49 };
    expect(dismount(state, false)).toEqual({ ok: false, state, reason: "unsafe-ground" });
    expect(dismount(state, true)).toMatchObject({
      ok: true, state: { mode: "walk", cruise: false, speed: 0, s: state.s },
    });
    expect(dismount({ ...state, speed: -0.49 }, true).ok).toBe(true);
    expect(dismount(initialVehicle(straight), true)).toMatchObject({ ok: false, reason: "not-riding" });
    expect(state.mode).toBe("ride");
  });

  it("stops at both ends of the corridor", () => {
    expect(step({ ...riding(straight, 999.99), speed: 8 }, straight, 0.25, { w: true }))
      .toMatchObject({ s: 1000, speed: 0 });
    expect(step({ ...riding(straight, 0.01), speed: -1.5 }, straight, 0.25, { s: true }))
      .toMatchObject({ s: 0, speed: 0 });
  });

  it("caps long frames and ignores invalid dt while still processing cancellation", () => {
    const state = riding();
    expect(step(state, straight, 100, { w: true })).toEqual(step(state, straight, 0.25, { w: true }));
    for (const dt of [-1, NaN, Infinity, 0]) {
      expect(step(state, straight, dt, { w: true })).toEqual(state);
      expect(step(toggleCruise(state), straight, dt, { escape: true }).cruise).toBe(false);
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
