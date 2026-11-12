import {
  BoxGeometry, BufferGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide,
  Float32BufferAttribute, Group, Mesh, OctahedronGeometry, Quaternion, TorusGeometry, Vector3,
  type MeshToonMaterial,
} from "three";
import type { Secret } from "../../story/secrets";
import { PALETTE } from "../art/palette";
import { createPropMaterial } from "./materials";

export type SecretLandmark = Secret["landmark"];
type Point = readonly [number, number, number];
export type Surface =
  | "wood"
  | "vine"
  | "leaf"
  | "flower"
  | "mirror"
  | "stone"
  | "chime"
  | "mist"
  | "glow"
  | "mote";

const ATMOSPHERIC_SURFACES: ReadonlySet<Surface> = new Set(["mist", "glow", "mote"]);

/** Only palette pigments; solid surfaces stay matte R1 while mist/glow/mote add quiet mystery. */
function materialFor(surface: Surface): MeshToonMaterial {
  const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
  switch (surface) {
    case "vine": material.color.set(PALETTE.forestDeep); break;
    case "leaf": material.color.set(PALETTE.forestLight); break;
    case "flower": material.color.set(PALETTE.flower); break;
    case "mirror": material.color.set(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.35); break;
    case "stone": material.color.set(PALETTE.mist).lerp(new Color(PALETTE.ink), 0.14); break;
    case "chime": material.color.set(PALETTE.dusk).lerp(new Color(PALETTE.paper), 0.55); break;
    case "mist":
      material.color.set(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.45);
      material.emissive.set(PALETTE.mist).multiplyScalar(0.12);
      material.transparent = true;
      material.opacity = 0.16;
      material.depthWrite = false;
      break;
    case "glow":
      material.color.set(PALETTE.sunGold).lerp(new Color(PALETTE.paper), 0.5);
      material.emissive.set(PALETTE.sunGold).lerp(new Color(PALETTE.mist), 0.35).multiplyScalar(0.2);
      material.transparent = true;
      material.opacity = 0.11;
      material.depthWrite = false;
      break;
    case "mote":
      material.color.set(PALETTE.sunGold).lerp(new Color(PALETTE.paper), 0.35);
      material.emissive.set(PALETTE.sunGold).lerp(new Color(PALETTE.paper), 0.25).multiplyScalar(0.45);
      break;
  }
  if (
    surface === "mirror"
    || surface === "flower"
    || surface === "chime"
    || ATMOSPHERIC_SURFACES.has(surface)
  ) {
    material.side = DoubleSide;
  }
  return material;
}

interface BatchData {
  positions: number[];
  alphas: number[];
}

/** Batch by pigment within each pivot. Temporary primitives never survive the build. */
function builder(root: Group) {
  const batches = new Map<Group, Map<Surface, BatchData>>();
  return {
    add(part: BufferGeometry, surface: Surface, parent = root) {
      let surfaces = batches.get(parent);
      if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
      let data = surfaces.get(surface);
      if (!data) { data = { positions: [], alphas: [] }; surfaces.set(surface, data); }
      const vertices = part.getAttribute("position");
      const alphaAttr = part.getAttribute("alpha");
      const count = part.index?.count ?? vertices.count;
      for (let i = 0; i < count; i++) {
        const index = part.index?.getX(i) ?? i;
        data.positions.push(vertices.getX(index), vertices.getY(index), vertices.getZ(index));
        data.alphas.push(alphaAttr ? alphaAttr.getX(index) : 1);
      }
      part.dispose();
    },
    finish() {
      const geometries: BufferGeometry[] = [];
      const materials = new Map<Surface, MeshToonMaterial>();
      for (const [parent, surfaces] of batches) {
        for (const [surface, { positions, alphas }] of surfaces) {
          const colors: number[] = [];
          const neutral = surface === "flower" || surface === "mirror" || ATMOSPHERIC_SURFACES.has(surface);
          const useAlpha = surface === "glow" || surface === "mist";
          for (let i = 0, v = 0; i < positions.length; i += 3, v++) {
            const wash = neutral ? 1
              : 0.955 + 0.02 * Math.sin(positions[i]! * 91 + positions[i + 2]! * 73)
                + 0.015 * Math.sin(positions[i + 1]! * 19);
            if (useAlpha) colors.push(wash, wash, wash, alphas[v] ?? 1);
            else colors.push(wash, wash, wash);
          }
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
          geometry.setAttribute("color", new Float32BufferAttribute(colors, useAlpha ? 4 : 3));
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          geometries.push(geometry);
          let material = materials.get(surface);
          if (!material) { material = materialFor(surface); materials.set(surface, material); }
          const mesh = new Mesh(geometry, material);
          mesh.name = surface;
          const atmospheric = ATMOSPHERIC_SURFACES.has(surface);
          mesh.castShadow = !atmospheric && surface !== "mirror";
          mesh.receiveShadow = !atmospheric;
          if (atmospheric) mesh.raycast = () => {};
          parent.add(mesh);
        }
      }
      let disposed = false;
      // Own only these resources. The shared ramp remains owned by the world cache.
      root.userData.dispose = () => {
        if (disposed) return;
        disposed = true;
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
      };
    },
  };
}

type Builder = ReturnType<typeof builder>;

function box(size: Point, center: Point): BufferGeometry {
  return new BoxGeometry(...size).translate(...center);
}

function between(part: BufferGeometry, start: Point, end: Point): BufferGeometry {
  const from = new Vector3(...start), to = new Vector3(...end);
  const direction = to.clone().sub(from).normalize();
  return part.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction))
    .translate(...from.add(to).multiplyScalar(0.5).toArray());
}

function rod(start: Point, end: Point, radius: number, sides = 4): BufferGeometry {
  return between(new CylinderGeometry(radius, radius, new Vector3(...start).distanceTo(new Vector3(...end)), sides), start, end);
}

function beam(start: Point, end: Point, width: number): BufferGeometry {
  return between(new BoxGeometry(width, new Vector3(...start).distanceTo(new Vector3(...end)), width), start, end);
}

function leaf(build: Builder, point: Point, angle: number, parent?: Group) {
  build.add(new OctahedronGeometry(1, 0).scale(0.155, 0.29, 0.065)
    .rotateZ(angle).rotateY(angle * 0.4).translate(...point), "leaf", parent);
}

/** Five lobes facing the viewer; scaled for 15 m readability while keeping accent area < 8%. */
function flower(build: Builder, point: Point, parent?: Group) {
  const positions: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5, b = (i + 1) * Math.PI / 5;
    const ra = i % 2 === 0 ? 0.105 : 0.056, rb = i % 2 === 0 ? 0.056 : 0.105;
    positions.push(0, 0, 0, Math.cos(a) * ra, Math.sin(a) * ra, 0, Math.cos(b) * rb, Math.sin(b) * rb, 0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  build.add(geometry.translate(...point), "flower", parent);
}

/** Tiny light speck (diameter <= 0.08 m, so radius <= 0.036 m). */
function moteGeometry(point: Point, radius: number): BufferGeometry {
  return new OctahedronGeometry(Math.min(0.036, radius), 0)
    .rotateY(point[0] * 1.7 + point[2] * 2.3)
    .translate(...point);
}

/**
 * Ground-hugging irregular polygon glow disc with 3 concentric rings that fade
 * vertex alpha from 1.0 -> 0.72 -> 0.32 -> 0.0 at the outer rim. Zero vertical faces.
 */
function glowDiscGeometry(
  center: readonly [number, number],
  radiusX: number,
  radiusZ: number,
  phase: number,
  y = 0.018,
  segments = 12,
): BufferGeometry {
  const [cx, cz] = center;
  const rings = [
    { scale: 0.38, alpha: 0.75 },
    { scale: 0.72, alpha: 0.34 },
    { scale: 1.0, alpha: 0.0 },
  ] as const;
  const positions: number[] = [];
  const alphas: number[] = [];

  function ringPoint(ringIdx: number, segIdx: number): readonly [number, number, number, number] {
    const k = ((segIdx % segments) + segments) % segments;
    const angle = (k / segments) * Math.PI * 2;
    const wobble = 1 + 0.12 * Math.sin(angle * 2 + phase) + 0.07 * Math.cos(angle * 3 - phase * 0.7);
    const ring = rings[ringIdx]!;
    return [
      cx + Math.cos(angle) * radiusX * ring.scale * wobble,
      y,
      cz + Math.sin(angle) * radiusZ * ring.scale * wobble,
      ring.alpha,
    ];
  }

  function pushVertex(pt: readonly [number, number, number, number]) {
    positions.push(pt[0], pt[1], pt[2]);
    alphas.push(pt[3]);
  }

  for (let s = 0; s < segments; s++) {
    const p0 = ringPoint(0, s);
    const p1 = ringPoint(0, s + 1);
    pushVertex([cx, y, cz, 1.0]);
    pushVertex(p1);
    pushVertex(p0);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a0 = ringPoint(r, s);
      const a1 = ringPoint(r, s + 1);
      const b0 = ringPoint(r + 1, s);
      const b1 = ringPoint(r + 1, s + 1);
      pushVertex(a0);
      pushVertex(a1);
      pushVertex(b1);
      pushVertex(a0);
      pushVertex(b1);
      pushVertex(b0);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("alpha", new Float32BufferAttribute(alphas, 1));
  return geometry;
}

/**
 * Low, flat, irregular mist drift (< 0.4 m high, below knee height) hugging the base.
 * Softly feathered edges via 2 concentric irregular polygon rings; never a box or cylinder wall.
 */
function mistStripGeometry(
  center: Point,
  halfLength: number,
  halfWidth: number,
  yaw: number,
  phase: number,
  segments = 10,
): BufferGeometry {
  const [cx, cy, cz] = center;
  const clampedY = Math.min(0.32, Math.max(0.08, cy));
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const rings = [
    { scale: 0.48, dy: -0.015, alpha: 0.62 },
    { scale: 1.0, dy: -0.045, alpha: 0.0 },
  ] as const;
  const positions: number[] = [];
  const alphas: number[] = [];

  function ringPoint(ringIdx: number, segIdx: number): readonly [number, number, number, number] {
    const k = ((segIdx % segments) + segments) % segments;
    const angle = (k / segments) * Math.PI * 2;
    const wobble = 1 + 0.16 * Math.sin(angle * 2 + phase) + 0.09 * Math.cos(angle * 3 + phase * 1.3);
    const ring = rings[ringIdx]!;
    const lx = Math.cos(angle) * halfLength * ring.scale * wobble;
    const lz = Math.sin(angle) * halfWidth * ring.scale * wobble;
    const wx = cx + lx * cosY - lz * sinY;
    const wz = cz + lx * sinY + lz * cosY;
    const wy = Math.min(0.35, Math.max(0.04, clampedY + ring.dy + 0.015 * Math.sin(angle + phase)));
    return [wx, wy, wz, ring.alpha];
  }

  function pushVertex(pt: readonly [number, number, number, number]) {
    positions.push(pt[0], pt[1], pt[2]);
    alphas.push(pt[3]);
  }

  for (let s = 0; s < segments; s++) {
    const p0 = ringPoint(0, s);
    const p1 = ringPoint(0, s + 1);
    pushVertex([cx, clampedY, cz, 1.0]);
    pushVertex(p1);
    pushVertex(p0);
  }
  for (let s = 0; s < segments; s++) {
    const a0 = ringPoint(0, s);
    const a1 = ringPoint(0, s + 1);
    const b0 = ringPoint(1, s);
    const b1 = ringPoint(1, s + 1);
    pushVertex(a0);
    pushVertex(a1);
    pushVertex(b1);
    pushVertex(a0);
    pushVertex(b1);
    pushVertex(b0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("alpha", new Float32BufferAttribute(alphas, 1));
  return geometry;
}

function arch(build: Builder) {
  for (const x of [-2.18, 2.18]) {
    build.add(box([0.62, 0.28, 0.68], [x, 0.14, 0]), "stone");
    build.add(box([0.46, 0.24, 0.5], [x, 0.38, 0]), "stone");
  }
  const frame: Point[] = [
    [-2.18, 0.2, 0], [-2.18, 3.7, 0], [-2.0, 4.6, 0], [-1.36, 5.38, 0],
    [0, 5.75, 0], [1.36, 5.38, 0], [2.0, 4.6, 0], [2.18, 3.7, 0], [2.18, 0.2, 0],
  ];
  for (let i = 1; i < frame.length; i++) build.add(beam(frame[i - 1]!, frame[i]!, 0.25), "wood");
  build.add(beam([-1.82, 4.35, 0], [1.82, 4.35, 0], 0.14), "wood");
  build.add(new TorusGeometry(1.12, 0.062, 3, 20).translate(0, 3.18, 0.04), "wood");
  build.add(new CircleGeometry(1.09, 24).translate(0, 3.18, 0.04), "mirror");
  for (const x of [-0.44, 0.44]) build.add(rod([x, 4.2, 0.02], [x, 5.48, 0.02], 0.022), "wood");
  build.add(rod([0, 4.3, 0.02], [0, 5.72, 0.02], 0.022), "wood");
  const vine: Point[] = [
    [-2.26, 0.45, 0.15], [-2.14, 2.95, 0.16], [-1.92, 4.62, 0.14],
    [-1.02, 5.52, 0.14], [0.68, 5.8, 0.12], [1.96, 4.76, 0.14], [2.26, 1.05, 0.14],
  ];
  for (let i = 1; i < vine.length; i++) {
    const start = vine[i - 1]!, end = vine[i]!;
    build.add(rod(start, end, 0.034), "vine");
    for (let j = 0; j < 4; j++) {
      const t = (j + 0.3) / 4;
      leaf(build, [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, 0.21],
        (i + j) % 2 === 0 ? 0.8 : -0.8);
    }
  }
  flower(build, [-2.04, 4.32, 0.28]);
  flower(build, [-0.78, 5.46, 0.28]);
  flower(build, [1.0, 5.58, 0.28]);
  flower(build, [2.15, 2.35, 0.28]);

  // Ground-only glow disc with concentric vertex-alpha fade.
  build.add(glowDiscGeometry([0, 0], 2.35, 0.92, 0.4, 0.018), "glow");

  // Low flat irregular mist strips (< 0.4 m) around the stone plinths and arch base.
  build.add(mistStripGeometry([-1.45, 0.18, 0.18], 1.12, 0.52, 0.22, 0.5), "mist");
  build.add(mistStripGeometry([1.48, 0.22, -0.16], 1.15, 0.54, -0.28, 1.7), "mist");
  build.add(mistStripGeometry([0.08, 0.14, -0.32], 1.35, 0.48, 0.08, 2.9), "mist");

  // Motes <= 0.08 m diameter, kept outside 1.5 m radius from the character stand point (0, 0, 0).
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tier = Math.floor(i / 2);
    const x = side * (1.72 + (tier % 3) * 0.26);
    const y = 0.85 + tier * 0.78;
    const z = Math.sin(i * 1.45) * 0.48;
    build.add(moteGeometry([x, y, z], 0.026 + (i % 3) * 0.004), "mote");
  }
}

function windChime(build: Builder, root: Group) {
  build.add(box([0.74, 0.34, 0.74], [0, 0.17, 0]), "stone");
  build.add(box([0.34, 1.32, 0.34], [0, 0.66, 0]), "wood");
  build.add(rod([0, 1.2, 0], [-0.24, 3.95, 0.07], 0.125, 5), "wood");
  build.add(rod([-0.24, 3.95, 0.07], [0.16, 5.85, 0.02], 0.092, 5), "wood");
  build.add(rod([0.16, 5.85, 0.02], [2.76, 6.18, 0.02], 0.088, 5), "wood");
  build.add(rod([-0.19, 3.65, 0.07], [-1.02, 4.76, 0.1], 0.048), "wood");
  build.add(rod([1.56, 6.0, 0.02], [2.04, 6.76, -0.07], 0.036), "wood");
  build.add(new TorusGeometry(0.96, 0.042, 4, 12).rotateX(Math.PI / 2).translate(1.54, 6.02, 0.02), "wood");

  const chimes = new Group();
  chimes.name = "chimes";
  chimes.position.set(1.54, 6.0, 0.02);
  root.add(chimes);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.42, top = x * 0.12;
    const length = 0.88 + (i % 3) * 0.18, cord = 0.38 + (i % 2) * 0.11;
    build.add(rod([x, top, 0], [x, top - cord, 0], 0.01, 3), "wood", chimes);
    build.add(new CylinderGeometry(0.052, 0.052, length, 5, 1, true)
      .translate(x, top - cord - length / 2, 0), "chime", chimes);
  }

  // Ground-only glow disc beneath the post and chime overhang.
  build.add(glowDiscGeometry([0.85, 0.02], 1.95, 0.92, 1.1, 0.018), "glow");

  // Low flat irregular mist strips (< 0.4 m) around the base of the post.
  build.add(mistStripGeometry([0.22, 0.16, -0.18], 1.15, 0.56, 0.32, 0.8), "mist");
  build.add(mistStripGeometry([1.18, 0.22, 0.22], 1.25, 0.52, -0.24, 2.1), "mist");
  build.add(mistStripGeometry([-0.42, 0.13, 0.25], 0.92, 0.46, 0.52, 3.4), "mist");

  // Motes <= 0.08 m diameter, kept outside 1.5 m radius from the character stand point (0, 0, 0).
  for (let i = 0; i < 12; i++) {
    const a = 0.55 + i * 0.52;
    const r = 1.72 + (i % 3) * 0.28;
    const x = 0.45 + Math.cos(a) * r;
    const z = Math.sin(a) * 0.72;
    const safeX = Math.hypot(x, z) < 1.68 ? (x >= 0 ? 1.72 : -1.72) : x;
    const y = 1.05 + (i / 11) * 4.95;
    build.add(moteGeometry([safeX, y, z], 0.026 + (i % 3) * 0.004), "mote");
  }
}

function trail(build: Builder, groundAt: (x: number, z: number) => number) {
  function add(geometry: BufferGeometry, surface: Surface = "stone") {
    const vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      vertices.setY(i, vertices.getY(i) + groundAt(vertices.getX(i), vertices.getZ(i)));
    }
    geometry.computeVertexNormals();
    build.add(geometry, surface);
  }

  // Twelve flat five-sided stepping stones that gradually taper and fade into the hillside.
  for (let i = 0; i < 12; i++) {
    const fade = 1 - i * 0.038;
    const thickness = 0.14 * fade;
    add(new CylinderGeometry(0.54 * fade, 0.61 * fade, thickness, 5).scale(1.15, 1, 0.73)
      .rotateY(i * 0.71).translate(Math.sin(i * 0.83) * 0.52, thickness / 2, -i * 1.65));
  }

  // Four stacked stone cairns stepping down in height (max <= 1.2 m) so the route reads from 15 m.
  const cairns = [
    { x: -0.78, z: -2.1, heights: [0.28, 0.25, 0.22, 0.2, 0.18], radii: [0.42, 0.34, 0.27, 0.2, 0.13] }, // 1.13 m
    { x: 0.74, z: -7.5, heights: [0.27, 0.24, 0.22, 0.19], radii: [0.38, 0.3, 0.23, 0.15] },              // 0.92 m
    { x: -0.66, z: -13.6, heights: [0.25, 0.22, 0.18, 0.14], radii: [0.34, 0.27, 0.2, 0.13] },            // 0.79 m
    { x: 0.08, z: -19.8, heights: [0.24, 0.2, 0.16], radii: [0.32, 0.24, 0.16] },                         // 0.60 m
  ] as const;

  for (const [cIdx, cairn] of cairns.entries()) {
    let y = 0;
    for (let s = 0; s < cairn.heights.length; s++) {
      const h = cairn.heights[s]!;
      const r = cairn.radii[s]!;
      const dx = Math.sin((cIdx + 1) * 1.7 + s * 2.1) * 0.025;
      const dz = Math.cos((cIdx + 1) * 1.3 + s * 1.9) * 0.025;
      add(
        new CylinderGeometry(r * 0.84, r, h, 5)
          .scale(1.08, 1, 0.88)
          .rotateY(cIdx * 0.9 + s * 0.65)
          .translate(cairn.x + dx, y + h / 2, cairn.z + dz),
      );
      y += h * 0.94;
    }
  }

  // Ground-only glow discs under the first and last cairns along the trail.
  for (const [idx, cairn] of [cairns[0]!, cairns[3]!].entries()) {
    add(glowDiscGeometry([cairn.x * 0.5, cairn.z], 1.15 - idx * 0.15, 1.45, idx * 1.7 + 0.4, 0.018, 8), "glow");
  }

  // Low flat irregular mist strips (< 0.4 m) drifting across the stones.
  for (const [idx, z] of [-2.0, -9.8, -19.2].entries()) {
    add(
      mistStripGeometry(
        [Math.sin(idx * 1.8) * 0.24, 0.16 + (idx % 2) * 0.05, z],
        1.05,
        0.72,
        (idx % 2 ? 1 : -1) * 0.35,
        idx * 1.5 + 0.6,
        8,
      ),
      "mist",
    );
  }

  // Motes <= 0.08 m diameter, kept outside 1.5 m radius from the character stand point (0, 0, 0).
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const z = -1.85 - t * 18.2;
    const x = Math.sin(i * 1.15) * 0.78;
    const y = 0.32 + (i % 3) * 0.24;
    add(moteGeometry([x, y, z], 0.026 + (i % 3) * 0.004), "mote");
  }
}

/**
 * Human-scale bench (seat ~0.45 m high, ~1.8 m wide) with a tall flowering vine trellis
 * backdrop (2.5-3 m high) behind it and a writing lectern beside it.
 * Leaves the ending camera sightline (2, 1.8, 3) -> (0, 0.9, -1) and character spot (1.8, 0, 0)
 * completely free of transparent geometry.
 */
function bench(build: Builder, root: Group) {
  const seat = new Group(), fence = new Group();
  seat.name = "seat";
  fence.name = "fence";
  root.add(seat, fence);

  // Human-proportioned bench: seat surface at y = 0.45 m, width = 1.8 m.
  for (const z of [-0.15, 0, 0.15]) build.add(box([1.8, 0.06, 0.135], [0, 0.42, z]), "wood", seat);
  for (const x of [-0.72, 0.72]) {
    for (const z of [-0.16, 0.16]) build.add(box([0.085, 0.39, 0.085], [x, 0.195, z]), "wood", seat);
    build.add(box([0.075, 0.62, 0.075], [x, 0.63, -0.255]), "wood", seat);
  }
  for (const y of [0.68, 0.86]) build.add(box([1.8, 0.12, 0.055], [0, y, -0.255]), "wood", seat);
  for (const z of [-0.16, 0.16]) build.add(box([1.52, 0.065, 0.06], [0, 0.24, z]), "wood", seat);
  build.add(new BoxGeometry(0.32, 0.022, 0.24).rotateY(0.18).translate(0.34, 0.462, 0.02), "chime", seat);

  // Writing lectern/pedestal beside the bench on the -X side holding the unwritten page.
  build.add(box([0.54, 0.2, 0.5], [-1.36, 0.1, 0.08]), "stone", fence);
  build.add(box([0.22, 0.84, 0.2], [-1.36, 0.62, 0.08]), "wood", fence);
  build.add(new BoxGeometry(0.62, 0.055, 0.46).rotateX(0.26).translate(-1.36, 1.06, 0.08), "wood", fence);
  build.add(new BoxGeometry(0.44, 0.024, 0.32).rotateX(0.26).rotateY(-0.08).translate(-1.36, 1.1, 0.09), "chime", fence);

  // Grand flowering vine trellis behind the bench (2.78 m tall, within 2.5-3 m).
  const posts = [
    [-1.92, 2.52, -1.28],
    [-0.68, 2.78, -1.36],
    [0.68, 2.78, -1.36],
    [1.62, 2.46, -1.22],
    [-1.92, 1.96, -0.18],
  ] as const;
  for (const [x, h, z] of posts) {
    build.add(box([0.14, h, 0.14], [x, h / 2, z]), "wood", fence);
  }
  for (const y of [0.76, 1.56, 2.34]) {
    build.add(box([3.68, 0.1, 0.09], [-0.15, y, -1.34]), "wood", fence);
  }
  build.add(box([2.24, 0.11, 0.11], [0, 2.7, -1.36]), "wood", fence);
  for (const x of [-1.42, -0.68, 0, 0.68, 1.32]) {
    build.add(box([0.09, 0.09, 0.96], [x, 2.54, -1.04]), "wood", fence);
  }
  for (const y of [0.68, 1.38]) {
    build.add(box([0.09, 0.09, 1.24], [-1.92, y, -0.73]), "wood", fence);
  }

  // Climbing vines, leaves and flowers across the rear trellis.
  const vineColumns = [-1.76, -0.82, -0.05, 0.74, 1.48] as const;
  for (const [i, x] of vineColumns.entries()) {
    const topY = i === 1 || i === 2 || i === 3 ? 2.68 : 2.32;
    build.add(rod([x, 0.28, -1.28], [x + (i % 2 ? 0.22 : -0.22), topY, -1.24], 0.026), "vine", fence);
    for (let j = 0; j < 4; j++) {
      const t = (j + 0.25) / 4;
      leaf(
        build,
        [x + (i % 2 ? 0.22 : -0.22) * t, 0.42 + (topY - 0.42) * t, -1.2],
        ((i + j) % 2 ? 1 : -1) * 0.72,
        fence,
      );
    }
  }
  flower(build, [-1.58, 1.88, -1.16], fence);
  flower(build, [-0.52, 2.42, -1.16], fence);
  flower(build, [0.58, 2.28, -1.16], fence);
  flower(build, [1.38, 1.76, -1.14], fence);

  // Ground-only glow disc beneath the bench, lectern and rear trellis.
  build.add(glowDiscGeometry([-0.32, -0.58], 1.95, 1.22, 0.9, 0.018), "glow");

  // Low flat irregular mist strips (< 0.4 m) tucked behind and around the bench/lectern base,
  // completely away from the ending camera ray (2, 1.8, 3) -> (0, 0.9, -1) and (1.8, 0, 0).
  build.add(mistStripGeometry([-0.25, 0.16, -1.05], 1.45, 0.52, 0.08, 0.7), "mist");
  build.add(mistStripGeometry([-1.38, 0.14, -0.22], 0.92, 0.48, -0.35, 1.9), "mist");
  build.add(mistStripGeometry([0.45, 0.18, -1.12], 1.05, 0.46, -0.15, 3.1), "mist");

  // Motes <= 0.08 m diameter along the upper rear trellis and lectern side,
  // strictly > 1.5 m from both (1.8, 0, 0) and (0, 0, 0), and behind the seated target (0, 0.9, -1).
  const motes: Point[] = [
    [-1.88, 1.24, -0.45],
    [-1.76, 1.68, -1.18],
    [-1.42, 2.18, -1.32],
    [-0.95, 2.52, -1.38],
    [-0.38, 2.66, -1.52],
    [0.18, 2.58, -1.56],
    [0.68, 2.42, -1.52],
    [1.15, 2.15, -1.58],
    [-1.68, 1.45, 0.22],
    [-1.25, 1.92, -1.28],
  ];
  for (const [i, pt] of motes.entries()) {
    build.add(moteGeometry(pt, 0.026 + (i % 3) * 0.004), "mote");
  }
}

/** Deterministic scenery in metres, grounded at y=0. No world wiring or animation. */
export function createSecretLandmark(landmark: SecretLandmark, groundAt: (x: number, z: number) => number = () => 0): Group {
  const root = new Group();
  root.name = landmark;
  root.userData.landmark = landmark;
  const build = builder(root);
  switch (landmark) {
    case "vine-arch-mirror": arch(build); break;
    case "wind-chime": windChime(build, root); break;
    case "faint-trail": trail(build, groundAt); break;
    case "bench": bench(build, root); break;
  }
  build.finish();
  return root;
}

/** Idempotent; releases this factory's geometry/materials, preserving shared ramps. */
export function disposeLandmark(group: Group): void {
  const dispose: unknown = group.userData.dispose;
  if (typeof dispose === "function") dispose();
}
