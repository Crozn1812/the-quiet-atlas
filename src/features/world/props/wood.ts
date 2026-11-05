import { BufferGeometry, Color, Float32BufferAttribute, Quaternion, Vector3 } from "three";
import { PALETTE } from "../art/palette";

type Ring = Vector3[];
const pigment = Object.fromEntries(
  Object.entries(PALETTE).map(([key, value]) => [key, new Color(value)]),
) as Record<keyof typeof PALETTE, Color>;
const UP = new Vector3(0, 1, 0);

function randomFor(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Linear-space palette pigments, never multiplied by a second wood tint.
function wood(stripe: number, along = 0): Color {
  const grain = 0.46 + Math.sin(stripe * 2.7) * 0.24 + Math.sin(along * 4 + stripe) * 0.035;
  return pigment.rock.clone().lerp(pigment.rockDark, grain).lerp(pigment.dusk, 0.08);
}
const green = (wash: number) => pigment.forestDeep.clone().lerp(pigment.forestLight, wash);

/** One unindexed, flat-shaded mesh and one draw call with a single material. */
function builder() {
  const positions: number[] = [], colors: number[] = [];
  const triangle = (a: Vector3, b: Vector3, c: Vector3, color: Color) => {
    for (const point of [a, b, c]) {
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    }
  };
  return {
    triangle,
    quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color) {
      triangle(a, b, c, color); triangle(a, c, d, color);
    },
    add(part: BufferGeometry) {
      positions.push(...part.getAttribute("position").array);
      colors.push(...part.getAttribute("color").array);
      part.dispose();
    },
    finish(ground = true): BufferGeometry {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
      geometry.computeBoundingBox();
      if (ground) geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}
type Builder = ReturnType<typeof builder>;

// Rings wind clockwise viewed along +Y. This order keeps all bark faces outward.
function sides(mesh: Builder, rings: Ring[], paint: (strip: number, edge: number) => Color) {
  for (let strip = 0; strip < rings.length - 1; strip++) {
    const a = rings[strip]!, b = rings[strip + 1]!;
    for (let j = 0; j < a.length; j++) {
      const next = (j + 1) % a.length;
      mesh.quad(a[j]!, b[j]!, b[next]!, a[next]!, paint(strip, j));
    }
  }
}

function cap(mesh: Builder, rim: Ring, center: Vector3, top: boolean, color: Color) {
  for (let j = 0; j < rim.length; j++) {
    const next = (j + 1) % rim.length;
    if (top) mesh.triangle(center, rim[next]!, rim[j]!, color);
    else mesh.triangle(center, rim[j]!, rim[next]!, color);
  }
}

/** Two thin age rings are pigment bands in the cap, with no overlay/z-fighting. */
function cutCap(mesh: Builder, rim: Ring, center: Vector3, top: boolean) {
  const radii = [0.3, 0.36, 0.64, 0.70, 1];
  let inner: Ring | undefined;
  for (let band = 0; band < radii.length; band++) {
    const outer = rim.map(point => center.clone().lerp(point, radii[band]!));
    const color = pigment.sand.clone().lerp(pigment.dusk, band % 2 ? 0.095 : 0.025);
    if (!inner) cap(mesh, outer, center, top, color);
    else {
      for (let j = 0; j < rim.length; j++) {
        const next = (j + 1) % rim.length;
        if (top) mesh.quad(inner[j]!, inner[next]!, outer[next]!, outer[j]!, color);
        else mesh.quad(inner[j]!, outer[j]!, outer[next]!, inner[next]!, color);
      }
    }
    inner = outer;
  }
}

function roundRing(count: number, radius: number, y: number, x = 0, z = 0): Ring {
  return Array.from({ length: count }, (_, j) => {
    const angle = j * Math.PI * 2 / count;
    return new Vector3(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius);
  });
}

function branch(root: Vector3, tip: Vector3, radius: number, stripe: number): BufferGeometry {
  const mesh = builder(), length = root.distanceTo(tip);
  const rings = [roundRing(6, radius, 0), roundRing(6, radius * 0.62, length)];
  sides(mesh, rings, (_, edge) => wood(edge + stripe));
  cap(mesh, rings[0]!, new Vector3(), false, wood(stripe));
  cap(mesh, rings[1]!, new Vector3(0, length, 0), true, pigment.sand.clone().lerp(pigment.dusk, 0.04));
  return mesh.finish(false)
    .applyQuaternion(new Quaternion().setFromUnitVectors(UP, tip.clone().sub(root).normalize()))
    .translate(root.x, root.y, root.z);
}

/** Grounded, X-long fallen trunk, 2.2–3.8 m. 268/292 triangles (2/3 broken limbs). */
export function createLogGeometry(seed: number): BufferGeometry {
  const random = randomFor(seed), mesh = builder();
  const length = 2.2 + random() * 1.6, radius = 0.22 + random() * 0.065;
  const taper = 0.72 + random() * 0.12;
  const rings = [0, 0.5, 1].map(t => roundRing(10, radius * (1 - t * (1 - taper)),
    (t - 0.5) * length, Math.sin(t * Math.PI) * 0.035, t * 0.025));
  sides(mesh, rings, (strip, edge) => {
    // After rotating Y to X, local -X is the upward side of the log.
    const upward = -Math.cos((edge + 0.5) * Math.PI * 2 / 10);
    return upward > 0.5 && (edge + strip + (seed >>> 0) % 3) % 3 !== 0
      ? green(0.3 + strip * 0.2) : wood(edge, strip);
  });
  cutCap(mesh, rings[0]!, new Vector3(0, -length / 2, 0), false);
  cutCap(mesh, rings[2]!, new Vector3(0, length / 2, 0.025), true);
  for (let i = 0; i < 2 + (seed >>> 0) % 2; i++) {
    const angle = 2.1 + random() * 2, t = 0.2 + i * 0.23 + random() * 0.06;
    const r = radius * (1 - t * (1 - taper));
    const root = new Vector3(Math.cos(angle) * r * 0.83, (t - 0.5) * length, Math.sin(angle) * r * 0.83);
    const tip = root.clone().add(new Vector3(Math.cos(angle) * 0.24, 0.07 + random() * 0.1, Math.sin(angle) * 0.24));
    mesh.add(branch(root, tip, 0.065 + random() * 0.02, i));
  }
  const geometry = mesh.finish(false).rotateZ(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Grounded stump with six flared root buttresses and a ragged cut; 168 triangles. */
export function createStumpGeometry(seed: number): BufferGeometry {
  const random = randomFor(seed), mesh = builder();
  const height = 0.48 + random() * 0.22, radius = 0.27 + random() * 0.07;
  const roots = roundRing(12, radius, 0);
  roots.forEach((point, j) => point.multiplyScalar(j % 2 ? 1.08 : 1.65 + random() * 0.3));
  const shoulder = roundRing(12, radius * 0.96, height * 0.3, 0.015);
  const cut = roundRing(12, radius * 0.85, height, 0.025, 0.01);
  cut.forEach(point => { point.y += (random() - 0.5) * 0.09; });
  sides(mesh, [roots, shoulder, cut], (strip, edge) => wood(edge, strip));
  cap(mesh, roots, new Vector3(), false, wood(1));
  cutCap(mesh, cut, new Vector3(0.025, height - 0.012, 0.01), true);
  return mesh.finish();
}

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive.`);
}

/** Ten-sided chamfered cross-section, three length stations, 60 triangles. */
function plank(length: number, seed: number, width: number, thickness: number): BufferGeometry {
  const random = randomFor(seed), mesh = builder();
  const w = width / 2, h = thickness / 2, bevel = Math.min(h * 0.4, w * 0.1);
  const outline = [
    [-h + bevel, -w], [h - bevel, -w], [h, -w + bevel], [h, w - bevel],
    [h - bevel, w], [-h + bevel, w], [-h, w - bevel], [-h, w / 3], [-h, -w / 3], [-h, -w + bevel],
  ];
  const bow = 0.005 + random() * 0.009, twist = (random() - 0.5) * 0.1;
  const rings = [0, 0.5, 1].map(t => outline.map(([x, z]) => new Vector3(
    x! + Math.sin(t * Math.PI) * bow + z! * twist * (t * 2 - 1), (t - 0.5) * length, z!,
  )));
  sides(mesh, rings, (strip, edge) => wood(edge, strip * 0.5 + random()));
  cap(mesh, rings[0]!, new Vector3(0, -length / 2, 0), false, wood(2));
  cap(mesh, rings[2]!, new Vector3(0, length / 2, 0), true, wood(3));
  return mesh.finish(false).rotateZ(-Math.PI / 2);
}

/** X-long board, centred at the origin; length is exact, width 0.22–0.25 m. */
export function createPlankGeometry(length: number, seed: number): BufferGeometry {
  positive(length, "length");
  return plank(length, seed, 0.22 + randomFor(seed)() * 0.03, 0.055);
}

function post(height: number, seed: number, radius: number): BufferGeometry {
  const random = randomFor(seed), mesh = builder(), count = 6 + (seed >>> 0) % 3;
  const leanX = (random() - 0.5) * 0.045, leanZ = (random() - 0.5) * 0.035;
  const bevel = Math.min(0.055, height * 0.15);
  const rings = [roundRing(count, radius, 0),
    roundRing(count, radius * 0.92, height - bevel, leanX * 0.9, leanZ * 0.9),
    roundRing(count, radius * 0.55, height, leanX, leanZ)];
  sides(mesh, rings, (strip, edge) => wood(edge, strip));
  cap(mesh, rings[0]!, new Vector3(), false, wood(1));
  cap(mesh, rings[2]!, new Vector3(leanX, height, leanZ), true, wood(2));
  return mesh.finish();
}

/** Grounded 6–8-sided hewn post with a bevelled head; exact height, 36–48 triangles. */
export function createPostGeometry(height: number, seed: number): BufferGeometry {
  positive(height, "height");
  return post(height, seed, 0.072 + randomFor(seed)() * 0.012);
}

function vine(mesh: Builder, span: number, seed: number) {
  const random = randomFor(seed), points = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return new Vector3((t - 0.5) * span, 0.15 + 0.8 * t + Math.sin(t * Math.PI * 4) * 0.15,
      0.12 + Math.sin(t * Math.PI * 6) * 0.025);
  });
  const rings = points.map((point, i) => {
    const direction = points[Math.min(i + 1, 16)]!.clone().sub(points[Math.max(0, i - 1)]!).normalize();
    const rotation = new Quaternion().setFromUnitVectors(UP, direction);
    return roundRing(4, 0.009, 0).map(vertex => vertex.applyQuaternion(rotation).add(point));
  });
  sides(mesh, rings, (_, edge) => green(0.2 + edge * 0.12));
  cap(mesh, rings[0]!, points[0]!, false, green(0.2));
  cap(mesh, rings[16]!, points[16]!, true, green(0.2));
  for (let i = 1; i < 16; i++) {
    const root = points[i]!, side = i % 2 ? -1 : 1;
    const tip = root.clone().add(new Vector3(side * (0.075 + random() * 0.03), 0.06, 0.015));
    const middle = root.clone().lerp(tip, 0.5);
    const a = middle.clone().add(new Vector3(-0.025, 0.025, 0.012));
    const b = middle.clone().add(new Vector3(0.025, -0.025, 0.012));
    // Thin leaves have both windings so the single-sided material sees either side.
    mesh.quad(root, a, tip, b, green(0.5));
    mesh.quad(b, tip, a, root, green(0.35));
    if (i % 4 !== 2) continue;
    const center = tip.clone().add(new Vector3(0, 0, 0.022)), r = 0.025 + random() * 0.006;
    const petal = [new Vector3(r, 0, 0), new Vector3(0, r, 0), new Vector3(-r, 0, 0), new Vector3(0, -r, 0)]
      .map(point => point.add(center));
    for (let j = 0; j < 4; j++) {
      const next = (j + 1) % 4;
      mesh.triangle(center.clone().add(new Vector3(0, 0, r * 0.45)), petal[j]!, petal[next]!, pigment.flower);
      mesh.triangle(center.clone().add(new Vector3(0, 0, -r * 0.45)), petal[next]!, petal[j]!, pigment.flower);
    }
  }
}

/** Grounded 2.1–2.5 m rural span. Optional vines have four tiny orange flowers.
 * At most 504 triangles, one material; the wood is identical in both options. */
export function createFenceSpanGeometry(seed: number, { flowers }: { flowers: boolean }): BufferGeometry {
  const random = randomFor(seed), mesh = builder(), span = 2.1 + random() * 0.35;
  for (const side of [-1, 1]) {
    mesh.add(createPostGeometry(1.05 + random() * 0.15, seed + (side === -1 ? 11 : 23))
      .translate(side * span / 2, 0, (random() - 0.5) * 0.04));
  }
  const rails = 2 + (seed >>> 0) % 2;
  for (let i = 0; i < rails; i++) {
    mesh.add(plank(span + 0.08, seed + 41 + i, 0.14, 0.055)
      .rotateX(-Math.PI / 2 + 0.04).rotateZ((random() - 0.5) * 0.035)
      .translate(0, 0.36 + i * 0.52 / (rails - 1), 0.06));
  }
  if (flowers) vine(mesh, span, seed + 73);
  return mesh.finish();
}

/** Grounded bench: two seat planks, two back slats, four hewn supports.
 * Back height 0.88–0.94 m, seat 0.45 m, 384–432 triangles. */
export function createBenchGeometry(seed: number): BufferGeometry {
  const random = randomFor(seed), mesh = builder();
  const length = 1.55 + random() * 0.2, height = 0.88 + random() * 0.06;
  for (const x of [-length * 0.38, length * 0.38]) {
    for (const z of [-0.16, 0.2]) {
      mesh.add(post(z > 0 ? height : 0.43, seed + (x < 0 ? 5 : 17) + (z > 0 ? 1 : 0), 0.045)
        .translate(x, 0, z));
    }
  }
  for (let i = 0; i < 2; i++) {
    mesh.add(plank(length, seed + 31 + i, 0.215, 0.055).translate(0, 0.45, (i - 0.5) * 0.23));
    mesh.add(plank(length - 0.04, seed + 43 + i, 0.16, 0.05)
      .rotateX(-Math.PI / 2 + 0.1).translate(0, i === 0 ? 0.63 : height - 0.082, 0.22));
  }
  return mesh.finish();
}
