import { riverPointAt } from "../layout/river";
import { worldHeight } from "../terrain/height";
import { SEA_INLAND_OVERLAP, SEA_SIZE } from "../water/sea";

export interface ShorePoint { readonly x: number; readonly z: number }
export interface ShoreSegment {
  readonly a: ShorePoint;
  readonly b: ShorePoint;
  readonly length: number;
}

const STEP = 4;

/** All zero contours under the sea plane, including the returning sides of the bay.
 * Triangulated marching cells avoid the ambiguous four-edge marching-square case.
 * Shared edge roots are bisected once; no z(x) assumption or authored shore curve.
 */
export function sampleShoreContour(): ShoreSegment[] {
  const mouth = riverPointAt(1);
  const minX = mouth.x - SEA_SIZE / 2;
  const minZ = mouth.z - 64;
  const rows = Math.ceil((64 + SEA_INLAND_OVERLAP) / STEP);
  const columns = SEA_SIZE / STEP;
  const points = Array.from({ length: (rows + 1) * (columns + 1) }, (_, id) => {
    const x = minX + (id % (columns + 1)) * STEP;
    const z = minZ + Math.floor(id / (columns + 1)) * STEP;
    return { x, z, height: worldHeight(x, z) };
  });
  const roots = new Map<string, ShorePoint>();
  function root(i: number, j: number): ShorePoint {
    const key = `${Math.min(i, j)}:${Math.max(i, j)}`;
    const existing = roots.get(key);
    if (existing) return existing;
    let a = points[i]!, b = points[j]!;
    for (let n = 0; n < 16; n++) {
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const middle = { x, z, height: worldHeight(x, z) };
      if ((middle.height > 0) === (a.height > 0)) a = middle;
      else b = middle;
    }
    const point = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    roots.set(key, point);
    return point;
  }
  const segments: ShoreSegment[] = [];
  function triangle(a: number, b: number, c: number) {
    const crossings: ShorePoint[] = [];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if ((points[i]!.height > 0) !== (points[j]!.height > 0)) crossings.push(root(i, j));
    }
    if (crossings.length !== 2) return;
    const [p, q] = crossings as [ShorePoint, ShorePoint];
    const length = Math.hypot(p.x - q.x, p.z - q.z);
    if (length > 0.001) segments.push({ a: p, b: q, length });
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, b = a + 1, c = a + columns + 1, d = c + 1;
    triangle(a, c, b);
    triangle(b, c, d);
  }
  return segments;
}

/** Unit normal toward dry ground, from the actual height function. */
export function shoreNormal(point: ShorePoint): ShorePoint {
  const dx = worldHeight(point.x + 0.2, point.z) - worldHeight(point.x - 0.2, point.z);
  const dz = worldHeight(point.x, point.z + 0.2) - worldHeight(point.x, point.z - 0.2);
  const length = Math.hypot(dx, dz);
  return { x: dx / length, z: dz / length };
}

/** Matches the existing 2 m terrain mesh/heightfield diagonal, including Float32 heights. */
export function shoreGroundHeight(x: number, z: number): number {
  const gx = Math.floor(x / 2) * 2, gz = Math.floor(z / 2) * 2;
  const u = (x - gx) / 2, v = (z - gz) / 2;
  const a = Math.fround(worldHeight(gx, gz)), b = Math.fround(worldHeight(gx + 2, gz));
  const c = Math.fround(worldHeight(gx, gz + 2)), d = Math.fround(worldHeight(gx + 2, gz + 2));
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
