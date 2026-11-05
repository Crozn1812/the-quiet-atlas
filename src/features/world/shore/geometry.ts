import { BufferGeometry, Float32BufferAttribute } from "three";
import { worldHeight } from "../terrain/height";
import { shoreGroundHeight } from "./contour";
import { shorePlacementClear, type SandPatch } from "./layout";

/** Chamfered irregular prisms, not spheres: 20 triangles for pebbles, 32 for large rocks.
 * The three rings have flat contact faces for stacking, and a broad broken shoulder.
 * Bounds are [-.5,.5] in XZ and [0,1] in Y before instance scaling.
 */
export function createShoreRockGeometry(sides: 4 | 6): BufferGeometry {
  const outline = sides === 4
    ? [[-0.5, -0.32], [0.35, -0.5], [0.5, 0.32], [-0.38, 0.5]]
    : [[-0.5, -0.14], [-0.28, -0.5], [0.33, -0.43], [0.5, 0.15], [0.18, 0.5], [-0.4, 0.38]];
  const rings = [{ inset: 0.7, y: 0 }, { inset: 1, y: 0.28 }, { inset: 0.65, y: 1 }];
  const positions: number[] = [], colors: number[] = [];
  function vertex(ring: number, i: number, shade: number) {
    const p = outline[i]!, r = rings[ring]!;
    positions.push(p[0]! * r.inset, r.y, p[1]! * r.inset);
    colors.push(shade, shade, shade);
  }
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, shade = 0.92 + (i % 3) * 0.04;
    vertex(ring, i, shade); vertex(ring + 1, i, shade); vertex(ring + 1, j, shade);
    vertex(ring, i, shade); vertex(ring + 1, j, shade); vertex(ring, j, shade);
  }
  for (let i = 1; i < sides - 1; i++) {
    vertex(0, 0, 0.92); vertex(0, i, 0.92); vertex(0, i + 1, 0.92);
    vertex(2, 0, 1); vertex(2, i + 1, 1); vertex(2, i, 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Thin sand overlays share the terrain's global 2 m lattice and diagonal.
 * Matching every terrain triangle prevents a broad decal from cutting into slopes.
 * No terrain changes, transparent overdraw, textures, or extra material groups.
 */
export function createShoreSandGeometry(patches: readonly SandPatch[]): BufferGeometry {
  const positions: number[] = [];
  const used = new Set<string>();
  function vertex(x: number, z: number) { positions.push(x, shoreGroundHeight(x, z) + 0.025, z); }
  for (const patch of patches) {
    const reach = patch.length / 2 + patch.width + 4;
    for (let x = Math.floor((patch.x - reach) / 2) * 2; x < patch.x + reach; x += 2) {
      for (let z = Math.floor((patch.z - reach) / 2) * 2; z < patch.z + reach; z += 2) {
        const dx = x + 1 - patch.x, dz = z + 1 - patch.z;
        const across = dx * patch.normal.x + dz * patch.normal.z;
        const along = -dx * patch.normal.z + dz * patch.normal.x;
        const width = patch.width * (1 - 0.2 * (along / (patch.length / 2)) ** 2);
        if (Math.abs(along) > patch.length / 2 || across < 1 || across > width - 1) continue;
        const key = `${x}:${z}`;
        if (used.has(key) || !shorePlacementClear(x + 1, z + 1, Math.SQRT2)
          || [[x, z], [x + 2, z], [x, z + 2], [x + 2, z + 2]]
            .some(([px, pz]) => worldHeight(px!, pz!) <= 0)) continue;
        used.add(key);
        vertex(x, z); vertex(x, z + 2); vertex(x + 2, z);
        vertex(x + 2, z); vertex(x, z + 2); vertex(x + 2, z + 2);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
