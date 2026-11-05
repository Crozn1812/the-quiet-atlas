import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from "three";
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
    // A closed, drooping underside gives every tier a solid conical volume.
    positions.push(cx, base - height * 0.22, cz);
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

/** Palette bark/moss encoded relative to either existing shared material. */
export function mossColor(height: number, upward: number, damp: number, material = RAMP_PRESETS.trunk): Color {
  const bark = new Color(PALETTE.rock).lerp(new Color(PALETTE.rockDark), 0.48).lerp(new Color(PALETTE.forestDeep), 0.05);
  const moss = new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.grass), 0.28);
  // Bound the root wash so damp moss retains linear pigment luma >= 0.12.
  const coverage = (1 - Math.max(0, Math.min(1, height))) ** 2
    * Math.min(0.48, 0.28 + Math.max(0, upward) * 0.1 + damp * 0.1);
  const color = bark.lerp(moss, coverage), base = new Color(material);
  return color.setRGB(color.r / base.r, color.g / base.g, color.b / base.b);
}

/** Eighteen overlapping, smooth spherical bunches on three rising limbs.
 * A low sphere keeps the submitted triangle increase below 25%. All seeds
 * retain identical indices/surfaces for the existing GPU shape deltas. */
export function createBroadleafCrown(seed: number = BROADLEAF_VARIANT_SEEDS[0]): BufferGeometry {
  const variant = Math.max(0, BROADLEAF_VARIANT_SEEDS.indexOf(seed as typeof BROADLEAF_VARIANT_SEEDS[number]));
  const random = randomFor(seed);
  const positions: number[] = [], indices: number[] = [], colors: number[] = [], surfaces: number[] = [];
  const phase = variant * 0.42 + (random() - 0.5) * 0.12;
  const branchEnds: Vector3[] = [], branchStarts: Vector3[] = [], tips: Vector3[] = [];
  // Five longitudes / three latitude spans: 20 closed faces, no seam copies.
  // Round shading comes from cluster-centred normals, not triangle normals.
  const spherePoints = [0, -1, 0], sphereFaces: number[] = [], leafNormals: number[] = [];
  for (const y of [-0.5, 0.5]) for (let j = 0; j < 5; j++) {
    const angle = j * Math.PI * 2 / 5;
    spherePoints.push(Math.cos(angle) * Math.sqrt(0.75), y, Math.sin(angle) * Math.sqrt(0.75));
  }
  spherePoints.push(0, 1, 0);
  for (let j = 0; j < 5; j++) {
    const a = 1 + j, b = 1 + (j + 1) % 5;
    sphereFaces.push(0, a, b, a, a + 5, b, b, a + 5, b + 5, a + 5, 11, b + 5);
  }
  for (let branch = 0; branch < 3; branch++) {
    const angle = phase + branch * Math.PI * 2 / 3;
    const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new Vector3(-radial.z, 0, radial.x);
    const end = radial.clone().multiplyScalar(1.22 + random() * 0.12).setY(0.18 + branch * 0.06);
    branchStarts.push(new Vector3(0.04, -0.85 + branch * 0.3, -0.02));
    branchEnds.push(end);
    tips.push(radial.clone().multiplyScalar(0.72).setY(3.65 + branch * 0.05));
    for (let bunch = 0; bunch < 6; bunch++) {
      const offset = [-0.1, 0.1, -0.08, 0.08, -0.06, 0.04][bunch]!;
      const reach = [1.3, 1.55, 1.16, 1.23, 0.9, 0.48][bunch]!;
      const center = radial.clone().multiplyScalar(reach).addScaledVector(side, offset + (random() - 0.5) * 0.16);
      center.y = [-0.55, 0.42, 1.14, 2.02, 2.92, 3.65][bunch]! + branch * 0.05 + (random() - 0.5) * 0.12;
      const radius = (bunch === 2 || bunch === 4 ? 0.64 : 0.735) + random() * 0.008;
      const start = positions.length / 3;
      for (let i = 0; i < spherePoints.length; i += 3) {
        const x = spherePoints[i]!, y = spherePoints[i + 1]!, z = spherePoints[i + 2]!;
        const wobble = 1 + Math.sin(x * 7 + y * 5 + z * 9 + angle) * 0.035;
        const point = center.clone().add(new Vector3(x * wobble, y * 0.84, z * wobble).multiplyScalar(radius));
        const normal = point.clone().sub(center).normalize();
        leafNormals.push(normal.x, normal.y, normal.z);
        positions.push(point.x, point.y, point.z); surfaces.push(0);
        // Local undersides are darker; radial tips are brighter than the core.
        const heightWash = (point.y + 1.4) / 6;
        const edgeWash = Math.min(1, Math.hypot(point.x, point.z) / 2.25);
        const value = Math.min(0.995, 0.825 + heightWash * 0.07 + (y + 1) * 0.025 + edgeWash * 0.05);
        colors.push(value, value, value);
      }
      indices.push(...sphereFaces.map(index => start + index));
    }
  }
  function vertex(point: Vector3, surface: number) {
    positions.push(point.x, point.y, point.z); surfaces.push(surface);
    const base = new Color(RAMP_PRESETS.crown);
    const color = surface === 1
      ? mossColor((point.y + TRUNK_HEIGHT) / 7.5, 0.6, 0.8, RAMP_PRESETS.crown)
      : new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.65);
    if (surface === 2) color.setRGB(color.r / base.r, color.g / base.g, color.b / base.b);
    colors.push(color.r, color.g, color.b);
  }
  function limb(from: Vector3, to: Vector3, bottomRadius: number, topRadius: number) {
    // Small wooden limbs retain a solid triangular section; spend faces on leaves.
    const start = positions.length / 3, segments = 3;
    const axis = to.clone().sub(from).normalize();
    const side = new Vector3(0, 0, 1).cross(axis).normalize();
    const up = side.clone().cross(axis).normalize();
    for (let ring = 0; ring < 2; ring++) for (let j = 0; j < segments; j++) {
      const angle = j * Math.PI * 2 / segments, radius = ring === 0 ? bottomRadius : topRadius;
      vertex((ring === 0 ? from : to).clone().addScaledVector(side, Math.cos(angle) * radius)
        .addScaledVector(up, Math.sin(angle) * radius), 1);
    }
    for (let j = 0; j < segments; j++) {
      const a = start + j, b = start + (j + 1) % segments;
      indices.push(a, a + segments, b, b, a + segments, b + segments);
    }
    // Ends sit inside the trunk/leaf bunches, so hidden caps spend no triangles.
  }
  // A curved sleeve covers the shared straight trunk at the existing 5 m anchor.
  // Root-relative positions leave physics cylinders and CROWN_BASE untouched.
  const centers = [new Vector3(0, -TRUNK_HEIGHT, 0), new Vector3(0.035, -2.7, -0.025),
    new Vector3(0.1 + variant * 0.025, -0.2, -0.04), new Vector3(0.18 + variant * 0.04, 2.5, -0.06)];
  const radii = [0.36, 0.31, 0.255, 0.225]; // Exactly 1.6 from root to leader tip.
  const trunkStart = positions.length / 3;
  for (let ring = 0; ring < centers.length; ring++) for (let j = 0; j < 6; j++) {
    const angle = j * Math.PI / 3;
    vertex(centers[ring]!.clone().add(new Vector3(Math.cos(angle) * radii[ring]!, 0, Math.sin(angle) * radii[ring]!)), 1);
  }
  for (let ring = 0; ring < 3; ring++) for (let j = 0; j < 6; j++) {
    const a = trunkStart + ring * 6 + j, b = trunkStart + ring * 6 + (j + 1) % 6;
    indices.push(a, a + 6, b, b, a + 6, b + 6);
  }
  // Close the visible leader tip; its bottom rests on the ground.
  for (let j = 1; j < 5; j++) indices.push(trunkStart + 18, trunkStart + 19 + j, trunkStart + 18 + j);
  // Three buttress roots rise out of the sleeve and settle at ground.
  for (let root = 0; root < 3; root++) {
    const angle = phase + root * Math.PI * 2 / 3;
    const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new Vector3(-radial.z, 0, radial.x).multiplyScalar(0.16);
    const start = positions.length / 3;
    const foot = radial.clone().multiplyScalar(0.32).setY(-TRUNK_HEIGHT);
    vertex(foot.clone().add(side), 1); vertex(foot.clone().sub(side), 1);
    vertex(radial.clone().multiplyScalar(0.9 + root * 0.08).setY(-TRUNK_HEIGHT), 1);
    vertex(radial.clone().multiplyScalar(0.24).setY(-TRUNK_HEIGHT + 0.85), 1);
    indices.push(start, start + 3, start + 2, start + 2, start + 3, start + 1, start + 1, start + 3, start);
  }
  for (let branch = 0; branch < 3; branch++) {
    const from = branchStarts[branch]!, end = branchEnds[branch]!;
    limb(from, end, 0.15, 0.075);
    limb(end, tips[branch]!, 0.075, 0.025);
    // Thin double-sided ribbons hang from limbs, away from the crown boundary.
    // Per-tree selection remains owned by hasHangingFoliage in instances.ts.
    const anchor = from.clone().lerp(end, 0.75);
    const length = 1.25 + branch * 0.45 + random() * 0.1;
    const start = positions.length / 3;
    // A straight tapered ribbon needs only two end rows on each side.
    for (let face = 0; face < 2; face++) for (let row = 0; row <= 1; row++) {
      const t = row, width = 0.022 * (1 - t * 0.65);
      const center = anchor.clone().add(new Vector3(Math.sin(t * 3) * 0.08, -t * length, t * 0.05));
      vertex(center.clone().add(new Vector3(-width, 0, -width * t)), 2);
      vertex(center.clone().add(new Vector3(width, 0, width * t)), 2);
    }
    indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3,
      start + 5, start + 6, start + 4, start + 7, start + 6, start + 5);
  }
  const geometry = geometryFrom(positions, indices);
  const normals = geometry.getAttribute("normal");
  for (let i = 0; i < leafNormals.length; i += 3) normals.setXYZ(i / 3, leafNormals[i]!, leafNormals[i + 1]!, leafNormals[i + 2]!);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
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
