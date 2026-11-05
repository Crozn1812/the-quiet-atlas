import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { BufferGeometry, InstancedMesh, Material, Mesh, Scene, type Group } from "three";
import { placeDressing } from "../../../src/features/world/dressing";
import { createShore } from "../../../src/features/world/shore";

// Lead batch 25: shore colliders join the world's collision boxes at their world position; dispose is idempotent.
it("turns every shore collider into a world-space box and disposes once", () => {
  const shore = createShore();
  const expected = shore.colliders.map(c => c.center.clone());
  shore.dispose();
  const dressing = placeDressing();
  try {
    expect(dressing.groups.map(group => group.name)).toContain("rocky-shore");
    expect(dressing.boxes.length).toBeGreaterThanOrEqual(expected.length);
    expected.forEach((centre, i) => expect(dressing.boxes[i]!.position.distanceTo(centre)).toBeLessThan(1e-9));
  } finally {
    dressing.dispose();
    dressing.dispose();
  }
});

// B2-163: every guard post and utility pole becomes an upright box from its foot to its top.
it("stands the coast road's posts and poles up as collision boxes", async () => {
  const { createCoastRoad } = await import("../../../src/features/world/road/road");
  const road = createCoastRoad();
  const solids = [...road.layout.posts, ...road.layout.poles];
  road.dispose();
  const dressing = placeDressing();
  try {
    for (const solid of solids) {
      const box = dressing.boxes.find(b => Math.hypot(b.position.x - solid.x, b.position.z - solid.z) < 1e-9)!;
      expect(box, `post at ${solid.x}, ${solid.z}`).toBeDefined();
      expect(box.position.y).toBeCloseTo(solid.y + solid.height / 2, 9);
      expect(box.geometry.parameters.height).toBeCloseTo(solid.height, 9);
    }
  } finally { dressing.dispose(); }
});

// B2-168: each bridge deck/rail trimesh has a matching raycast mesh with the same triangles.
it("exposes bridge trimeshes for Rapier and identical meshes for the raycast fallback", () => {
  const dressing = placeDressing();
  try {
    expect(dressing.groups.length).toBe(3);
    expect(dressing.trimeshes.length).toBeGreaterThanOrEqual(3);
    expect(dressing.surfaces).toHaveLength(dressing.trimeshes.length);
    dressing.trimeshes.forEach((trimesh, i) => {
      const surface = dressing.surfaces[i]!;
      expect(surface.geometry.getAttribute("position").array).toEqual(trimesh.vertices);
      expect(surface.geometry.getIndex()!.count).toBe(trimesh.indices.length);
    });
    expect(dressing.trimeshes.filter(t => t.kind === "deck").length).toBeGreaterThanOrEqual(1);
  } finally { dressing.dispose(); }
});


afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fakeFrames() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => setTimeout(() => callback(0), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
}
function fingerprint(group: Group) {
  const hash = createHash("sha256");
  group.traverse(object => {
    hash.update(JSON.stringify([object.name, object.type, object.position, object.quaternion, object.scale,
      object.visible, object.castShadow, object.receiveShadow, object.renderOrder]));
    if (!(object instanceof Mesh) && object.type !== "LineSegments") return;
    const mesh = object as Mesh;
    const attributes = { ...mesh.geometry.attributes, index: mesh.geometry.index,
      instanceMatrix: (mesh as InstancedMesh).instanceMatrix, instanceColor: (mesh as InstancedMesh).instanceColor };
    for (const [name, attribute] of Object.entries(attributes)) {
      if (!attribute) continue;
      const array = attribute.array;
      hash.update(name).update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      hash.update(JSON.stringify([material.type, material.opacity, material.transparent, material.side,
        material.depthWrite, material.depthTest, material.blending, (material as Material & { color: unknown }).color]));
    }
  });
  return hash.digest("hex");
}

it("has all solid colliders immediately, waits for control/paint, then matches every original group", () => {
  fakeFrames();
  const original = placeDressing();
  const deferred = placeDressing({ deferred: true });
  let ready = false;
  try {
    expect(deferred.boxes.map(box => [box.position.toArray(), box.quaternion.toArray(), box.geometry.parameters]))
      .toEqual(original.boxes.map(box => [box.position.toArray(), box.quaternion.toArray(), box.geometry.parameters]));
    expect(deferred.trimeshes).toEqual(original.trimeshes);
    expect(deferred.groups.map(group => group.name)).toEqual(original.groups.map(group => group.name));
    expect(deferred.groups.slice(0, 2).every(group => group.children.length === 0)).toBe(true);
    deferred.startDeferred(() => ready);
    vi.advanceTimersByTime(100);
    expect(deferred.groups.slice(0, 2).every(group => group.children.length === 0)).toBe(true);
    ready = true;
    vi.advanceTimersByTime(16);
    expect(deferred.groups.slice(0, 2).every(group => group.children.length === 0)).toBe(true);
    let maximum = 0, slices = 0;
    while (vi.getTimerCount()) {
      const start = performance.now();
      vi.runOnlyPendingTimers();
      maximum = Math.max(maximum, performance.now() - start); slices++;
    }
    console.log(`B2-179 dressing: ${slices} slices, max ${maximum.toFixed(2)}ms (Node)`);
    expect(vi.getTimerCount()).toBe(0);
    expect(deferred.groups.map(fingerprint)).toEqual(original.groups.map(fingerprint));
  } finally { original.dispose(); deferred.dispose(); }
});

it("cancels its waiting timer or paint callback and never starts queued work after dispose", () => {
  fakeFrames();
  for (const elapsed of [0, 16, 32]) {
    const dressing = placeDressing({ deferred: true });
    const work = vi.fn();
    dressing.defer((function* () { work(); yield; })());
    dressing.startDeferred(() => true);
    vi.advanceTimersByTime(elapsed);
    dressing.dispose(); dressing.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(work).not.toHaveBeenCalled();
  }
});

it("releases partially constructed GPU objects and cancels the next slice", () => {
  fakeFrames();
  const dressing = placeDressing({ deferred: true });
  const scene = new Scene(); dressing.groups.forEach(group => scene.add(group));
  const geometry = vi.spyOn(BufferGeometry.prototype, "dispose");
  const material = vi.spyOn(Material.prototype, "dispose");
  const instance = vi.spyOn(InstancedMesh.prototype, "dispose");
  let steps = 0;
  // A deterministic clock permits one work item per timer, so cancellation lands inside a generator.
  let time = 0; vi.spyOn(performance, "now").mockImplementation(() => time += 4);
  dressing.defer((function* () { while (steps < 5000) { steps++; yield; } })());
  dressing.startDeferred(() => true);
  while (steps < 1400) vi.advanceTimersByTime(16);
  const count = steps;
  dressing.dispose();
  const releases = [geometry.mock.calls.length, material.mock.calls.length, instance.mock.calls.length];
  expect(releases.every(value => value > 0)).toBe(true);
  expect(dressing.groups.every(group => group.parent === null)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  dressing.dispose(); vi.runAllTimers();
  expect(steps).toBe(count);
  expect([geometry.mock.calls.length, material.mock.calls.length, instance.mock.calls.length]).toEqual(releases);
});

it("yields to the timer budget and does not starve other queued construction", () => {
  fakeFrames();
  const dressing = placeDressing();
  let time = 0; vi.spyOn(performance, "now").mockImplementation(() => time += 2);
  const order: string[] = [];
  function* work(name: string) { for (let i = 0; i < 10; i++) { order.push(name); yield; } }
  dressing.defer(work("a")); dressing.defer(work("b"));
  try {
    dressing.startDeferred(() => true);
    vi.advanceTimersByTime(48);
    expect(order).toEqual(["a", "b"]);
    expect(vi.getTimerCount()).toBe(1);
    vi.runAllTimers();
    expect(order).toHaveLength(20);
    expect(vi.getTimerCount()).toBe(0);
  } finally { dressing.dispose(); }
});
