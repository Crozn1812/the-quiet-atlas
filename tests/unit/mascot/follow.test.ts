import { describe, expect, it } from "vitest";
import { createMascotFollowState, stepMascotFollow, type FollowInput } from "../../../src/features/mascot/follow";

const input = (overrides: Partial<FollowInput> = {}): FollowInput => ({
  playerPosition: { x: 0, y: 0, z: 0 }, heading: 0, terrainHeight: () => 0, ...overrides,
});

describe("pure mascot follow", () => {
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])("sits behind the right shoulder at yaw %s", heading => {
    const state = createMascotFollowState(input({ heading }));
    const right = { x: Math.cos(heading), z: -Math.sin(heading) };
    const back = { x: Math.sin(heading), z: Math.cos(heading) };
    expect(Math.hypot(state.position.x, state.position.z)).toBeCloseTo(1.2);
    expect(state.position.x * right.x + state.position.z * right.z).toBeGreaterThan(0);
    expect(state.position.x * back.x + state.position.z * back.z).toBeGreaterThan(0);
    expect(state.position.y).toBe(1.6);
  });

  it.each([1 / 30, 1 / 60, 1 / 144, 0.7])("converges without more than 0.1 m overshoot at dt=%s", dt => {
    let state = createMascotFollowState(input());
    const moved = input({ playerPosition: { x: 3, y: 1, z: -2 } });
    const goal = createMascotFollowState(moved).position;
    for (let i = 0; i < Math.ceil(5 / dt); i++) {
      state = stepMascotFollow(state, moved, dt);
      expect(state.position.x).toBeLessThanOrEqual(goal.x + 0.1);
      expect(state.position.z).toBeGreaterThanOrEqual(goal.z - 0.1);
      expect(state.position.y).toBeLessThanOrEqual(goal.y + 0.1);
    }
    expect(state.position.x).toBeCloseTo(goal.x, 5);
    expect(state.position.z).toBeCloseTo(goal.z, 5);
    expect(Math.abs(state.position.y - goal.y)).toBeLessThanOrEqual(0.08);
  });

  it("uses the analytic critical response and does not mutate its inputs", () => {
    const state = createMascotFollowState(input());
    const snapshot = structuredClone(state);
    const moved = input({ playerPosition: { x: 1, y: 0, z: 0 } });
    const next = stepMascotFollow(state, moved, 0.1);
    expect(next.anchor.x - state.anchor.x).toBeCloseTo(1 - 1.8 * Math.exp(-0.8));
    expect(state).toEqual(snapshot);
    expect(moved.playerPosition).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("prevents overshoot when movement suddenly reverses", () => {
    let state = createMascotFollowState(input());
    const forward = input({ playerPosition: { x: 3, y: 0, z: 0 } });
    for (let i = 0; i < 10; i++) state = stepMascotFollow(state, forward, 1 / 60);
    const reverse = input({ playerPosition: { x: -1, y: 0, z: 0 } });
    const goal = createMascotFollowState(reverse).position.x;
    let previous = state.position.x;
    for (let i = 0; i < 240; i++) {
      state = stepMascotFollow(state, reverse, 1 / 60);
      expect(state.position.x).toBeLessThanOrEqual(previous);
      expect(state.position.x).toBeGreaterThanOrEqual(goal - 0.1);
      previous = state.position.x;
    }
  });

  it("hovers exactly ±0.08 m with a three-second period", () => {
    let state = createMascotFollowState(input());
    for (const expected of [1.68, 1.6, 1.52, 1.6]) {
      state = stepMascotFollow(state, input(), 0.75);
      expect(state.position.y).toBeCloseTo(expected);
    }
  });

  it("locks the relative pose without bob or residual velocity under reduced motion", () => {
    let state = stepMascotFollow(createMascotFollowState(input()), input(), 0.75);
    for (let i = 0; i < 20; i++) {
      const reduced = input({ reducedMotion: true, heading: i / 10, playerPosition: { x: i / 10, y: 2, z: 0 } });
      state = stepMascotFollow(state, reduced, 0.15);
      expect(state).toEqual(createMascotFollowState(reduced));
      expect(state.position.y).toBe(3.6);
    }
  });

  it("clamps at actual terrain plus 0.3 m, including ridges crossed while lagging", () => {
    let state = createMascotFollowState(input());
    const terrainHeight = (x: number) => x < 2 ? 8 : 0;
    const moved = input({ terrainHeight, playerPosition: { x: 4, y: 0, z: 0 } });
    for (let i = 0; i < 240; i++) {
      state = stepMascotFollow(state, moved, 1 / 60);
      expect(state.position.y).toBeGreaterThanOrEqual(terrainHeight(state.position.x) + 0.3 - 1e-12);
    }
    const spawn = createMascotFollowState(input({ terrainHeight: () => 10 }));
    expect(spawn.position.y).toBeCloseTo(10.3);
  });

  it.each([1, 100])("snaps on an explicit %s m teleport and clears velocity/phase", distance => {
    const state = stepMascotFollow(createMascotFollowState(input()), input(), 0.75);
    const teleported = input({ teleported: true, playerPosition: { x: distance, y: 2, z: 4 } });
    expect(stepMascotFollow(state, teleported, 0)).toEqual(createMascotFollowState(teleported));
  });

  it("also detects unannounced large jumps", () => {
    const jumped = input({ playerPosition: { x: 20, y: 0, z: 0 } });
    expect(stepMascotFollow(createMascotFollowState(input()), jumped, 1 / 60)).toEqual(createMascotFollowState(jumped));
  });

  it.each([-1, NaN, Infinity])("rejects invalid dt %s", dt => {
    expect(() => stepMascotFollow(createMascotFollowState(input()), input(), dt)).toThrow(RangeError);
  });
});
