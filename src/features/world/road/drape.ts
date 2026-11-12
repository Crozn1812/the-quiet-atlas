import { Color, Vector3 } from "three";

type Vertex = { point: Vector3; color: Color };

/** Clip a road triangle to the exact 2 m terrain triangles. Each resulting
 * face is coplanar with its physics support, including cell diagonals.
 * Construction only; no extra colliders, draws, or work during gameplay.
 */
export function drapeRoadTriangle(
  points: readonly [Vector3, Vector3, Vector3],
  colors: readonly [Color, Color, Color],
  heightAt: (x: number, z: number) => number,
  lift: number,
  emit: (a: Vector3, b: Vector3, c: Vector3, colors: readonly [Color, Color, Color]) => void,
  preserve: (point: Vector3) => number = () => 0,
) {
  const source = points.map((point, i) => ({ point, color: colors[i]! }));
  const clip = (polygon: Vertex[], distance: (p: Vector3) => number) => {
    const result: Vertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const da = distance(a.point), db = distance(b.point);
      if (da >= 0) result.push(a);
      if ((da < 0) !== (db < 0)) {
        const t = da / (da - db);
        result.push({ point: a.point.clone().lerp(b.point, t), color: a.color.clone().lerp(b.color, t) });
      }
    }
    return result;
  };
  const minX = Math.floor(Math.min(...points.map(p => p.x)) / 2) * 2;
  const minZ = Math.floor(Math.min(...points.map(p => p.z)) / 2) * 2;
  const maxX = Math.max(...points.map(p => p.x)), maxZ = Math.max(...points.map(p => p.z));
  for (let x = minX; x <= maxX; x += 2) for (let z = minZ; z <= maxZ; z += 2) {
    let square = clip(source, p => p.x - x);
    square = clip(square, p => x + 2 - p.x);
    square = clip(square, p => p.z - z);
    square = clip(square, p => z + 2 - p.z);
    for (const sign of [-1, 1]) {
      const polygon = clip(square, p => sign * (p.x + p.z - x - z - 2));
      for (let i = 1; i < polygon.length - 1; i++) {
        const vertices = [polygon[0]!, polygon[i]!, polygon[i + 1]!] as const;
        const [a, b, c] = vertices.map(({ point }) => {
          const ground = heightAt(point.x, point.z) + lift;
          return new Vector3(point.x, ground + (point.y - ground) * preserve(point), point.z);
        }) as [Vector3, Vector3, Vector3];
        if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-14) continue;
        emit(a, b, c, vertices.map(v => v.color) as [Color, Color, Color]);
      }
    }
  }
}
