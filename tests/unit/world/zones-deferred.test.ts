import { expect, it, vi } from "vitest";
import { Box3, InstancedMesh, Mesh, Scene, Vector3 } from "three";
import { createDeferredZoneScenes, createZoneEntryTracker, placeZoneScenes, SPAWN_ZONE_IDS } from "../../../src/features/world/zones";
import { ZONES } from "../../../src/features/world/layout/zones";
import { createWorldScene, worldSpawn } from "../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";

vi.setConfig({ testTimeout: 30_000 });

it("places three spawn zones, completes all eight in walking order and matches synchronous geometry/targets/boxes", () => {
  const placed = vi.fn();
  const deferred = createDeferredZoneScenes(() => 100, placed);
  const synchronous = placeZoneScenes(() => 100);
  try {
    expect(deferred.zones.map(zone => zone.zoneId)).toEqual(SPAWN_ZONE_IDS);
    expect(placed).not.toHaveBeenCalled();
    expect(deferred.build.next().done).toBe(false);
    expect(placed.mock.calls.map(([zone]) => zone.zoneId)).toEqual(["milestones"]);
    for (const unused of deferred.build) void unused;
    expect(deferred.zones.map(zone => zone.zoneId)).toEqual(synchronous.map(zone => zone.zoneId));
    for (const [i, zone] of deferred.zones.entries()) {
      const original = synchronous[i]!;
      expect(zone.target.position).toEqual(original.target.position);
      expect(zone.target.label).toEqual(original.target.label);
      expect(zone.boxes.map(box => new Box3().setFromObject(box))).toEqual(original.boxes.map(box => new Box3().setFromObject(box)));
      const geometry = (root: typeof zone.group) => {
        const result: unknown[] = [];
        root.traverse(object => {
          result.push([object.type, object.name, object.position.toArray(), object.quaternion.toArray(), object.scale.toArray(), object.visible]);
          if (object instanceof Mesh) result.push({
            index: object.geometry.index && Array.from(object.geometry.index.array),
            attributes: Object.fromEntries(Object.keys(object.geometry.attributes).map(name => [name, Array.from(object.geometry.getAttribute(name).array)])),
          });
        });
        return result;
      };
      expect(geometry(zone.group)).toEqual(geometry(original.group));
    }
    expect(placed).toHaveBeenCalledTimes(5);
  } finally {
    deferred.dispose();
    synchronous.forEach(zone => zone.dispose());
  }
});

it("ensures a distant destination synchronously and never registers it twice in the remaining queue", () => {
  const placed = vi.fn();
  const deferred = createDeferredZoneScenes(() => 100, placed);
  try {
    const destination = deferred.ensure("last-postcard")!;
    expect(destination.zoneId).toBe("last-postcard");
    expect(destination.boxes.length).toBeGreaterThan(0);
    expect(deferred.ensure("last-postcard")).toBe(destination);
    for (const unused of deferred.build) void unused;
    expect(placed.mock.calls.filter(([zone]) => zone.zoneId === "last-postcard")).toHaveLength(1);
    expect(deferred.zones.map(zone => zone.zoneId)).toEqual(ZONES.map(zone => zone.id));
  } finally { deferred.dispose(); }
});

it("disposes exactly once midway through construction and rejects later queue/ensure work", () => {
  const placed = vi.fn();
  const deferred = createDeferredZoneScenes(() => 100, placed);
  deferred.build.next();
  const disposals = deferred.zones.map(zone => vi.spyOn(zone, "dispose"));
  deferred.dispose(); deferred.dispose();
  expect(disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
  expect(deferred.build.next().done).toBe(true);
  expect(deferred.ensure("last-postcard")).toBeUndefined();
  expect(placed).toHaveBeenCalledOnce();
});

it("does not consume zone-entry membership before a zone is registered", () => {
  let ready = false;
  const track = createZoneEntryTracker(() => ready);
  const zone = ZONES.find(zone => zone.id === "milestones")!;
  const position = new Vector3(zone.position.x, 100, zone.position.z);
  expect(track(position, true)).toEqual([]);
  ready = true;
  expect(track(position, true)).toContain("milestones");
  expect(track(position, true)).not.toContain("milestones");
});

it("refreshes resident foliage/ground caches at a stationary player and matches bounds supplied up front", () => {
  const bounds: Box3[] = [];
  const scene = new Scene();
  const deferred = createWorldScene({ ...createMeshPhysics(), scene, quality: "Low", zoneBounds: bounds });
  let synchronous: ReturnType<typeof createWorldScene> | undefined;
  try {
    const trunksBefore = deferred.collisionMeshes.filter(mesh => mesh.geometry.type === "CylinderGeometry");
    expect(trunksBefore.length).toBeGreaterThan(0);
    const exclusion = new Box3().setFromCenterAndSize(trunksBefore[0]!.position, new Vector3(30, 100, 30));
    bounds.push(exclusion);
    deferred.update(worldSpawn(), 0);
    const reference = new Scene();
    synchronous = createWorldScene({ ...createMeshPhysics(), scene: reference, quality: "Low", zoneBounds: bounds });
    const trunks = (world: typeof deferred) => world.collisionMeshes
      .filter(mesh => mesh.geometry.type === "CylinderGeometry")
      .map(mesh => JSON.stringify([mesh.position.toArray(), mesh.quaternion.toArray(), mesh.scale.toArray()])).sort();
    expect(trunks(deferred).length).toBeLessThan(trunksBefore.length);
    expect(trunks(deferred)).toEqual(trunks(synchronous));
    const instances = (root: Scene) => {
      const result: string[] = [];
      root.traverse(object => {
        if (object instanceof InstancedMesh) result.push(JSON.stringify([
          object.name, object.geometry.type, object.count,
          Array.from(object.instanceMatrix.array.slice(0, object.count * 16)),
          object.instanceColor && Array.from(object.instanceColor.array.slice(0, object.count * 3)),
        ]));
      });
      return result.sort();
    };
    expect(instances(scene)).toEqual(instances(reference));
  } finally { deferred.dispose(); synchronous?.dispose(); }
});

it.each(["timer", "paint", "idle", "partial", "complete"])("owns one zone per idle callback and cancels all pending work at %s", phase => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const frames = new Map<number, FrameRequestCallback>();
  const idle = new Map<number, IdleRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => frames.delete(handle));
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => { idle.set(++id, callback); return id; });
  vi.stubGlobal("cancelIdleCallback", (handle: number) => idle.delete(handle));
  const placed = vi.fn();
  const deferred = createDeferredZoneScenes(() => 100, placed);
  let ready = false;
  try {
    deferred.startDeferred(() => ready);
    deferred.startDeferred(() => ready);
    vi.advanceTimersByTime(100);
    expect(deferred.zones).toHaveLength(3);
    expect(frames.size).toBe(0); expect(idle.size).toBe(0);
    ready = true;
    if (phase !== "timer") vi.advanceTimersByTime(16);
    if (["idle", "partial", "complete"].includes(phase)) {
      for (const callback of frames.values()) callback(0);
      frames.clear(); vi.advanceTimersByTime(0);
      expect(placed).not.toHaveBeenCalled();
      expect(idle.size).toBe(1);
    }
    const runIdle = () => {
      const [handle, callback] = [...idle.entries()][0]!;
      idle.delete(handle);
      callback({ didTimeout: true, timeRemaining: () => 0 });
    };
    if (phase === "partial" || phase === "complete") {
      runIdle();
      expect(placed).toHaveBeenCalledOnce();
      expect(deferred.zones).toHaveLength(4);
      expect(idle.size).toBe(1);
    }
    if (phase === "complete") {
      while (idle.size) {
        const before = placed.mock.calls.length;
        runIdle();
        expect(placed.mock.calls.length - before).toBeLessThanOrEqual(1);
      }
      expect(deferred.zones).toHaveLength(8);
      expect(placed).toHaveBeenCalledTimes(5);
    }
    const disposals = deferred.zones.map(zone => vi.spyOn(zone, "dispose"));
    deferred.dispose(); deferred.dispose();
    expect(disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
    expect(frames.size).toBe(0); expect(idle.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
  } finally { deferred.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
