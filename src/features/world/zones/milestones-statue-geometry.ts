import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector2, Vector3 } from "three";
import type { MilestoneCertificatePiece } from "./milestones";

export interface CertificateSlot {
  certificate: MilestoneCertificatePiece;
  center: Vector3;
  outline: Vector2[];
  floating: Vector3;
  width: number;
  height: number;
}

/** Every content entry owns one unique convex shard, including an empty socket when planned. */
export function certificateSlots(certificates: readonly MilestoneCertificatePiece[]): CertificateSlot[] {
  const columns = certificates.length === 1 ? 1 : 2;
  const rows = Math.max(2, Math.ceil(certificates.length / columns));
  const width = .74, height = 1.42 / rows;
  return certificates.map((certificate, index) => {
    const x = columns === 1 ? 0 : (index % columns - .5) * .84;
    const y = 4.48 - Math.floor(index / columns) * (1.55 / rows);
    const shape = [[-.48, -.34], [.18, -.49], [.5, -.12], [.37, .44], [-.4, .48]];
    const outline = shape.map(([u, v]) => new Vector2(x + u! * width, y + v! * height));
    return { certificate, center: new Vector3(x, y, .4), outline,
      floating: new Vector3((index % columns === 0 ? -1 : 1) * (1.48 + .14 * Math.floor(index / columns)), y + .12, .95), width, height };
  });
}

type Vertex = { p: Vector3; n: Vector3; c: Vector3; uv: Vector2 };
const side = (point: Vector3, a: Vector2, b: Vector2) => (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);

function clip(polygon: Vertex[], a: Vector2, b: Vector2, inside: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i]!, to = polygon[(i + 1) % polygon.length]!;
    const da = side(from.p, a, b), db = side(to.p, a, b);
    if (inside ? da >= 0 : da <= 0) result.push(from);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      result.push({ p: from.p.clone().lerp(to.p, t), n: from.n.clone().lerp(to.n, t).normalize(), c: from.c.clone().lerp(to.c, t), uv: from.uv.clone().lerp(to.uv, t) });
    }
  }
  return result;
}

/** Subtract each planned pentagonal prism from all body layers, including its back.
 * This is real static geometry: shadow maps and raycasts see the same through-holes.
 */
export function cutCertificateSockets(source: BufferGeometry, slots: readonly CertificateSlot[]): BufferGeometry {
  const flat = source.index ? source.toNonIndexed() : source.clone();
  const position = flat.getAttribute("position"), normal = flat.getAttribute("normal");
  const color = flat.getAttribute("color");
  const uv = flat.getAttribute("uv");
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], uvs: number[] = [];
  const gaps = slots.filter(slot => !slot.certificate.achieved);
  const emit = (polygon: Vertex[]) => {
    for (let j = 1; j < polygon.length - 1; j++) for (const vertex of [polygon[0]!, polygon[j]!, polygon[j + 1]!]) {
      positions.push(vertex.p.x, vertex.p.y, vertex.p.z); normals.push(vertex.n.x, vertex.n.y, vertex.n.z);
      colors.push(vertex.c.x, vertex.c.y, vertex.c.z);
      uvs.push(vertex.uv.x, vertex.uv.y);
    }
  };
  for (let i = 0; i < position.count; i += 3) {
    let polygons: Vertex[][] = [[0, 1, 2].map(j => ({ p: new Vector3().fromBufferAttribute(position, i + j), n: new Vector3().fromBufferAttribute(normal, i + j),
      c: color ? new Vector3().fromBufferAttribute(color, i + j) : new Vector3(1, 1, 1),
      uv: uv ? new Vector2(uv.getX(i + j), uv.getY(i + j)) : new Vector2() }))];
    for (const gap of gaps) {
      const next: Vertex[][] = [];
      for (const polygon of polygons) {
        let remaining = polygon;
        for (let edge = 0; edge < gap.outline.length && remaining.length >= 3; edge++) {
          const a = gap.outline[edge]!, b = gap.outline[(edge + 1) % gap.outline.length]!;
          const outside = clip(remaining, a, b, false);
          if (outside.length >= 3) next.push(outside);
          remaining = clip(remaining, a, b, true);
        }
      }
      polygons = next;
    }
    polygons.forEach(emit);
  }
  // Join the front and rear openings with dark inward-facing walls. Nothing
  // caps the hole: the shadow map, rays and rear view still see through it.
  const probeMaterial = new MeshBasicMaterial({ side: DoubleSide }), probe = new Mesh(source, probeMaterial);
  probe.updateMatrixWorld(true);
  const ray = new Raycaster();
  for (const gap of gaps) {
    const ends = gap.outline.map(p => {
      ray.set(new Vector3(p.x, p.y, 3), new Vector3(0, 0, -1));
      const hits = ray.intersectObject(probe);
      return [new Vector3(p.x, p.y, hits[0]?.point.z ?? .3),
        new Vector3(p.x, p.y, hits.at(-1)?.point.z ?? -.3)];
    });
    for (let j = 0; j < ends.length; j++) {
      const [a, d] = ends[j]!, [b, c] = ends[(j + 1) % ends.length]!;
      const n = b!.clone().sub(a!).cross(d!.clone().sub(a!)).normalize();
      const vertex = (p: Vector3, shade: number): Vertex => ({ p, n, c: new Vector3(shade, shade, shade), uv: new Vector2() });
      emit([vertex(a!, .42), vertex(b!, .42), vertex(c!, .13), vertex(d!, .13)]);
    }
  }
  probeMaterial.dispose();
  flat.dispose();
  const result = new BufferGeometry();
  result.setAttribute("position", new Float32BufferAttribute(positions, 3));
  result.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  result.setAttribute("color", new Float32BufferAttribute(colors, 3));
  result.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}
