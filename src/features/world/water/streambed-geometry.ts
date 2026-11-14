import { BufferGeometry, Float32BufferAttribute } from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/** Water-worn derivative of the existing CC0 boulders. Weld face-split source
 * vertices before smoothing; averaged normals alone leave their jagged outline. */
export function roundBedStone(source: BufferGeometry, pebble: boolean, variant = 0): BufferGeometry {
  const clean = source.clone();
  for (const name of Object.keys(clean.attributes)) if (name !== "position") clean.deleteAttribute(name);
  // meshopt GLBs may expose interleaved, normalized Int16 positions. Read the
  // accessor, never the underlying strided/quantized storage as packed floats.
  const sourcePosition = source.getAttribute("position"), unpacked: number[] = [];
  for (let i = 0; i < sourcePosition.count; i++) unpacked.push(sourcePosition.getX(i), sourcePosition.getY(i), sourcePosition.getZ(i));
  clean.setAttribute("position", new Float32BufferAttribute(unpacked, 3));
  const geometry = mergeVertices(clean, 0.003); clean.dispose();
  const p = geometry.getAttribute("position"), indices = geometry.index!;
  const adjacent = Array.from({ length: p.count }, () => new Set<number>());
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    adjacent[a]!.add(b).add(c); adjacent[b]!.add(a).add(c); adjacent[c]!.add(a).add(b);
  }
  let positions = Float32Array.from(p.array);
  for (let pass = 0; pass < (pebble ? 4 : 2); pass++) {
    const next = positions.slice();
    for (let i = 0; i < p.count; i++) {
      const neighbours = adjacent[i]!;
      if (!neighbours.size) continue;
      for (let axis = 0; axis < 3; axis++) {
        let mean = 0;
        for (const n of neighbours) mean += positions[n * 3 + axis]!;
        next[i * 3 + axis] = positions[i * 3 + axis]! * 0.58 + mean / neighbours.size * 0.42;
      }
    }
    positions = next;
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
  geometry.translate(-cx, -cy, -cz).scale(2 / (box.max.x - box.min.x), 2 / (box.max.y - box.min.y), 2 / (box.max.z - box.min.z));
  if (pebble && variant > 0) {
    // Different worn outlines, rather than eight scaled copies of one ellipsoid.
    const worn = geometry.getAttribute("position");
    for (let i = 0; i < worn.count; i++) {
      const x = worn.getX(i), y = worn.getY(i), z = worn.getZ(i);
      const wear = 1 + 0.09 * Math.sin(x * 2.7 + z * 3.1 + variant * 2.3);
      worn.setXYZ(i, x * wear + y * 0.08 * Math.sin(variant), y * (1 + 0.14 * Math.sin(z * 2 + variant)), z * wear);
    }
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2, -(bounds.min.z + bounds.max.z) / 2)
      .scale(2 / (bounds.max.x - bounds.min.x), 2 / (bounds.max.y - bounds.min.y), 2 / (bounds.max.z - bounds.min.z));
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
