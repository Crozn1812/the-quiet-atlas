import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from "three";

function erosion(x: number, y: number, z: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  let value = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const hash = Math.sin((ix + a) * 127.1 + (iy + b) * 311.7 + (iz + c) * 74.7 + seed) * 43758.5453;
    value += (hash - Math.floor(hash)) * (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (c ? fz : 1 - fz);
  }
  return value * 2 - 1;
}

/** Tilted sediment beds, narrow vertical joints and runoff stains. */
function relief(x: number, y: number, seed: number) {
  const bed = y * 5 + x * 0.15 + 0.08 * Math.sin(x * 4 + seed);
  const phase = bed - Math.floor(bed);
  const joint = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(x * 7 + seed + y * 0.22)) * 9), 2);
  return { depth: 0.03 * (phase < 0.2 ? phase / 0.2 : (1 - phase) / 0.8)
    - 0.045 * joint + 0.006 * erosion(x * 9, y * 15, 0, seed),
    moss: Math.max(0, 1 - Math.abs(phase - 0.23) * 10), joint };
}

function pigment(x: number, y: number, seed: number) {
  const layer = relief(x, y, seed);
  const damp = Math.pow(Math.max(0, Math.sin(x * 12 + seed + Math.sin(y * 2) * 0.18)), 12);
  return new Color(0xa6997d).lerp(new Color(0x54603a), layer.moss * 0.65)
    .multiplyScalar((0.88 + 0.12 * erosion(x * 5, y * 6, 0, seed)) * (1 - layer.joint * 0.5 - damp * 0.32));
}

/** Closed angular plates with nearly vertical faces and broken crests. */
export function createCliffRockGeometry(seed: number, talus: boolean) {
  const geometry = talus ? new IcosahedronGeometry(1, 1) : new BoxGeometry(2, 2, 2, 20, 32, 8);
  const p = geometry.getAttribute("position"), colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const layer = relief(x + z * 0.23, y, seed);
    const bevel = 0.11 * Math.max(0, Math.abs(x) + Math.abs(z) - 1.25);
    const crown = 0.11 * erosion(x * 4, 0, z * 4, seed) - 0.08 * Math.abs(Math.sin(x * 8 + z * 5 + seed));
    const rough = talus ? 0.12 * erosion(x * 3, y * 3, z * 3, seed) : layer.depth;
    p.setXYZ(i, x * (1 - bevel) + x * rough * 0.35,
      y + Math.max(0, y) * crown + (talus ? x * 0.17 + z * 0.13 : 0),
      z * (1 - bevel + rough) - Math.max(0, y) * 0.035);
    const color = pigment(x + z * 0.23, y, seed);
    colors.push(color.r, color.g, color.b);
  }
  geometry.deleteAttribute("uv");
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  if (!geometry.index) return geometry;
  const flat = geometry.toNonIndexed(); geometry.dispose();
  return flat;
}

/** Closed four-sided escarpment connecting the high ridge to the spring. */
export function createCliffRibbon(front: { base: Vector3; top: Vector3; back: Vector3; backTop: Vector3 }[]) {
  const positions: number[] = [], colors: number[] = [];
  const rows = 32, steps = (front.length - 1) * 12;
  const point = (u: number, v: number) => {
    const span = Math.min(front.length - 2, Math.floor(u));
    const t = u - span, a = front[span]!, b = front[span + 1]!;
    const base = a.base.clone().lerp(b.base, t), top = a.top.clone().lerp(b.top, t);
    const back = a.back.clone().lerp(b.back, t), backTop = a.backTop.clone().lerp(b.backTop, t);
    const edge = v * 4;
    const p = edge <= 1 ? base.clone().lerp(top, edge) : edge <= 2 ? top.clone().lerp(backTop, edge - 1)
      : edge <= 3 ? backTop.clone().lerp(back, edge - 2) : back.clone().lerp(base, edge - 3);
    const rise = edge <= 1 ? edge : edge <= 2 ? 1 : edge <= 3 ? 3 - edge : 0;
    const bed = relief(u * 0.65, p.y * 0.15, 807);
    p.x += bed.depth * 1.4; p.z += bed.depth * 2;
    p.y += rise * (0.19 * Math.sin(u * 13) + 0.12 * Math.sin(u * 23));
    return p;
  };
  for (let s = 0; s < steps; s++) for (let r = 0; r < rows; r++) {
    const a = point(s / 12, r / rows), b = point((s + 1) / 12, r / rows);
    const c = point(s / 12, (r + 1) / rows), d = point((s + 1) / 12, (r + 1) / rows);
    for (const p of [a, b, c, b, d, c]) {
      positions.push(p.x, p.y, p.z);
      const color = pigment((p.x + p.z) * 0.13, p.y * 0.15, 807);
      colors.push(color.r, color.g, color.b);
    }
  }
  // Seal the two ends with the same sampled profile.
  for (const u of [0, front.length - 1]) for (let r = 0; r < rows; r++) {
    const center = point(u, 0).add(point(u, 0.5)).multiplyScalar(0.5);
    const rim = [point(u, r / rows), point(u, (r + 1) / rows)];
    if (u === 0) rim.reverse();
    for (const p of [center, ...rim]) { positions.push(p.x, p.y, p.z); colors.push(0.28, 0.24, 0.17); }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
