import { Box3, BufferAttribute, BufferGeometry, Mesh, Sphere, Vector3 } from "three";
import { FAR_LANDSCAPE } from "../../../src/features/world/scene/far-landscape";

/** Test-only broad phase for the dense backdrop, whose gameplay raycast is off.
 * Partition the original High indices without simplifying or moving a triangle.
 * Return original vertex IDs and object identity for the cinematic assertions. */
export function installFarRaycast(mesh: Mesh) {
  const { cells } = FAR_LANDSCAPE, stride = cells + 1, block = 64;
  const source = mesh.geometry, position = source.getAttribute("position");
  const parts: Mesh[] = [], point = new Vector3();
  for (let x = 0; x < cells; x += block) for (let z = 0; z < cells; z += block) {
    const nx = Math.min(block, cells - x), nz = Math.min(block, cells - z);
    const indices = new Uint32Array(nx * nz * 6);
    for (let row = 0; row < nx; row++) {
      const start = ((x + row) * cells + z) * 6;
      indices.set(source.index!.array.subarray(start, start + nz * 6), row * nz * 6);
    }
    const geometry = new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(new BufferAttribute(indices, 1));
    const box = new Box3();
    for (let i = x; i <= x + nx; i++) for (let j = z; j <= z + nz; j++) {
      box.expandByPoint(point.fromBufferAttribute(position, i * stride + j));
    }
    geometry.boundingBox = box; geometry.boundingSphere = box.getBoundingSphere(new Sphere());
    const part = new Mesh(geometry, mesh.material);
    part.matrixAutoUpdate = false; part.matrixWorld.copy(mesh.matrixWorld); parts.push(part);
  }
  const original = mesh.raycast;
  mesh.raycast = (ray, hits) => {
    const start = hits.length;
    for (const part of parts) Mesh.prototype.raycast.call(part, ray, hits);
    for (let i = start; i < hits.length; i++) hits[i]!.object = mesh;
  };
  return () => { mesh.raycast = original; parts.forEach(part => part.geometry.dispose()); };
}
