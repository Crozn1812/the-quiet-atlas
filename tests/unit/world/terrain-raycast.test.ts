import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { expect, it, vi } from "vitest";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";

it("row slab rejection preserves Three hits, transforms, clipping and draw range", () => {
  const cells = 32, size = 64;
  const heights = Float32Array.from({ length: (cells + 1) ** 2 }, (_, i) =>
    Math.sin(Math.floor(i / (cells + 1)) * 0.3) + Math.cos(i % (cells + 1) * 0.2));
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = createTileMesh({ cells, size, heights, origin: { x: -32, y: 2, z: -32 } }, material);
  const reference = new Mesh(mesh.geometry, material);
  reference.position.copy(mesh.position); reference.rotation.y = mesh.rotation.y = 0.2;
  reference.scale.set(1.2, 0.8, 0.9); mesh.scale.copy(reference.scale);
  reference.updateMatrixWorld(true); mesh.updateMatrixWorld(true);
  const ray = new Raycaster();
  const read = (object: Mesh) => ray.intersectObject(object).map(hit => ({
    point: hit.point.toArray(), distance: hit.distance, faceIndex: hit.faceIndex,
    face: hit.face, normal: hit.normal?.toArray(),
  })).sort((a, b) => a.faceIndex! - b.faceIndex!);
  try {
    for (let i = 0; i < 120; i++) {
      const x = (i * 13 % 70) - 3, z = (i * 19 % 70) - 3;
      const origin = new Vector3(x, 15, z).applyMatrix4(mesh.matrixWorld);
      const target = new Vector3(32, -5, 32).applyMatrix4(mesh.matrixWorld);
      ray.set(origin, i % 2 ? target.sub(origin).normalize() : new Vector3(0, -1, 0));
      ray.near = i % 3 ? 0 : 10; ray.far = i % 4 ? Infinity : 18;
      expect(read(mesh)).toEqual(read(reference));
      expect(mesh.geometry.drawRange).toEqual({ start: 0, count: Infinity });
    }
    mesh.rotation.y = 0; mesh.scale.setScalar(1); mesh.updateMatrixWorld(true);
    ray.set(new Vector3(-15, 20, -15), new Vector3(0, -1, 0)); ray.near = 0; ray.far = Infinity;
    const vertices = vi.spyOn(mesh, "getVertexPosition");
    read(mesh);
    expect(vertices.mock.calls.length).toBeGreaterThan(0);
    expect(vertices.mock.calls.length).toBeLessThanOrEqual(cells * 12);
  } finally { mesh.geometry.dispose(); material.dispose(); }
});
