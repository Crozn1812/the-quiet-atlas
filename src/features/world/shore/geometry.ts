import { BufferGeometry, Float32BufferAttribute } from "three";
import { createRockGeometry } from "../props/rocks";
import { worldHeight } from "../terrain/height";
import { shoreGroundHeight } from "./contour";
import { shorePlacementClear, type SandPatch } from "./layout";

/** Shared rock kit, normalized to the existing collider/instance coordinate system. */
export function createShoreRockGeometry(sides: 4 | 6): BufferGeometry {
  const geometry = createRockGeometry(sides === 4 ? "stone" : "boulder", sides);
  const { min, max } = geometry.boundingBox!;
  const x = max.x - min.x, y = max.y - min.y, z = max.z - min.z;
  const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2, bottom = min.y;
  geometry.scale(1 / x, 1 / y, 1 / z);
  geometry.translate(-cx / x, -bottom / y, -cz / z);
  // Shore already owns PALETTE instance pigments; retain neutral facet multipliers.
  const colors = geometry.getAttribute("color");
  let brightest = 0;
  for (let i = 0; i < colors.count; i++) brightest = Math.max(brightest, colors.getX(i));
  for (let i = 0; i < colors.count; i++) {
    const shade = 0.88 + 0.12 * colors.getX(i) / brightest;
    colors.setXYZ(i, shade, shade, shade);
  }
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
