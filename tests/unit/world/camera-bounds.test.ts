import { Box3, BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from "three";
import { expect, it, vi } from "vitest";
import { ensureCameraBounds } from "../../../src/features/world/camera";
import { createTerrain, createTerrainMesh } from "../../../src/features/world/terrain";

it("keeps exact triangle hits and recursive/custom raycasts for transformed static obstacles", () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const terrain = createTerrainMesh(createTerrain());
  const trunk = new Mesh(new CylinderGeometry(0.3, 0.45, 6, 12), material);
  const landmark = new Mesh(new BoxGeometry(4, 2, 1), material);
  const child = new Mesh(new BoxGeometry(1, 1, 1), material);
  child.position.set(3, 0, 0); landmark.add(child);
  const custom = new Mesh(new BoxGeometry(1, 1, 1).translate(20, 0, 0), material);
  const fallbackBounds = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
  const original = custom.raycast.bind(custom);
  custom.raycast = (ray, hits) => {
    const before = hits.length;
    original(ray, hits);
    // A custom picker may own a gap outside its visible geometry (Horizon viewer).
    if (hits.length === before) {
      const point = ray.ray.intersectBox(fallbackBounds, new Vector3());
      if (point) {
        const distance = point.distanceTo(ray.ray.origin);
        if (distance >= ray.near && distance <= ray.far) hits.push({ object: custom, point, distance });
      }
    }
  };
  const customRaycast = custom.raycast;
  const group = new Group(); group.add(terrain, trunk, landmark);
  terrain.position.set(0, -2, 0); trunk.position.set(4, 1, 3); landmark.position.set(-4, 1, -3);
  group.position.set(120, 5, -300); group.rotation.set(0.1, 0.4, -0.15); group.scale.set(1.2, 0.8, 1.5);
  group.updateMatrixWorld(true); custom.updateMatrixWorld(true);
  const obstacles = [terrain, trunk, landmark, custom];
  const rays: Raycaster[] = [];
  for (const mesh of [terrain, trunk, landmark, child]) for (const x of [0, 0.4, 3]) {
    const origin = new Vector3(x, 8, 0).applyMatrix4(mesh.matrixWorld);
    const direction = new Vector3(0, -1, 0).transformDirection(mesh.matrixWorld);
    for (const [near, far] of [[0, 100], [0, 2], [2, 100], [3, 3.5], [5, 10]]) rays.push(new Raycaster(origin, direction, near, far));
  }
  rays.push(new Raycaster(new Vector3(0, 0, 4), new Vector3(0, 0, -1), 0.25, 16));
  const capture = () => rays.map(ray => ray.intersectObjects(obstacles).map(hit => ({
    object: hit.object.uuid, distance: hit.distance, point: hit.point.toArray(), faceIndex: hit.faceIndex,
  })));
  try {
    const before = capture();
    expect(before.flat().length).toBeGreaterThan(10);
    expect(before.at(-1)?.[0]?.object).toBe(custom.uuid);
    ensureCameraBounds(obstacles);
    expect(capture()).toEqual(before);
    expect(custom.raycast).toBe(customRaycast);
    const bound = terrain.geometry.boundingBox!;
    bound.expandByScalar(2); // Deliberately conservative authored bounds remain untouched.
    const snapshot = bound.clone(), compute = vi.spyOn(terrain.geometry, "computeBoundingBox");
    try {
      ensureCameraBounds(obstacles);
      expect(terrain.geometry.boundingBox).toBe(bound);
      expect(bound).toEqual(snapshot);
      expect(compute).not.toHaveBeenCalled();
    } finally { compute.mockRestore(); }
  } finally {
    for (const mesh of [...obstacles, child]) mesh.geometry.dispose();
    terrain.material.dispose(); material.dispose();
  }
});

it("skips triangle work for an upward camera ray inside a flat obstacle's sphere", () => {
  const geometry = new PlaneGeometry(64, 64, 16, 16).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(0.1, 1, 0.1), new Vector3(0, 1, 0), 0.25, 12);
  const vertices = vi.spyOn(mesh, "getVertexPosition");
  try {
    expect(geometry.boundingBox).toBeNull();
    expect(ray.intersectObject(mesh)).toEqual([]);
    expect(vertices.mock.calls.length).toBeGreaterThan(100);
    vertices.mockClear();
    ensureCameraBounds([mesh]);
    expect(ray.intersectObject(mesh)).toEqual([]);
    expect(vertices).not.toHaveBeenCalled();
  } finally { vertices.mockRestore(); geometry.dispose(); material.dispose(); }
});
