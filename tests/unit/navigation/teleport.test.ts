import { describe, expect, expectTypeOf, it } from "vitest";
import { ZONE_IDS, type ZoneId } from "../../../src/features/interaction/targets";
import type { SecretId } from "../../../src/features/journal/model";
import { ZONES } from "../../../src/features/world/layout/zones";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { SIGNPOSTS, arrivalPoint } from "../../../src/features/navigation/signposts";
import { TELEPORT_START_EVENT, TELEPORT_END_EVENT, type TeleportEvent } from "../../../src/features/navigation/events";
import { createTeleport, type TeleportState } from "../../../src/features/navigation/teleport";

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("signpost layout", () => {
  it("has exactly one immutable signpost per public zone, 3 metres along its approach", () => {
    expect(SIGNPOSTS).toHaveLength(8);
    expect(new Set(SIGNPOSTS.map(post => post.zoneId))).toEqual(new Set(ZONE_IDS));
    expect(Object.isFrozen(SIGNPOSTS)).toBe(true);
    for (const zone of ZONES) {
      const post = SIGNPOSTS.find(post => post.zoneId === zone.id)!;
      expect(distance(post.position, zone.position)).toBeCloseTo(3, 8);
      const direction = zone.t === 0 ? 1 : -1;
      expect(post.position.x - zone.position.x).toBeCloseTo(direction * 3 * zone.lookDirection.x);
      expect(post.position.z - zone.position.z).toBeCloseTo(direction * 3 * zone.lookDirection.z);
      expect(Object.isFrozen(post)).toBe(true);
      expect(Object.isFrozen(post.position)).toBe(true);
    }
  });

  it("arrives on the path beside each post, away from the anchor, facing the zone", () => {
    for (const zone of ZONES) {
      const { position, yaw } = arrivalPoint(zone.id);
      const post = SIGNPOSTS.find(post => post.zoneId === zone.id)!;
      expect(distance(position, zone.position)).toBeGreaterThanOrEqual(2);
      expect(distance(position, post.position)).toBeGreaterThan(0.9);
      expect(distance(position, post.position)).toBeLessThan(1.2);
      const path = pathPointAt(zone.t + (zone.t === 0 ? 1 : -1) * 4 / pathLength());
      expect(position).toEqual({ x: path.x, y: path.y, z: path.z });
      const dx = zone.position.x - position.x;
      const dz = zone.position.z - position.z;
      expect(-Math.sin(yaw)).toBeCloseTo(dx / Math.hypot(dx, dz));
      expect(-Math.cos(yaw)).toBeCloseTo(dz / Math.hypot(dx, dz));
      expect(arrivalPoint(zone.id)).not.toBe(arrivalPoint(zone.id));
    }
  });

  it("excludes secrets at the type boundary and rejects untyped invalid destinations", () => {
    expectTypeOf<Extract<Parameters<typeof arrivalPoint>[0], SecretId>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<Parameters<ReturnType<typeof createTeleport>["choose"]>[0], SecretId>>().toEqualTypeOf<never>();
    expect(() => arrivalPoint("reflection" as ZoneId)).toThrow(RangeError);
  });
});

describe("teleport state machine", () => {
  it("traverses every phase with small ticks and locks input until completion", () => {
    const teleport = createTeleport();
    const states: TeleportState[] = [teleport.state];
    expect(teleport.inputLocked).toBe(false);
    expect(teleport.startChoosing("first-light")).toBe(true);
    states.push(teleport.state);
    expect(teleport.inputLocked).toBe(true);
    expect(teleport.choose("roots")).toEqual({ type: TELEPORT_START_EVENT, detail: { from: "first-light", to: "roots" } });
    states.push(teleport.state);
    expect(teleport.effect).toBe("mist");
    let arrival = null;
    const events: TeleportEvent[] = [];
    for (let i = 0; i < 24; i++) {
      expect(teleport.inputLocked).toBe(true);
      const result = teleport.tick(0.05);
      states.push(...result.transitions);
      events.push(...result.events);
      if (result.arrival) arrival = result.arrival;
      expect(teleport.opacity).toBeGreaterThanOrEqual(0);
      expect(teleport.opacity).toBeLessThanOrEqual(1);
    }
    expect(states).toEqual(["idle", "choosing", "fadingOut", "moving", "fadingIn", "idle"]);
    expect(arrival).toEqual(arrivalPoint("roots"));
    expect(events).toEqual([{ type: TELEPORT_END_EVENT, detail: { to: "roots" } }]);
    expect(teleport.inputLocked).toBe(false);
    expect(teleport.tick(10)).toEqual({ transitions: [], events: [], arrival: null });
  });

  it("carries a 1 second tick across moving and into fadingIn without losing time", () => {
    const teleport = createTeleport();
    teleport.startChoosing("roots");
    teleport.choose("horizon");
    expect(teleport.tick(1)).toEqual({ transitions: ["moving", "fadingIn"], events: [], arrival: null });
    expect(teleport.state).toBe("fadingIn");
    expect(teleport.inputLocked).toBe(true);
    expect(teleport.opacity).toBeCloseTo(1 / 3);
    const end = teleport.tick(1);
    expect(end.transitions).toEqual(["idle"]);
    expect(end.arrival).toEqual(arrivalPoint("horizon"));
    expect(end.events).toEqual([{ type: TELEPORT_END_EVENT, detail: { to: "horizon" } }]);
    expect(teleport.inputLocked).toBe(false);
  });

  it("supports exact boundaries, zero time, and a tick spanning the entire journey", () => {
    const teleport = createTeleport();
    teleport.startChoosing("roots");
    teleport.choose("workshop");
    expect(teleport.tick(0).transitions).toEqual([]);
    expect(teleport.opacity).toBe(0);
    expect(teleport.tick(0.6).transitions).toEqual(["moving", "fadingIn"]);
    expect(teleport.opacity).toBe(1);
    expect(teleport.tick(0.6).transitions).toEqual(["idle"]);
    teleport.startChoosing("workshop");
    teleport.choose("last-postcard");
    const end = teleport.tick(100);
    expect(end.transitions).toEqual(["moving", "fadingIn", "idle"]);
    expect(end.arrival).toEqual(arrivalPoint("last-postcard"));
    expect(end.events).toHaveLength(1);
  });

  it("uses 0.15 second fades per direction for reduced motion", () => {
    const reduced = createTeleport({ reducedMotion: true });
    const normal = createTeleport();
    for (const teleport of [reduced, normal]) {
      teleport.startChoosing("roots");
      teleport.choose("old-trail");
    }
    expect(reduced.effect).toBe("fade");
    expect(reduced.tick(0.15).transitions).toEqual(["moving", "fadingIn"]);
    expect(reduced.inputLocked).toBe(true);
    expect(reduced.tick(0.15).arrival).toEqual(arrivalPoint("old-trail"));
    expect(reduced.inputLocked).toBe(false);
    normal.tick(0.3);
    expect(normal.state).toBe("fadingOut");
    expect(normal.opacity).toBeCloseTo(0.5);
    expect(normal.inputLocked).toBe(true);
  });

  it("cancels choosing, but safely completes both fading phases despite cancellation", () => {
    const teleport = createTeleport();
    expect(teleport.cancel()).toBe(false);
    teleport.startChoosing("roots");
    expect(teleport.cancel()).toBe(true);
    expect(teleport.state).toBe("idle");
    expect(teleport.inputLocked).toBe(false);
    expect(teleport.tick(1).events).toEqual([]);
    expect(teleport.choose("horizon")).toBeNull();
    teleport.startChoosing("roots");
    teleport.choose("horizon");
    expect(teleport.cancel()).toBe(false);
    expect(teleport.state).toBe("fadingOut");
    teleport.tick(0.6);
    expect(teleport.cancel()).toBe(false);
    expect(teleport.state).toBe("fadingIn");
    expect(teleport.inputLocked).toBe(true);
    expect(teleport.tick(0.6).arrival).toEqual(arrivalPoint("horizon"));
    expect(teleport.inputLocked).toBe(false);
  });

  it("ignores same-zone selection, invalid IDs and commands in the wrong phase", () => {
    const teleport = createTeleport();
    expect(teleport.choose("roots")).toBeNull();
    expect(teleport.startChoosing("reflection" as ZoneId)).toBe(false);
    teleport.startChoosing("roots");
    expect(teleport.choose("roots")).toBeNull();
    expect(teleport.choose("reflection" as ZoneId)).toBeNull();
    expect(teleport.state).toBe("choosing");
    expect(teleport.tick(10)).toEqual({ transitions: [], events: [], arrival: null });
    expect(teleport.startChoosing("horizon")).toBe(false);
    expect(teleport.choose("horizon")?.detail).toEqual({ from: "roots", to: "horizon" });
    expect(teleport.choose("workshop")).toBeNull();
    expect(teleport.startChoosing("workshop")).toBe(false);
    expect(teleport.tick(2).arrival).toEqual(arrivalPoint("horizon"));
  });

  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid dt %s without changing state", dt => {
    const teleport = createTeleport();
    teleport.startChoosing("roots");
    teleport.choose("horizon");
    expect(() => teleport.tick(dt)).toThrow(RangeError);
    expect(teleport.state).toBe("fadingOut");
    expect(teleport.opacity).toBe(0);
    expect(teleport.tick(1.2).arrival).toEqual(arrivalPoint("horizon"));
  });
});
