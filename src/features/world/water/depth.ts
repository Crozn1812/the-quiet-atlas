import { BufferGeometry, DataTexture, Float32BufferAttribute, LinearFilter, RedFormat } from "three";
import { createSurfaceSampler } from "../terrain/height";

/** Bake once against the rendered terrain, never query the heightfield per frame.
 * Ribbon rows carry left/centre/right depths so the two-vertex strip can still
 * reveal its bed in the middle. Other surfaces interpolate vertex depths.
 */
export function bakeWaterDepth(geometry: BufferGeometry, ribbon = false, height = createSurfaceSampler()): void {
  const positions = geometry.getAttribute("position");
  const depths = new Float32Array(positions.count * 3);
  const depthAt = (x: number, y: number, z: number) => Math.max(0, y - height(x, z));
  if (ribbon) {
    for (let i = 0; i < positions.count; i += 2) {
      const left = depthAt(positions.getX(i), positions.getY(i), positions.getZ(i));
      const right = depthAt(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
      const centre = depthAt((positions.getX(i) + positions.getX(i + 1)) / 2,
        positions.getY(i), (positions.getZ(i) + positions.getZ(i + 1)) / 2);
      depths.set([left, centre, right, left, centre, right], i * 3);
    }
  } else {
    for (let i = 0; i < positions.count; i++) {
      const depth = depthAt(positions.getX(i), positions.getY(i), positions.getZ(i));
      depths.fill(depth, i * 3, i * 3 + 3);
    }
  }
  geometry.setAttribute("waterBedDepth", new Float32BufferAttribute(depths, 3));
}

export const STREAM_DEPTH_COLUMNS = 65;
export const STREAM_BANK_COLUMNS = 9;

/** 65 depth samples across each existing ribbon row. R8 encodes -1..3 metres
 * at 1.6 cm precision; linear filtering softens the real terrain intersections.
 * One additional strip draw stains the dry soil without changing any collider.
 */
export function bakeStreamOptics(geometry: BufferGeometry, height = createSurfaceSampler()) {
  const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  const rows = positions.count / 2, columns = STREAM_DEPTH_COLUMNS;
  const data = new Uint8Array(rows * columns);
  const bankPositions: number[] = [], bankDepths: number[] = [], bankUv: number[] = [], indices: number[] = [];
  const profile = new Float64Array(columns);
  for (let row = 0; row < rows; row++) {
    const left = row * 2, right = left + 1;
    const x0 = positions.getX(left), z0 = positions.getZ(left), y = positions.getY(left);
    const dx = positions.getX(right) - x0, dz = positions.getZ(right) - z0;
    for (let column = 0; column < columns; column++) {
      const u = column / (columns - 1);
      const depth = y - height(x0 + dx * u, z0 + dz * u);
      profile[column] = depth;
      data[row * columns + column] = Math.round(Math.max(0, Math.min(1, (depth + 1) / 4)) * 255);
    }
    const bankAt = (side: number, target: number) => {
      const middle = (columns - 1) / 2;
      // Dry zone footprints and bridge approaches must not acquire fake banks.
      if (profile[middle]! <= 0) return middle / (columns - 1);
      for (let j = middle; j > 0 && j < columns - 1; j += side) {
        const a = profile[j]!, b = profile[j + side]!;
        if (b <= target) {
          const fraction = Math.max(0, Math.min(1, (a - target) / Math.max(0.000001, a - b)));
          return (j + side * fraction) / (columns - 1);
        }
      }
      return side < 0 ? 0 : 1;
    };
    for (const side of [-1, 1]) {
      const outer = bankAt(side, -0.20), inner = bankAt(side, 0.30);
      for (let column = 0; column < STREAM_BANK_COLUMNS; column++) {
        const fraction = column / (STREAM_BANK_COLUMNS - 1);
        const u = side < 0 ? outer + (inner - outer) * fraction : inner + (outer - inner) * fraction;
        const x = x0 + dx * u, z = z0 + dz * u, ground = height(x, z);
        const depth = y - ground;
        bankPositions.push(x, ground + 0.012, z);
        bankDepths.push(depth, depth, depth);
        bankUv.push(u, uv.getY(left));
      }
    }
    if (row < rows - 1) for (const side of [0, 1]) for (let column = 0; column < STREAM_BANK_COLUMNS - 1; column++) {
      const a = row * STREAM_BANK_COLUMNS * 2 + side * STREAM_BANK_COLUMNS + column;
      const b = a + STREAM_BANK_COLUMNS * 2;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const texture = new DataTexture(data, columns, rows, RedFormat);
  texture.name = "stream-signed-depth";
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  const banks = new BufferGeometry();
  banks.setAttribute("position", new Float32BufferAttribute(bankPositions, 3));
  banks.setAttribute("waterBedDepth", new Float32BufferAttribute(bankDepths, 3));
  banks.setAttribute("uv", new Float32BufferAttribute(bankUv, 2));
  banks.setIndex(indices);
  banks.computeVertexNormals();
  banks.computeBoundingSphere();
  return { texture, banks };
}
