import { BoxGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Raycaster, SkinnedMesh, Sphere, Vector3 } from "three";
import { expect, it, vi } from "vitest";
import { filterCameraCandidates } from "../../../src/features/world/camera";

const capture = (ray: Raycaster, meshes: Mesh[]) => ray.intersectObjects(meshes).map(hit => ({
  object: hit.object.uuid, distance: hit.distance, point: hit.point.toArray(), faceIndex: hit.faceIndex,
}));

it("preserves exact hits/order with cache invalidation for transforms, sphere edits, null bounds and geometry replacement", () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const geometry = new BoxGeometry(2, 3, 4);
  const replacement = new BoxGeometry(4, 2, 6);
  const meshes = Array.from({ length: 20 }, (_, i) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(i % 5 * 4 - 8, Math.floor(i / 5) * 4, i % 3 * 5);
    mesh.rotation.set(i * 0.1, i * 0.3, i * 0.2);
    mesh.scale.set(0.7 + i * 0.03, 1.2, 1.6);
    return mesh;
  });
  const parent = new Group(); parent.add(...meshes);
  parent.position.set(120, 5, -300); parent.rotation.set(0.1, 0.4, -0.15); parent.scale.set(1.2, 0.8, 1.5);
  let hitCount = 0;
  function compare() {
    parent.updateMatrixWorld(true);
    for (const mesh of meshes) for (const [near, far] of [[0, 100], [0.25, 16], [2, 4], [10, 10], [12, 2]]) {
      const origin = new Vector3(0, 0, 10).applyMatrix4(mesh.matrixWorld);
      const direction = new Vector3(0, 0, -1).transformDirection(mesh.matrixWorld);
      const ray = new Raycaster(origin, direction, near, far);
      const expected = capture(ray, meshes);
      const filtered = filterCameraCandidates(meshes, ray);
      expect(filtered).toEqual(meshes.filter(candidate => filtered.includes(candidate)));
      expect(capture(ray, filtered)).toEqual(expected);
      hitCount += expected.length;
    }
  }
  try {
    compare(); compare(); // Same cached inputs must retain identical results.
    parent.position.x += 3; meshes[0]!.scale.set(2, 3, 0.5); compare();
    geometry.boundingSphere!.center.x += 2; geometry.boundingSphere!.radius += 5; compare();
    geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), 20); compare();
    geometry.boundingSphere = null; compare();
    meshes[0]!.geometry = replacement; compare();
    // Read matrixWorld directly, as Mesh.raycast does; no implicit object update.
    meshes[1]!.matrixWorld.elements[12]! += 1;
    const ray = new Raycaster(new Vector3(120, 5, -280), new Vector3(0, 0, -1), 0, 100);
    expect(capture(ray, filterCameraCandidates(meshes, ray))).toEqual(capture(ray, meshes));
    expect(hitCount).toBeGreaterThan(100);
  } finally { geometry.dispose(); replacement.dispose(); material.dispose(); }
});

it("computes null spheres once, reuses transformed spheres, and rejects misses before default raycast", () => {
  const geometry = new BoxGeometry(1, 1, 1), material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material); mesh.position.x = 50; mesh.updateMatrixWorld(true);
  const compute = vi.spyOn(geometry, "computeBoundingSphere");
  const transform = vi.spyOn(Sphere.prototype, "applyMatrix4");
  const ray = new Raycaster(new Vector3(0, 0, 4), new Vector3(0, 0, -1), 0.25, 12);
  try {
    expect(filterCameraCandidates([mesh], ray)).toEqual([]);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledTimes(1);
    transform.mockClear();
    expect(filterCameraCandidates([mesh], ray)).toEqual([]);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(transform).not.toHaveBeenCalled();
    geometry.boundingSphere!.radius = 100;
    expect(filterCameraCandidates([mesh], ray)).toEqual([mesh]);
    expect(transform).toHaveBeenCalledTimes(1);
  } finally { compute.mockRestore(); transform.mockRestore(); geometry.dispose(); material.dispose(); }
});

it("preserves origin-inside, tangent, near/far and non-finite sphere predicates exactly", () => {
  const geometry = new BoxGeometry(2, 2, 2), material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material); mesh.updateMatrixWorld(true);
  try {
    for (const x of [0, 1, Math.sqrt(3), Math.sqrt(3) + 1e-12]) {
      for (const z of [0, 1, 4]) for (const [near, far] of [[0, Infinity], [0.25, 12], [3, 3], [4, 2], [NaN, 12]]) {
        const ray = new Raycaster(new Vector3(x, 0, z), new Vector3(0, 0, -1), near, far);
        expect(capture(ray, filterCameraCandidates([mesh], ray))).toEqual(capture(ray, [mesh]));
      }
    }
    geometry.boundingSphere = new Sphere(new Vector3(NaN, 0, 0), Infinity);
    const ray = new Raycaster(new Vector3(0, 0, 4), new Vector3(0, 0, -1));
    expect(capture(ray, filterCameraCandidates([mesh], ray))).toEqual(capture(ray, [mesh]));
  } finally { geometry.dispose(); material.dispose(); }
});

it("bypasses custom raycasts, child-bearing meshes, instanced and skinned meshes in their original order", () => {
  const geometry = new BoxGeometry(1, 1, 1), material = new MeshBasicMaterial();
  const custom = new Mesh(geometry, material);
  const parent = new Mesh(geometry, material);
  const child = new Mesh(geometry, material); child.position.z = 4; parent.add(child);
  const instanced = new InstancedMesh(geometry, material, 1);
  instanced.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 4));
  const skinned = new SkinnedMesh(geometry, material);
  custom.raycast = (ray, hits) => hits.push({ object: custom, point: ray.ray.at(1, new Vector3()), distance: 1 });
  // No skeleton is needed to prove bypass; a bounds hook must never be consulted.
  const skinRaycast = vi.spyOn(skinned, "raycast").mockImplementation(() => {});
  const meshes = [custom, parent, instanced, skinned];
  meshes.forEach(mesh => mesh.updateMatrixWorld(true));
  const ray = new Raycaster(new Vector3(0, 0, 8), new Vector3(0, 0, -1), 0.25, 12);
  const compute = vi.spyOn(geometry, "computeBoundingSphere");
  try {
    expect(filterCameraCandidates(meshes, ray)).toEqual(meshes);
    expect(compute).not.toHaveBeenCalled();
    expect(capture(ray, filterCameraCandidates(meshes, ray))).toEqual(capture(ray, meshes));
  } finally { skinRaycast.mockRestore(); compute.mockRestore(); instanced.dispose(); geometry.dispose(); material.dispose(); }
});
