import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group,
  IcosahedronGeometry, Mesh, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createPropMaterial } from "../props/materials";
import {
  PATH_CLEARANCE, ZONE_BUDGET,
  type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

type Surface = "wood" | "cut" | "moss" | "node" | "vine";
type Part = { geometry: BufferGeometry; surface: Surface; level?: boolean; solid?: boolean };
type Placement = { side: number; z: number };
const STUMP_X = 4.7;
const CUT_HEIGHT = 1.28;

function geometry(positions: number[], indices: number[]): BufferGeometry {
  const indexed = new BufferGeometry();
  indexed.setAttribute("position", new Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const result = indexed.toNonIndexed();
  indexed.dispose();
  return result;
}

/** Uneven twelve-sided rings give the stump a small bevel and a broad, level cut. */
function stump(phase: number): BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const radii = [1.65, 1.55, 1.42, 1.32];
  const heights = [0, 0.18, 1.16, CUT_HEIGHT];
  for (let ring = 0; ring < 4; ring++) {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const r = radii[ring]! * (1 + Math.sin(a * 3 + phase) * 0.045);
      positions.push(Math.cos(a) * r + ring * 0.018, heights[ring]!, Math.sin(a) * r);
      if (ring < 3) {
        const p = ring * 12 + i, q = ring * 12 + (i + 1) % 12;
        indices.push(p, p + 12, q, q, p + 12, q + 12);
      }
    }
  }
  return geometry(positions, indices);
}

/** Flat annuli, including a filled centre for the pale end grain. */
function annulus(inner: number, outer: number, y: number, phase: number): BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const sides = 24;
  for (let i = 0; i < sides; i++) {
    const a = i * Math.PI * 2 / sides;
    const wobble = 1 + Math.sin(a * 3 + phase) * 0.035;
    for (const r of [inner, outer]) positions.push(Math.cos(a) * r * wobble + 0.054, y, Math.sin(a) * r * wobble);
    const p = i * 2, q = ((i + 1) % sides) * 2;
    if (inner === 0) indices.push(p, q + 1, p + 1);
    else indices.push(p, q, p + 1, p + 1, q, q + 1);
  }
  return geometry(positions, indices);
}

/** A continuous tapered root, flattened underneath to rest on the terrain. */
function root(points: Vector3[], radius: number): BufferGeometry {
  const curve = new CatmullRomCurve3(points);
  const positions: number[] = [], indices: number[] = [];
  const steps = 8, sides = 8;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps, p = curve.getPoint(t), tangent = curve.getTangent(t);
    const normal = new Vector3(-tangent.z, 0, tangent.x).normalize();
    const r = radius * (1 - t * 0.87);
    for (let i = 0; i < sides; i++) {
      const a = i * Math.PI * 2 / sides;
      positions.push(p.x + normal.x * Math.cos(a) * r,
        p.y + (1 + Math.sin(a)) * r * 0.62, p.z + normal.z * Math.cos(a) * r);
      if (step < steps) {
        const v = step * sides + i, w = step * sides + (i + 1) % sides;
        indices.push(v, w, v + sides, w, w + sides, v + sides);
      }
    }
  }
  // Closed ends; the broad start is buried in the stump.
  for (let i = 1; i < sides - 1; i++) {
    indices.push(0, i + 1, i, steps * sides, steps * sides + i, steps * sides + i + 1);
  }
  for (let i = 0; i < indices.length; i += 3) {
    [indices[i], indices[i + 1]] = [indices[i + 1]!, indices[i]!];
  }
  return geometry(positions, indices);
}

function makeParts(seed: number): Part[] {
  const phase = (Math.imul(seed ^ 0x5f3759df, 1664525) >>> 0) / 4294967296 * Math.PI * 2;
  const parts: Part[] = [
    { geometry: stump(phase), surface: "wood", level: true, solid: true },
    { geometry: annulus(0, 1.31, CUT_HEIGHT, phase), surface: "cut", level: true },
  ];
  for (const r of [0.39, 0.76, 1.08]) {
    parts.push({ geometry: annulus(r, r + 0.022, CUT_HEIGHT + 0.006, phase), surface: "wood", level: true });
  }
  // Eight generous arms; the two road-facing arms curl along the verge.
  const ends = [
    [-1.15, -3.3], [-1.05, 3.1], [1.2, 4.7], [4.4, 4],
    [6, 1.4], [5.7, -2.5], [3, -4.5], [0.2, -4.7],
  ] as const;
  const arms: Vector3[][] = [];
  ends.forEach(([x, z], i) => {
    const end = new Vector3(x, 0, z);
    const start = end.clone().normalize().multiplyScalar(0.75);
    const bend = Math.sin(phase + i * 1.7) * 0.24;
    const points = [start, new Vector3(x * 0.48 + 0.3, 0, z * 0.46 + bend), end];
    arms.push(points);
    parts.push({ geometry: root(points, 0.48 - i % 3 * 0.045), surface: "wood", solid: true });
  });
  // Two cross-links turn the radial silhouette into a small connected network.
  for (const [a, b] of [[3, 4], [5, 6]] as const) {
    const from = arms[a]![2]!, to = arms[b]![2]!;
    parts.push({ geometry: root([from, from.clone().lerp(to, 0.5).add(new Vector3(0.23, 0, 0.18)), to], 0.23),
      surface: "wood", solid: true });
  }
  for (const index of [3, 4, 6]) {
    const p = arms[index]![2]!;
    parts.push({ geometry: new IcosahedronGeometry(1, 0).scale(0.32, 0.21, 0.28)
      .rotateY(phase + index).translate(p.x, 0.23, p.z), surface: "node", solid: true });
  }
  // Only two narrow blue-green vines; there is no emission or animated data effect.
  for (const index of [3, 6]) {
    const points = arms[index]!.map((p, i) => p.clone().add(new Vector3(0.04,
      (0.48 - index % 3 * 0.045) * (1 - i / 2 * 0.87) * 1.24 + 0.015, 0.03)));
    parts.push({ geometry: root(points, 0.025), surface: "vine" });
  }
  for (const [x, z] of [[0.8, 0.7], [-0.8, -0.6]]) {
    parts.push({ geometry: new IcosahedronGeometry(1, 0).scale(0.46, 0.1, 0.31)
      .rotateY(phase).translate(x!, CUT_HEIGHT + 0.04, z!), surface: "moss", level: true });
  }
  return parts;
}

/** Check whole conservative footprints, including the interiors of collider boxes. */
function fits(parts: Part[], placement: Placement, context: ZoneSceneContext): boolean {
  for (const { geometry } of parts) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const xa = placement.side * (STUMP_X + box.min.x), xb = placement.side * (STUMP_X + box.max.x);
    const minX = Math.min(xa, xb), maxX = Math.max(xa, xb);
    const minZ = box.min.z + placement.z, maxZ = box.max.z + placement.z;
    const nx = Math.max(1, Math.ceil((maxX - minX) / 0.2));
    const nz = Math.max(1, Math.ceil((maxZ - minZ) / 0.2));
    for (let ix = 0; ix <= nx; ix++) {
      for (let iz = 0; iz <= nz; iz++) {
        const x = minX + (maxX - minX) * ix / nx, z = minZ + (maxZ - minZ) * iz / nz;
        if (Math.abs(x) <= PATH_CLEARANCE || context.onPath(x, z) || context.underWater(x, z)) return false;
        const h = context.heightAt(x, z);
        if (!Number.isFinite(h) || Math.hypot(x, Math.abs(h) + 2, z) > ZONE_BUDGET.radius) return false;
      }
    }
  }
  return true;
}

export const createRootsScene: ZoneSceneFactory = context => {
  const parts = makeParts(context.seed);
  let placement: Placement | undefined;
  for (const z of [0, -5, 5, -10, 10, -15, 15]) {
    for (const side of [1, -1]) {
      const candidate = { side, z };
      if (fits(parts, candidate, context)) { placement = candidate; break; }
    }
    if (placement) break;
  }
  if (!placement) {
    parts.forEach(part => part.geometry.dispose());
    throw new RangeError("The Roots needs a dry, clear verge within the zone radius.");
  }
  const { side, z: offsetZ } = placement;
  const ground = context.heightAt(side * STUMP_X, offsetZ);
  const batches = new Map<Surface, BufferGeometry[]>();
  const colliders: ZoneCollider[] = [];
  for (const part of parts) {
    const positions = part.geometry.getAttribute("position");
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = side * (STUMP_X + positions.getX(i)), z = positions.getZ(i) + offsetZ;
      const y = positions.getY(i), terrain = context.heightAt(x, z);
      // The foot follows the hill, while the upper bevel and end grain stay level.
      const base = part.level ? terrain + (ground - terrain) * Math.min(1, y / 1.16) : terrain;
      positions.setXYZ(i, x, y + base, z);
      const wash = 0.955 + Math.sin(x * 13 + z * 9 + y * 5) * 0.025;
      colors.push(wash, wash, wash);
    }
    // Reflection changes winding; keep the visible faces outward on the left verge.
    if (side < 0) {
      for (let i = 0; i < positions.count; i += 3) {
        const first = new Vector3().fromBufferAttribute(positions, i);
        positions.setXYZ(i, positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
        positions.setXYZ(i + 1, first.x, first.y, first.z);
        for (let channel = 0; channel < 3; channel++) {
          const value = colors[i * 3 + channel]!;
          colors[i * 3 + channel] = colors[(i + 1) * 3 + channel]!;
          colors[(i + 1) * 3 + channel] = value;
        }
      }
    }
    part.geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    part.geometry.computeVertexNormals();
    part.geometry.computeBoundingBox();
    if (part.solid) {
      const box = part.geometry.boundingBox!;
      colliders.push({ center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) });
    }
    const batch = batches.get(part.surface) ?? [];
    batch.push(part.geometry);
    batches.set(part.surface, batch);
  }
  const group = new Group();
  group.name = "roots";
  for (const [surface, batch] of batches) {
    const merged = mergeGeometries(batch, false)!;
    batch.forEach(part => part.dispose());
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
    if (surface === "cut") material.color.set(PALETTE.paper).lerp(new Color(PALETTE.dusk), 0.28);
    if (surface === "moss") material.color.set(PALETTE.forestDeep).lerp(new Color(PALETTE.forestLight), 0.35);
    if (surface === "node") material.color.set(PALETTE.mist);
    if (surface === "vine") material.color.set(PALETTE.water);
    const mesh = new Mesh(merged, material);
    mesh.name = `roots-${surface}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    zoneId: "roots", group, colliders,
    interactable: {
      position: new Vector3(side * STUMP_X, ground + CUT_HEIGHT, offsetZ),
      label: { en: "The root stump", vi: "Gốc rễ" },
    },
    // A still tableau: the thick roots and their tiny vines never move.
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const child of group.children) {
        if (child instanceof Mesh) { child.geometry.dispose(); child.material.dispose(); }
      }
      group.clear();
    },
  };
};
