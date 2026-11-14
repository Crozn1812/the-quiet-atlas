import { BufferGeometry, Float32BufferAttribute, Mesh } from "three";
import { createSurfaceSampler, surfaceHeight, riverWidthAt, waterLevelAt, worldHeight } from "../terrain/height";
import { riverLength, riverPointAt, riverTangentAt } from "../layout/river";
import type { Quality } from "../terrain";
import { createWaterMaterial } from "./material";
import { createWaterSurface, type WaterSurface } from "./surface";
import { SEA_INLAND_OVERLAP } from "./bounds";
import { bakeStreamOptics, bakeWaterDepth } from "./depth";

/** Sea datum shared with terrain/height.ts. */
export const WATER_LEVEL = 0;
export const RIBBON_SEGMENTS = 1024;
export const RIBBON_CROSS_SEGMENTS = 32;

/** Refine the rendered surface without changing the authored two-edge profile. */
function subdivideAcross(geometry: BufferGeometry): void {
  const rows = geometry.getAttribute("position").count / 2;
  const columns = RIBBON_CROSS_SEGMENTS + 1;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const data = new Float32Array(rows * columns * attribute.itemSize);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const u = column / RIBBON_CROSS_SEGMENTS;
      for (let component = 0; component < attribute.itemSize; component++) {
        const a = attribute.getComponent(row * 2, component);
        const b = attribute.getComponent(row * 2 + 1, component);
        data[(row * columns + column) * attribute.itemSize + component] = a + (b - a) * u;
      }
    }
    geometry.setAttribute(name, new Float32BufferAttribute(data, attribute.itemSize));
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
    const a = row * columns + column, b = a + columns;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  geometry.setIndex(indices);
}

function mouthBlend(t: number): number {
  const progress = Math.max(0, (t - 0.96) / 0.04);
  return progress * progress * (3 - 2 * progress);
}

/** Only the final reach may hand its surface to the sea. The sea quad also
 * extends behind inland reaches, where a z-only test would erase the stream. */
export function estuaryJoinT(): number {
  if (cachedJoin !== undefined) return cachedJoin;
  const near = riverPointAt(1).z + SEA_INLAND_OVERLAP;
  for (let row = 0; row <= 256; row++) {
    const t = 0.82 + 0.18 * row / 256;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    // Probe beyond the carved channel: its submerged bed alone does not mean
    // open sea. A bank disappearing is the first lateral opening to the coast.
    const bank = riverWidthAt(t) / 2 + 3;
    for (const offset of [-bank, bank]) {
      const x = centre.x - tangent.z * offset;
      const z = centre.z + tangent.x * offset;
      if (z <= near && Math.min(worldHeight(x, z), surfaceHeight(x, z)) < WATER_LEVEL) return cachedJoin = t;
    }
  }
  return cachedJoin = 1;
}

// The layout and heightfield are immutable; share this static shoreline scan.
let cachedJoin: number | undefined;

export { riverWidthAt } from "../terrain/height";

/** Two vertices per row, UV.x across the ribbon, UV.y downstream in metres. */
export function createRibbonGeometry(segments = RIBBON_SEGMENTS): BufferGeometry {
  const surfaceHeight = createSurfaceSampler();
  if (!Number.isInteger(segments) || segments < 1 || segments > 16384) {
    throw new RangeError("Water ribbon segments must be an integer between 1 and 16384");
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const tangents: number[] = [];
  const indices: number[] = [];
  const length = riverLength();
  const join = estuaryJoinT();
  const blendStart = Math.max(0.82, join - 16 / length);
  const blendEnd = Math.max(blendStart + 0.00001, join - 2 / length);
  // Explicit transition rows keep even coarse ribbons from spanning the join
  // with a triangle that is still above the sea. Upstream rows are untouched.
  const rows = [...new Set([
    ...Array.from({ length: segments + 1 }, (_, i) => i / segments),
    ...(length / segments > 2 ? [blendStart, blendEnd] : []),
  ])].sort((a, b) => a - b);
  for (let i = 0; i < rows.length; i++) {
    const t = rows[i]!;
    const centre = riverPointAt(t);
    const tangent = riverTangentAt(t);
    const halfWidth = riverWidthAt(t) / 2;
    // The source cap now meets the carved pool beneath the rock outlet.
    // Beyond the first four metres this is identical to the former emergence.
    const originalLevel = waterLevelAt(centre.z) - 0.05 * mouthBlend(t);
    const blend = Math.max(0, Math.min(1, (t - blendStart) / (blendEnd - blendStart)));
    const level = originalLevel + (Math.min(originalLevel, WATER_LEVEL - 0.05) - originalLevel)
      * blend * blend * (3 - 2 * blend);
    const nx = -tangent.z, nz = tangent.x;
    let edge = halfWidth;
    // Submerge the ribbon edges beneath the rendered banks without moving its centre.
    if (t > 0.03 && t < blendStart) {
      const limit = halfWidth + 4 * Math.min(1, (t - 0.03) / 0.01);
      while (edge < limit && [-1, 1].some(side =>
        surfaceHeight(centre.x + nx * edge * side, centre.z + nz * edge * side) < level + 0.05)) {
        edge = Math.min(limit, edge + 0.5);
      }
    }
    for (const side of [-1, 1]) {
      positions.push(centre.x + nx * edge * side, level, centre.z + nz * edge * side);
      normals.push(0, 1, 0);
      tangents.push(tangent.x, 0, tangent.z);
      uvs.push((side + 1) / 2, t * length);
    }
    if (i < rows.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("waterTangent", new Float32BufferAttribute(tangents, 3));
  geometry.setIndex(indices);
  bakeWaterDepth(geometry, true, surfaceHeight);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createRiverRibbon(quality: Quality): WaterSurface {
  const geometry = createRibbonGeometry();
  const optics = bakeStreamOptics(geometry);
  subdivideAcross(geometry);
  const surface = createWaterSurface(geometry, createWaterMaterial(quality));
  const bankMaterial = createWaterMaterial("Low", { wetBank: true });
  const banks = new Mesh(optics.banks, bankMaterial);
  banks.name = "stream-wet-banks";
  banks.raycast = () => {}; // Visual wet soil never blocks walking or the camera.
  surface.mesh.add(banks);
  // Composition replaces the water material on live quality changes. Bind the
  // immutable map to each replacement once; no terrain queries or allocations.
  surface.mesh.onBeforeRender = () => {
    const material = surface.mesh.material;
    if (material.uniforms.uStreamDepth!.value !== optics.texture) {
      material.uniforms.uStreamDepth!.value = optics.texture;
      material.uniforms.uStreamSize!.value.set(optics.texture.image.width, optics.texture.image.height);
      material.uniforms.uHasStreamDepth!.value = 1;
    }
    bankMaterial.uniforms.uDeepColor!.value = material.uniforms.uDeepColor!.value;
  };
  let disposed = false;
  return { ...surface, dispose() {
    if (disposed) return;
    disposed = true;
    banks.removeFromParent(); optics.banks.dispose(); bankMaterial.dispose(); optics.texture.dispose();
    surface.dispose();
  } };
}
