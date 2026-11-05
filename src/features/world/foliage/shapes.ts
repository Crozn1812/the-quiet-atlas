import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry } from "three";
import { TRUNK_RADIUS } from "./colliders";

export const PINE_VARIANT_SEEDS = [300, 301, 302] as const;
export const BROADLEAF_VARIANT_SEEDS = [600, 602] as const;
/** Crowns remain anchored at TRUNK_HEIGHT; the old exposed trunk was 3 m. */
export const CROWN_BASE = -2.9;

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
function paintCrown(geometry: BufferGeometry, height: number, widthLimit?: number): BufferGeometry {
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
    positions.setXYZ(i, positions.getX(i) * widthScale, CROWN_BASE + t * height, positions.getZ(i) * widthScale);
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
    const base = t * (2.4 + (tiers - 3) * 0.2);
    const height = 1.65 + random() * 0.15;
    const cx = lean * t;
    const cz = Math.sin(phase + t * 2) * 0.07;
    const start = positions.length / 3;
    const rim = Array.from({ length: segments }, () => 0.88 + random() * 0.24);
    const rotation = phase + tier * 0.37;
    for (let ring = 0; ring < 2; ring++) {
      for (let j = 0; j < segments; j++) {
        const angle = rotation + j * Math.PI * 2 / segments;
        const r = radius * rim[j]! * (ring === 0 ? 1 : 0.66);
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
  return paintCrown(geometryFrom(positions, indices), 4.05 + (tiers - 3) * 0.2);
}

/** 4–7 off-centre, flattened lobes; each seed changes spacing, size and rotation. */
export function createBroadleafCrown(seed: number = BROADLEAF_VARIANT_SEEDS[0]): BufferGeometry {
  const random = randomFor(seed);
  const clusters = 4 + (seed >>> 0) % 4;
  const positions: number[] = [];
  const indices: number[] = [];
  const phase = random() * Math.PI * 2;
  for (let cluster = 0; cluster < clusters; cluster++) {
    const angle = phase + cluster * 2.39996;
    const radius = 1.02 + random() * 0.38;
    const offset = cluster === 0 ? 0.12 : 0.7 + random() * 0.32;
    const cx = Math.cos(angle) * offset + 0.12;
    const cz = Math.sin(angle) * offset * 0.8;
    const cy = cluster === 0 ? 0.85 : -0.65 + random() * 0.65;
    const part = new IcosahedronGeometry(1, 0).rotateY(angle).rotateZ((random() - 0.5) * 0.3);
    const vertices = part.getAttribute("position");
    const start = positions.length / 3;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      // Coordinate noise keeps coincident face vertices coincident (no cracks).
      const wobble = 1 + Math.sin(x * 7 + y * 5 + z * 9 + phase) * 0.07;
      positions.push(cx + x * radius * wobble, cy + y * radius * 0.7 * wobble, cz + z * radius * 0.92 * wobble);
      indices.push(start + i);
    }
    part.dispose();
  }
  // At most 140 crown triangles; width exceeds height for a spreading canopy.
  return paintCrown(geometryFrom(positions, indices), 3.15 + random() * 0.15, 4.3);
}

/** Unit-height tapered trunk; the existing collider-aligned transform is unchanged. */
export function createTreeTrunk(): BufferGeometry {
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
  return geometryFrom(positions, indices);
}
