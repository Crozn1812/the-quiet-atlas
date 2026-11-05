import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { RAMP_PRESETS } from "../materials/ramp";
import { TRUNK_HEIGHT, TRUNK_RADIUS } from "./colliders";

export const PINE_VARIANT_SEEDS = [300, 301, 302] as const;
export const BROADLEAF_VARIANT_SEEDS = [600, 602, 604] as const;
/** Two existing batches; three geometric shapes are selected inside each batch. */
export const BROADLEAF_BATCH_SEEDS = [600, 602] as const;
/** Broadleaf crowns retain their existing clearance relative to TRUNK_HEIGHT. */
export const CROWN_BASE = -2.9;

/** Nominal height before instance variation; the lower two thirds are bare. */
export function pineHeight(seed: number): number {
  return 15 + (seed >>> 0) % 3;
}

function randomFor(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function geometryFrom(positions: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Neutral, layered wash: the ramp material alone supplies hue. */
function paintCrown(geometry: BufferGeometry, height: number, widthLimit?: number, base = CROWN_BASE): BufferGeometry {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const yScale = height / (bounds.max.y - bounds.min.y);
  const width = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
  const widthScale = widthLimit === undefined ? 1 : Math.min(1, widthLimit / width);
  const bottom = bounds.min.y;
  const positions = geometry.getAttribute("position");
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const t = (positions.getY(i) - bottom) * yScale / height;
    positions.setXYZ(i, positions.getX(i) * widthScale, base + t * height, positions.getZ(i) * widthScale);
    // Broad transparent washes with a soft transition between each layer.
    const layer = t * 4;
    const fraction = layer - Math.floor(layer);
    const wash = (Math.floor(layer) + fraction * fraction * (3 - 2 * fraction)) / 4;
    const value = 0.825 + 0.17 * wash;
    colors.push(value, value, value);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 3–5 overlapping skirts, with irregular hems, bent shoulders and leaning tips. */
export function createPineCrown(seed: number = PINE_VARIANT_SEEDS[0]): BufferGeometry {
  const random = randomFor(seed);
  const tiers = 3 + (seed >>> 0) % 3;
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 11;
  const lean = (random() < 0.5 ? -1 : 1) * (0.2 + random() * 0.12);
  const phase = random() * Math.PI * 2;
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const radius = (1.82 - t * 1.18) * (0.96 + random() * 0.04);
    const base = t * (2.9 + (tiers - 3) * 0.2);
    const height = 1.65 + random() * 0.15;
    const cx = lean * t;
    const cz = Math.sin(phase + t * 2) * 0.07;
    const start = positions.length / 3;
    const rim = Array.from({ length: segments }, () => 0.88 + random() * 0.24);
    const rotation = phase + tier * 0.37;
    for (let ring = 0; ring < 2; ring++) {
      for (let j = 0; j < segments; j++) {
        const angle = rotation + j * Math.PI * 2 / segments;
        const r = radius * rim[j]! * (ring === 0 ? 1 : 0.52);
        // The widest, lowest skirt droops furthest, rather than ending on a plane.
        const y = ring === 0 ? base - (0.1 + random() * 0.1) * (1 - t * 0.25)
          : base + height * (0.27 + random() * 0.05);
        positions.push(cx + Math.cos(angle) * r + ring * lean * 0.12, y, cz + Math.sin(angle) * r);
      }
    }
    const tip = positions.length / 3;
    positions.push(cx + lean * 0.4, base + height, cz + 0.04);
    const underside = positions.length / 3;
    positions.push(cx, base + 0.06, cz);
    for (let j = 0; j < segments; j++) {
      const a = start + j;
      const b = start + (j + 1) % segments;
      indices.push(a, a + segments, b, b, a + segments, b + segments);
      indices.push(a + segments, tip, b + segments, b, underside, a);
    }
  }
  // 44 triangles/tier, at most 220; the trunk adds 42.
  const height = pineHeight(seed);
  // Lift and narrow the layered crown for a tall Da Lat pine rather than a low fir.
  // Keep the legacy 5 m instance anchor; only the visual trunk grows above its collider.
  return paintCrown(geometryFrom(positions, indices), height / 3, 2.7, height * 2 / 3 - TRUNK_HEIGHT);
}

/** Palette-only wash, relative to the ramp colour in linear RGB. */
export function mossColor(height: number, upward: number, damp: number, material = RAMP_PRESETS.trunk): Color {
  const bark = new Color(PALETTE.rockDark).lerp(new Color(PALETTE.forestDeep), 0.25);
  const moss = new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.grass), 0.04 + height * 0.24);
  const coverage = Math.min(1, 0.22 + (1 - height) * 0.48 + Math.max(0, upward) * 0.2 + damp * 0.22);
  const color = bark.lerp(moss, coverage), base = new Color(material);
  return color.setRGB(color.r / base.r, color.g / base.g, color.b / base.b);
}

/** Six separated leaf clusters, a bent leader and 2–3 limbs. Identical topology
 * lets three silhouettes share the original two batches, including shadows. */
export function createBroadleafCrown(seed: number = BROADLEAF_VARIANT_SEEDS[0]): BufferGeometry {
  const variant = Math.max(0, BROADLEAF_VARIANT_SEEDS.indexOf(seed as typeof BROADLEAF_VARIANT_SEEDS[number]));
  const random = randomFor(seed);
  const positions: number[] = [];
  const indices: number[] = [];
  const phase = variant * 0.48;
  for (let cluster = 0; cluster < 6; cluster++) {
    const angle = phase + cluster * Math.PI * 2 / 5;
    const offset = cluster === 0 ? 0.22 : 1.18 + random() * 0.12;
    const cx = Math.cos(angle) * offset, cz = Math.sin(angle) * offset;
    const cy = cluster === 0 ? 1.6 : (cluster % 2) * 0.65;
    const part = new IcosahedronGeometry(1, 0).rotateY(angle);
    const vertices = part.getAttribute("position");
    const start = positions.length / 3;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      // Coordinate noise keeps coincident face vertices coincident (no cracks).
      const wobble = 1 + Math.sin(x * 7 + y * 5 + z * 9 + phase) * 0.07;
      positions.push(cx + x * (0.82 + variant * 0.04) * wobble, cy + y * 0.48 * wobble, cz + z * 0.8 * wobble);
      indices.push(start + i);
    }
    part.dispose();
  }
  const leaves = paintCrown(geometryFrom(positions, indices), 2.5, 4.3, 0.2);
  positions.splice(0, positions.length, ...leaves.getAttribute("position").array);
  const colors = Array.from(leaves.getAttribute("color").array);
  leaves.dispose();
  // Leaves=0, wood=1, hanging greenery=2; one material, no groups.
  const surfaces = Array<number>(positions.length / 3).fill(0);
  function vertex(point: Vector3, surface: number) {
    positions.push(point.x, point.y, point.z);
    surfaces.push(surface);
    const color = surface === 1
      ? mossColor(Math.max(0, Math.min(1, (point.y + 5) / 8)), 0.6, 0.8, RAMP_PRESETS.crown)
      : new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.65);
    if (surface === 2) {
      const base = new Color(RAMP_PRESETS.crown);
      color.setRGB(color.r / base.r, color.g / base.g, color.b / base.b);
    }
    colors.push(color.r, color.g, color.b);
  }
  function limb(from: Vector3, to: Vector3, radius: number) {
    const start = positions.length / 3, segments = 6;
    const axis = to.clone().sub(from).normalize();
    const side = new Vector3(0, 0, 1).cross(axis).normalize();
    const up = side.clone().cross(axis).normalize();
    for (let ring = 0; ring < 2; ring++) for (let j = 0; j < segments; j++) {
      const angle = j * Math.PI * 2 / segments, r = radius * (ring === 0 ? 1 : 0.45);
      vertex((ring === 0 ? from : to).clone()
        .addScaledVector(side, Math.cos(angle) * r).addScaledVector(up, Math.sin(angle) * r), 1);
    }
    vertex(from, 1); vertex(to, 1);
    for (let j = 0; j < segments; j++) {
      const a = start + j, b = start + (j + 1) % segments;
      indices.push(a, a + segments, b, b, a + segments, b + segments,
        b, start + segments * 2, a, a + segments, start + segments * 2 + 1, b + segments);
    }
  }
  const leader = new Vector3(0.05, -0.8, 0);
  const bend = new Vector3(0.12 + variant * 0.1, 1.9, -variant * 0.08);
  limb(leader, bend, 0.14);
  for (let branch = 0; branch < 3; branch++) {
    const angle = phase + branch * Math.PI * 2 / 3;
    const end = new Vector3(Math.cos(angle) * 1.25, 0.6 + branch * 0.4, Math.sin(angle) * 1.1);
    const from = leader.clone().lerp(bend, 0.35 + branch * 0.13);
    const hidden = variant === 0 && branch === 2;
    limb(from, hidden ? from : end, hidden ? 0 : 0.1);
    // Three twisted, double-sided low-poly ribbons hanging from the limbs.
    const start = positions.length / 3;
    // Separate front/back vertices retain opposing normals instead of cancelling.
    for (let face = 0; face < 2; face++) for (let row = 0; row <= 3; row++) {
      const t = row / 3, width = 0.07 * (1 - t * 0.65);
      const center = (hidden ? bend : end).clone().add(new Vector3(Math.sin(t * 3 + branch) * 0.12, -t * (1.8 + branch * 0.18), t * 0.1));
      vertex(center.clone().add(new Vector3(-width, 0, -width * t)), 2);
      vertex(center.clone().add(new Vector3(width, 0, width * t)), 2);
    }
    for (let row = 0; row < 3; row++) {
      const a = start + row * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3,
        a + 9, a + 10, a + 8, a + 11, a + 10, a + 9);
    }
  }
  const geometry = geometryFrom(positions, indices);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("hanging", new Float32BufferAttribute(surfaces.map(surface => surface === 2 ? 1 : 0), 1));
  geometry.setAttribute("surface", new Float32BufferAttribute(surfaces, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Unit-height tapered visual trunk; collision dimensions are owned by colliders.ts. */
export function createTreeTrunk(moss = false): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 7;
  for (let ring = 0; ring < 3; ring++) {
    for (let j = 0; j < segments; j++) {
      const angle = j * Math.PI * 2 / segments;
      const radius = TRUNK_RADIUS * (1 - ring * 0.25);
      positions.push(Math.cos(angle) * radius + ring * 0.025, ring * 0.5 - 0.5, Math.sin(angle) * radius);
    }
  }
  const bottom = positions.length / 3;
  positions.push(0, -0.5, 0, 0.05, 0.5, 0);
  for (let j = 0; j < segments; j++) {
    const next = (j + 1) % segments;
    for (let ring = 0; ring < 2; ring++) {
      const a = ring * segments + j, b = ring * segments + next;
      indices.push(a, a + segments, b, b, a + segments, b + segments);
    }
    indices.push(next, bottom, j, 2 * segments + j, bottom + 1, 2 * segments + next);
  }
  const geometry = geometryFrom(positions, indices);
  // Standalone zone props retain their own neutral pigment/material recipes.
  if (!moss) return geometry;
  const normals = geometry.getAttribute("normal"), colors: number[] = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const height = positions[i * 3 + 1]! + 0.5;
    const color = mossColor(height, normals.getY(i), (normals.getZ(i) + 1) / 2);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}
