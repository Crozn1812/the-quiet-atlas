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
type Surface = "wood" | "vine" | "leaf" | "flower" | "mirror" | "stone" | "chime";

/** Only palette pigments; wood and neutral vertex washes follow the existing props. */
function materialFor(surface: Surface): MeshToonMaterial {
  const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
  switch (surface) {
    case "vine": material.color.set(PALETTE.forestDeep); break;
    case "leaf": material.color.set(PALETTE.forestLight); break;
    case "flower": material.color.set(PALETTE.flower); break;
    case "mirror": material.color.set(PALETTE.mist).lerp(new Color(PALETTE.paper), 0.35); break;
    case "stone": material.color.set(PALETTE.mist).lerp(new Color(PALETTE.ink), 0.14); break;
    case "chime": material.color.set(PALETTE.dusk).lerp(new Color(PALETTE.paper), 0.55); break;
  }
  if (surface === "mirror" || surface === "flower" || surface === "chime") material.side = DoubleSide;
  return material;
}

/** Batch by pigment within each pivot. Temporary primitives never survive the build. */
function builder(root: Group) {
  const batches = new Map<Group, Map<Surface, number[]>>();
  return {
    add(part: BufferGeometry, surface: Surface, parent = root) {
      let surfaces = batches.get(parent);
      if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
      let positions = surfaces.get(surface);
      if (!positions) { positions = []; surfaces.set(surface, positions); }
      const vertices = part.getAttribute("position");
      const count = part.index?.count ?? vertices.count;
      for (let i = 0; i < count; i++) {
        const index = part.index?.getX(i) ?? i;
        positions.push(vertices.getX(index), vertices.getY(index), vertices.getZ(index));
      }
      part.dispose();
    },
    finish() {
      const geometries: BufferGeometry[] = [];
      const materials = new Map<Surface, MeshToonMaterial>();
      for (const [parent, surfaces] of batches) {
        for (const [surface, positions] of surfaces) {
          const colors: number[] = [];
          for (let i = 0; i < positions.length; i += 3) {
            const wash = surface === "flower" || surface === "mirror" ? 1
              : 0.955 + 0.02 * Math.sin(positions[i]! * 91 + positions[i + 2]! * 73)
                + 0.015 * Math.sin(positions[i + 1]! * 19);
            colors.push(wash, wash, wash);
          }
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
          geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          geometries.push(geometry);
          let material = materials.get(surface);
          if (!material) { material = materialFor(surface); materials.set(surface, material); }
          const mesh = new Mesh(geometry, material);
          mesh.name = surface;
          mesh.castShadow = surface !== "mirror";
          mesh.receiveShadow = true;
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
  build.add(new OctahedronGeometry(1, 0).scale(0.065, 0.125, 0.028)
    .rotateZ(angle).rotateY(angle * 0.4).translate(...point), "leaf", parent);
}

/** Five small lobes, facing the viewer; no emissive centre or marker icon. */
function flower(build: Builder, point: Point, parent?: Group) {
  const positions: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5, b = (i + 1) * Math.PI / 5;
    const ra = i % 2 === 0 ? 0.045 : 0.024, rb = i % 2 === 0 ? 0.024 : 0.045;
    positions.push(0, 0, 0, Math.cos(a) * ra, Math.sin(a) * ra, 0, Math.cos(b) * rb, Math.sin(b) * rb, 0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  build.add(geometry.translate(...point), "flower", parent);
}

function arch(build: Builder) {
  const frame: Point[] = [
    [-0.91, 0, 0], [-0.91, 1.55, 0], [-0.84, 1.92, 0], [-0.57, 2.24, 0],
    [0, 2.39, 0], [0.57, 2.24, 0], [0.84, 1.92, 0], [0.91, 1.55, 0], [0.91, 0, 0],
  ];
  for (let i = 1; i < frame.length; i++) build.add(beam(frame[i - 1]!, frame[i]!, 0.105), "wood");
  build.add(new TorusGeometry(0.455, 0.022, 3, 20).translate(0, 1.34, 0.02), "wood");
  build.add(new CircleGeometry(0.447, 24).translate(0, 1.34, 0.02), "mirror");
  for (const x of [-0.18, 0.18]) build.add(rod([x, 1.76, 0], [x, 2.31, 0], 0.007), "wood");
  const vine: Point[] = [
    [-0.94, 0.2, 0.065], [-0.89, 1.25, 0.07], [-0.8, 1.93, 0.06],
    [-0.43, 2.3, 0.06], [0.28, 2.42, 0.05], [0.82, 1.99, 0.06], [0.94, 0.45, 0.06],
  ];
  for (let i = 1; i < vine.length; i++) {
    const start = vine[i - 1]!, end = vine[i]!;
    build.add(rod(start, end, 0.013), "vine");
    for (let j = 0; j < 3; j++) {
      const t = (j + 0.3) / 3;
      leaf(build, [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, 0.09],
        (i + j) % 2 === 0 ? 0.8 : -0.8);
    }
  }
  flower(build, [-0.85, 1.8, 0.13]);
  flower(build, [0.42, 2.33, 0.13]);
  flower(build, [0.9, 0.98, 0.13]);
}

function windChime(build: Builder, root: Group) {
  build.add(box([0.13, 0.55, 0.13], [0, 0.275, 0]), "wood");
  build.add(rod([0, 0.5, 0], [-0.1, 1.65, 0.03], 0.05, 5), "wood");
  build.add(rod([-0.1, 1.65, 0.03], [0.07, 2.43, 0.01], 0.035, 5), "wood");
  build.add(rod([0.07, 2.43, 0.01], [1.15, 2.56, 0.01], 0.035, 5), "wood");
  build.add(rod([-0.08, 1.52, 0.03], [-0.42, 1.98, 0.04], 0.018), "wood");
  build.add(rod([0.65, 2.5, 0.01], [0.85, 2.82, -0.03], 0.012), "wood");
  const chimes = new Group();
  chimes.name = "chimes";
  chimes.position.set(0.64, 2.5, 0.01);
  root.add(chimes);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.18, top = x * 0.12;
    const length = 0.34 + (i % 3) * 0.075, cord = 0.16 + (i % 2) * 0.045;
    build.add(rod([x, top, 0], [x, top - cord, 0], 0.0035, 3), "wood", chimes);
    build.add(new CylinderGeometry(0.018, 0.018, length, 5, 1, true)
      .translate(x, top - cord - length / 2, 0), "chime", chimes);
  }
}

function trail(build: Builder) {
  for (let i = 0; i < 12; i++) {
    build.add(new CylinderGeometry(0.24, 0.27, 0.065, 5).scale(1.15, 1, 0.73)
      .rotateY(i * 0.71).translate(Math.sin(i * 0.83) * 0.22, 0.0325, -i * 0.78), "stone");
  }
  build.add(box([0.24, 0.52, 0.22], [0.02, 0.26, -9]), "stone");
  build.add(new BoxGeometry(0.21, 0.14, 0.18).rotateY(0.12).translate(0.02, 0.59, -9), "stone");
}

/** The seat faces local +Z; the short fence sits along its right side. */
function bench(build: Builder, root: Group) {
  const seat = new Group(), fence = new Group();
  seat.name = "seat";
  fence.name = "fence";
  root.add(seat, fence);
  for (const z of [-0.15, 0, 0.15]) build.add(box([1.9, 0.065, 0.135], [0, 0.47, z]), "wood", seat);
  for (const x of [-0.72, 0.72]) {
    for (const z of [-0.16, 0.16]) build.add(box([0.085, 0.435, 0.085], [x, 0.2175, z]), "wood", seat);
    build.add(box([0.07, 0.64, 0.07], [x, 0.68, -0.255]), "wood", seat);
  }
  for (const y of [0.72, 0.91]) build.add(box([1.9, 0.13, 0.055], [0, y, -0.255]), "wood", seat);
  for (const z of [-0.16, 0.16]) build.add(box([1.53, 0.07, 0.06], [0, 0.27, z]), "wood", seat);
  for (const z of [-0.48, 0.22, 0.92]) build.add(box([0.08, 0.82, 0.08], [1.04, 0.41, z]), "wood", fence);
  for (const y of [0.36, 0.68]) build.add(box([0.06, 0.07, 1.45], [1.04, y, 0.22]), "wood", fence);
  for (let i = 0; i < 3; i++) {
    const z = -0.42 + i * 0.45;
    build.add(rod([1.085, 0.25, z], [1.085, 0.75, z + 0.3], 0.012), "vine", fence);
    for (let j = 0; j < 4; j++) leaf(build, [1.09, 0.34 + j * 0.1, z + j * 0.075], (j % 2 ? 1 : -1) * 0.7, fence);
  }
  flower(build, [1.09, 0.68, -0.22], fence);
  flower(build, [1.09, 0.6, 0.63], fence);
}

/** Deterministic scenery in metres, grounded at y=0. No world wiring or animation. */
export function createSecretLandmark(landmark: SecretLandmark): Group {
  const root = new Group();
  root.name = landmark;
  root.userData.landmark = landmark;
  const build = builder(root);
  switch (landmark) {
    case "vine-arch-mirror": arch(build); break;
    case "wind-chime": windChime(build, root); break;
    case "faint-trail": trail(build); break;
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
