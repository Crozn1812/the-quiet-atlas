import { type Box3, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Object3D } from "three";
import { WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { PATH_BRIDGES } from "../layout/path";
import { ZONES } from "../layout/zones";
import { createRampMaterial } from "../materials/ramp";
import { createRockGeometry } from "../props/rocks";
import { setBakedPropQuality } from "../props/batched";
import type { PropGeometryLoader } from "../props/deferred";
import { PRESETS, type Quality } from "../terrain";
import { TERRAIN_SEED, waterLevelAt, worldHeight } from "../terrain/height";
import { nearestPath, nearestRiver, PATH_SAMPLES } from "../terrain/samples";
import { TILE_CELLS, TILE_SIZE, tileKey, type TerrainTile, type TileAddress } from "../terrain/tiles";
import { foliageBiomeAt, isGroundCoverExcluded, PATH_CLEARANCE, ZONE_CLEARANCE } from "./scatter";

export const GRASS_VARIANT_SEEDS = [901, 903, 905] as const;
export const FERN_VARIANT_SEEDS = [1400, 1401, 1403] as const;
export const ROCK_VARIANT_SEEDS = [1200, 1201] as const;
export const GROUND_MIN_HEIGHT = 0.9;
/** Conservative XZ radius for ordinary plants/rocks at their largest scale. */
export const GROUND_RADIUS = 0.8;
export const GROUND_LOG_RADIUS = 2.4;
export const GROUND_LEAF_RADIUS = 0.45;
export const GROUND_TRIANGLE_LIMIT = 40_000;
const detailLoaders = new WeakMap<Object3D, () => Promise<boolean>>();

/** Lead may invoke this on the world scene after play, including after ground capacity rebuilds. */
export function loadGroundPropDetails(root: Object3D): Promise<boolean[]> {
  const pending: Promise<boolean>[] = [];
  root.traverse(object => {
    const load = detailLoaders.get(object);
    if (load) pending.push(load());
  });
  return Promise.all(pending);
}
export const GROUND_LIMITS = {
  High: { grass: 4200, rock: 40, fern: 100, bush: 160, log: 4, leaf: 160, flower: 16 },
  Balanced: { grass: 2520, rock: 24, fern: 60, bush: 96, log: 2, leaf: 96, flower: 8 },
  Low: { grass: 840, rock: Math.round(40 * PRESETS.Low.density), fern: 20, bush: 32, log: 1, leaf: 24, flower: 2 },
} as const;

export interface GroundDetail {
  readonly kind: keyof typeof GROUND_LIMITS.High;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  /** Radians around world Y. Plants and litter are visual only, without colliders. */
  readonly rotation: number;
}

export function groundRadius(kind: GroundDetail["kind"]): number {
  return kind === "log" ? GROUND_LOG_RADIUS : kind === "leaf" ? GROUND_LEAF_RADIUS : GROUND_RADIUS;
}

function hash(key: string): number {
  // Separate namespace and seed from scatter.ts, including selection and shape RNGs.
  let state = TERRAIN_SEED ^ 0x47524e44;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 16777619);
  return state >>> 0;
}

function randomFor(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 5-9 flat, tapered blades; two bent segments use 3 triangles/blade (at most 27). */
export function createGrassTuft(seed: number = GRASS_VARIANT_SEEDS[0]): BufferGeometry {
  const random = randomFor(seed);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], blends: number[] = [];
  const blades = 5 + (seed >>> 0) % 5;
  const baseColor = new Color(PALETTE.grass);
  const tipColor = new Color(PALETTE.grassDry);
  const phase = random() * Math.PI * 2;
  for (let blade = 0; blade < blades; blade++) {
    const angle = phase + blade * 2.39996;
    const height = 0.3 + random() * 0.3;
    const width = 0.025 + random() * 0.025;
    const bend = 0.12 + random() * 0.1;
    const root = random() * 0.12;
    const start = positions.length / 3;
    for (const t of [0, 0.55, 1]) {
      const color = baseColor.clone().lerp(tipColor, t);
      const radius = root + bend * t * t;
      for (const side of t === 1 ? [0] : [-1, 1]) {
        positions.push(Math.cos(angle) * radius - Math.sin(angle) * width * (1 - t) * side,
          height * t, Math.sin(angle) * radius + Math.cos(angle) * width * (1 - t) * side);
        colors.push(color.r, color.g, color.b);
        blends.push(t);
      }
    }
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("groundBlend", new Float32BufferAttribute(blends, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Kit stone: 20 triangles / 60 vertices for every seed, also stretched into logs. */
export function createRock(seed: number = ROCK_VARIANT_SEEDS[0]): BufferGeometry {
  const geometry = createRockGeometry("stone", seed, true);
  // Match the old footprint and partial burial without touching scatter/matrices.
  // Unlike boulders, stone topology is fixed across seeds for groundPosition1/2.
  geometry.scale(1.5, 1, 1.5);
  geometry.translate(0, -0.08, 0);
  return geometry;
}

function leafGeometry(positions: number[], colors: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Legacy 40-triangle zone fern by default; scatter opts into 6–9 serrated fronds. */
export function createFern(seed: number = FERN_VARIANT_SEEDS[0], options: { detail?: "low" | "high" } = {}): BufferGeometry {
  const full = options.detail === "high";
  const random = randomFor(seed), fronds = full ? 6 + (seed >>> 0) % 4 : 5;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const root = new Color(PALETTE.forestDeep), tip = new Color(PALETTE.forestLight);
  const add = (angle: number, radius: number, height: number, side: number) => {
    positions.push(Math.cos(angle) * radius - Math.sin(angle) * side, height,
      Math.sin(angle) * radius + Math.cos(angle) * side);
    const color = root.clone().lerp(tip, height);
    colors.push(color.r, color.g, color.b);
    return positions.length / 3 - 1;
  };
  for (let frond = 0; frond < fronds; frond++) {
    const angle = full ? (frond + random() * 0.22) * Math.PI * 2 / fronds : frond * Math.PI * 2 / 5;
    const a = add(angle, 0, 0, -0.012), b = add(angle, 0, 0, 0.012);
    const c = full ? add(angle, 0.27, 0.85 + random() * 0.15, 0) : add(angle, 0.32, 1, 0);
    const d = full ? add(angle, 0.7, 0.52, 0) : add(angle, 0.72, 0.65, 0);
    indices.push(a, b, c, b, d, c);
    for (const t of [0.3, 0.55, 0.8]) for (const side of [-1, 1]) {
      if (!full) {
        // Preserve the geometry and fingerprints of existing zone set-pieces.
        const r = t * 0.72, h = Math.sin(t * Math.PI * 0.7) * 0.94;
        const start = add(angle, r - 0.1, h - 0.12, 0);
        const outer = add(angle, r + 0.04, h, side * (1 - t) * 0.3);
        const end = add(angle, r + 0.12, h + 0.05, 0);
        indices.push(start, outer, end);
        continue;
      }
      const r = t * 0.7, h = Math.sin(t * Math.PI * 0.85) * 0.82;
      const width = (1 - t) * (0.24 + random() * 0.06);
      const start = add(angle, r - 0.09, h - 0.08, 0);
      const toothA = add(angle, r - 0.04, h, side * width);
      const notch = add(angle, r + 0.01, h + 0.01, side * width * 0.55);
      const toothB = add(angle, r + 0.08, h + 0.02, side * width * 0.9);
      const end = add(angle, r + 0.13, h + 0.01, 0);
      indices.push(start, toothA, notch, start, notch, end, notch, toothB, end);
    }
  }
  return leafGeometry(positions, colors, indices);
}

/** Six broad folded leaf fans at staggered heights: 24 triangles, 1 m tall. */
export function createBroadleafBush(seed = 1600): BufferGeometry {
  const random = randomFor(seed);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let leaf = 0; leaf < 6; leaf++) {
    const angle = leaf * 2.39996 + random() * 0.3, height = 0.6 + random() * 0.2;
    const start = positions.length / 3;
    const vertices: [number, number, number][] = [[0, 0, 0], [0.3, height, -0.2], [0.48, 1, 0], [0.3, height, 0.2], [0.27, height + 0.1, 0]];
    for (const [radius, y, side] of vertices) {
      positions.push(Math.cos(angle) * radius - Math.sin(angle) * side, y,
        Math.sin(angle) * radius + Math.cos(angle) * side);
      const color = new Color(PALETTE.forestDeep).lerp(new Color(leaf % 2 ? PALETTE.grass : PALETTE.forestLight), y);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(start, start + 1, start + 4, start + 1, start + 2, start + 4,
      start + 2, start + 3, start + 4, start + 3, start, start + 4);
  }
  return leafGeometry(positions, colors, indices);
}

/** Matches the rendered 2 m triangles; derivatives seat thin litter on slopes. */
function surfaceFrame(x: number, z: number, heights?: Map<string, number>) {
  const step = TILE_SIZE / TILE_CELLS;
  const x0 = Math.floor(x / step) * step, z0 = Math.floor(z / step) * step;
  const u = (x - x0) / step, v = (z - z0) / step;
  const sample = (px: number, pz: number) => {
    const key = `${px},${pz}`, cached = heights?.get(key);
    if (cached !== undefined) return cached;
    const height = Math.fround(worldHeight(px, pz));
    heights?.set(key, height);
    return height;
  };
  const a = sample(x0, z0), b = sample(x0 + step, z0);
  const c = sample(x0, z0 + step), d = sample(x0 + step, z0 + step);
  return u + v <= 1 ? { y: a + (b - a) * u + (c - a) * v, dx: (b - a) / step, dz: (c - a) / step }
    : { y: d + (c - d) * (1 - u) + (b - d) * (1 - v), dx: (d - c) / step, dz: (d - b) / step };
}

function dryFootprint(x: number, z: number, radius: number, litter: boolean, heights: Map<string, number>): boolean {
  const frame = surfaceFrame(x, z, heights);
  for (let i = -1; i < 8; i++) {
    const dx = i < 0 ? 0 : Math.cos(i * Math.PI / 4) * radius;
    const dz = i < 0 ? 0 : Math.sin(i * Math.PI / 4) * radius;
    const minimum = Math.max(GROUND_MIN_HEIGHT, waterLevelAt(z + dz) + 0.03);
    const surface = surfaceFrame(x + dx, z + dz, heights).y;
    if (worldHeight(x + dx, z + dz) < minimum || surface < minimum) return false;
    // Avoid creases where a planar decal could clip through the heightfield.
    if (litter && Math.abs(surface - frame.y - frame.dx * dx - frame.dz * dz) > 0.008) return false;
  }
  return true;
}

/** Seeded clumps, with a persistent sparse carpet beyond the wet/trail margins. */
export function scatterGround(tile: TileAddress | TerrainTile, zoneBounds: readonly Box3[] = []): GroundDetail[] {
  const build = scatterGroundChunks(tile, zoneBounds);
  let step = build.next();
  while (!step.done) step = build.next();
  return step.value;
}

/** Preserve RNG order while yielding even on rejected proposals. */
export function* scatterGroundChunks(tile: TileAddress | TerrainTile, zoneBounds: readonly Box3[] = []): Generator<void, GroundDetail[]> {
  const ix = "ix" in tile ? tile.ix : tile.origin.x / TILE_SIZE;
  const iz = "iz" in tile ? tile.iz : tile.origin.z / TILE_SIZE;
  const key = tileKey(ix, iz);
  if ("size" in tile && tile.size !== TILE_SIZE) throw new RangeError("Ground details require standard terrain tiles");
  const result: GroundDetail[] = [];
  const heights = new Map<string, number>();
  for (const kind of Object.keys(GROUND_LIMITS.High) as GroundDetail["kind"][]) {
    const random = randomFor(hash(`${kind}:${key}`));
    const trials = kind === "grass" ? 2048 : kind === "fern" ? 448 : kind === "bush" || kind === "leaf" ? 1400 : 144;
    let count = 0;
    for (let i = 0; i < trials && count < GROUND_LIMITS.High[kind]; i++) {
      if (i % 16 === 0) yield;
      let x = (ix + random()) * TILE_SIZE, z = (iz + random()) * TILE_SIZE;
      if (kind === "grass" || kind === "fern") {
        const members = kind === "grass" ? 8 : 7, cells = kind === "grass" ? 16 : 8;
        const cell = Math.floor(i / members) * 37 % (cells * cells);
        const clump = randomFor(hash(`${kind}-clump:${key}:${cell}`));
        const cx = (ix + (cell % cells + 0.25 + clump() * 0.5) / cells) * TILE_SIZE;
        const cz = (iz + (Math.floor(cell / cells) + 0.25 + clump() * 0.5) / cells) * TILE_SIZE;
        const population = kind === "grass" ? 8 : 3 + Math.floor(clump() * 5);
        if (i % members >= population) continue;
        // One acceptance roll per fern clump keeps the 3–7 plants together.
        if (kind === "fern") {
          const bank = Math.abs(nearestRiver(cx, cz).distance - 8) < 10;
          const canopy = foliageBiomeAt(cx, cz) === "forest-dawn";
          if ((!bank && !canopy) || clump() > (bank ? 0.9 : 0.55)) continue;
        }
        const angle = (i % members) * 2.39996 + random() * 0.4;
        const radius = kind === "grass" ? 0.25 + random() * 0.8 : 0.5 + random() * 0.8;
        x = cx + Math.cos(angle) * radius;
        z = cz + Math.sin(angle) * radius;
      }
      if (kind === "bush" && i % 4 !== 0) {
        // Spend most proposals on the narrow verge rather than the forest interior.
        // Both sides are sampled; wet banks and zone pads are still rejected below.
        const anchor = nearestPath(x, z);
        const index = Math.min(PATH_SAMPLES.length - 2, Math.floor(anchor.t * (PATH_SAMPLES.length - 1)));
        const a = PATH_SAMPLES[index]!, b = PATH_SAMPLES[index + 1]!;
        const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
        const offset = (random() < 0.5 ? -1 : 1) * (2.5 + random() * 5.5);
        x = anchor.x - dz / length * offset;
        z = anchor.z + dx / length * offset;
        if (x < ix * TILE_SIZE || x >= (ix + 1) * TILE_SIZE || z < iz * TILE_SIZE || z >= (iz + 1) * TILE_SIZE) continue;
      }
      const roll = random(), size = random(), rotation = random() * Math.PI * 2;
      let variant = Math.floor(random() * (kind === "grass" || kind === "fern" || kind === "bush" ? 3 : kind === "rock" || kind === "flower" ? 2 : 1));
      const path = nearestPath(x, z), biome = foliageBiomeAt(x, z), forest = biome === "forest-dawn";
      if (forest && kind === "flower") variant = 1;
      const litter = kind === "leaf";
      const bank = Math.max(0, 1 - Math.abs(nearestRiver(x, z).distance - 8) / 12);
      if (!forest && kind !== "grass" && kind !== "rock" && kind !== "flower" && !(kind === "fern" && bank > 0.4)) continue;
      if (kind === "flower" && !forest && !(biome === "hill" || biome === "coast-dusk" && path.distance < 14)) continue;
      if (x < ix * TILE_SIZE || x >= (ix + 1) * TILE_SIZE || z < iz * TILE_SIZE || z >= (iz + 1) * TILE_SIZE) continue;
      const lowGrass = kind === "grass" && path.distance < PATH_CLEARANCE + GROUND_RADIUS + 0.02;
      const scale = kind === "fern" ? 0.4 + size * 0.6 : kind === "bush" ? 0.6 + size * 0.8
        : kind === "grass" ? (lowGrass ? 0.46 : forest ? 0.4 + size * 0.1 : 0.85 + size * 0.15) : kind === "flower" ? 0.2 : kind === "log" && forest ? 0.25 + size * 0.1 : 0.75 + size * 0.35;
      const radius = groundRadius(kind);
      const soft = kind === "grass" || kind === "fern" || kind === "flower" || litter;
      if (soft ? isGroundCoverExcluded(x, z, zoneBounds, radius)
        : path.distance < PATH_CLEARANCE + radius + 0.02
          || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + ZONE_CLEARANCE + radius)
          || PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < 6 + radius)) continue;
      const patch = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(x * 0.17 + Math.sin(z * 0.11) * 2));
      const corridor = path.distance <= 8 ? 0.95 : 0.018 + 0.6 * Math.exp(-(path.distance - 8) / 7);
      const density = kind === "fern" ? 1 : kind === "bush" ? corridor * patch
        : litter ? 0.85 : kind === "log" ? 0.012
          : kind === "rock" ? 0.025 + bank * 0.22 : kind === "flower" ? 0.15
            : Math.min(1, 0.55 + 0.45 * Math.exp(-Math.max(0, path.distance - 5) / 9) + bank * 0.35) * (0.8 + patch * 0.2);
      if (roll >= density || !dryFootprint(x, z, radius, litter, heights)) continue;
      result.push({ kind, variant, x, z, y: surfaceFrame(x, z, heights).y + (litter ? 0.018 : 0), scale, rotation });
      count++;
    }
  }
  // Reuse accepted clumps: extra proposals remain in the deferred, yielding builder.
  // The nearest point on the first-light trail is the same XZ as worldSpawn().
  const firstLight = ZONES.find(zone => zone.id === "first-light")!;
  const spawn = nearestPath(firstLight.position.x, firstLight.position.z);
  const originals = result.slice();
  const populations = new Map<GroundDetail["kind"], number>();
  for (const item of originals) populations.set(item.kind, (populations.get(item.kind) ?? 0) + 1);
  for (let i = 0; i < originals.length; i++) {
    if (i % 16 === 0) yield;
    const source = originals[i]!;
    if (source.kind === "rock" || source.kind === "bush" || foliageBiomeAt(source.x, source.z) !== "forest-dawn") continue;
    const path = nearestPath(source.x, source.z);
    const spawnDistance = Math.hypot(source.x - spawn.x, source.z - spawn.z);
    const influence = Math.max(Math.min(1, Math.max(0, (45 - spawnDistance) / 15)),
      path.t < 0.24 ? Math.min(1, Math.max(0, (24 - path.distance) / 10)) : 0);
    const random = randomFor(hash(`undergrowth:${source.kind}:${source.x}:${source.z}`));
    for (let member = 0; member < 2; member++) {
      if (random() > influence) continue;
      const x = source.x + (random() - 0.5) * 1.4, z = source.z + (random() - 0.5) * 1.4;
      const radius = groundRadius(source.kind), near = nearestPath(x, z);
      if (x < ix * TILE_SIZE || x >= (ix + 1) * TILE_SIZE || z < iz * TILE_SIZE || z >= (iz + 1) * TILE_SIZE
        || (source.kind === "log"
          ? near.distance < PATH_CLEARANCE + radius + 0.02
            || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + ZONE_CLEARANCE + radius)
            || PATH_BRIDGES.some(bridge => near.t >= bridge.tStart && near.t <= bridge.tEnd && near.distance < 6 + radius)
          : isGroundCoverExcluded(x, z, zoneBounds, radius))
        || !dryFootprint(x, z, radius, source.kind === "leaf", heights)) continue;
      if (populations.get(source.kind)! >= GROUND_LIMITS.High[source.kind]) continue;
      populations.set(source.kind, populations.get(source.kind)! + 1);
      result.push({ ...source, x, z, y: surfaceFrame(x, z, heights).y + (source.kind === "leaf" ? 0.018 : 0), rotation: random() * Math.PI * 2 });
    }
  }
  // A hard cap, independent of acceptance/rejection near pads and shorelines.
  const flowerCap = Math.floor(result.filter(item => item.kind !== "flower").length * 0.015);
  const fernClumps = new Map<string, number>();
  const fernKey = (item: GroundDetail) => `${Math.floor(item.x / 8)},${Math.floor(item.z / 8)}`;
  for (const item of result) if (item.kind === "fern") fernClumps.set(fernKey(item), (fernClumps.get(fernKey(item)) ?? 0) + 1);
  let flowers = 0;
  return result.filter(item => (item.kind !== "flower" || flowers++ < flowerCap)
    && (item.kind !== "fern" || fernClumps.get(fernKey(item))! >= 3));
}

/** Pad absent triangles to zero area; three silhouettes still share one draw. */
function variantGeometry(sources: BufferGeometry[]): BufferGeometry {
  const expanded = sources.map(source => source.index ? source.toNonIndexed() : source.clone());
  const count = Math.max(...expanded.map(source => source.getAttribute("position").count));
  const geometry = new BufferGeometry(), blends = new Float32Array(count * 3).fill(-1);
  for (let variant = 0; variant < 3; variant++) {
    const source = expanded[Math.min(variant, expanded.length - 1)]!;
    for (const attribute of ["position", "color"] as const) {
      const values = new Float32Array(count * 3), original = source.getAttribute(attribute);
      values.set(original.array);
      geometry.setAttribute(variant === 0 ? attribute : `ground${attribute === "position" ? "Position" : "Color"}${variant}`,
        new Float32BufferAttribute(values, 3));
    }
    const blend = source.getAttribute("groundBlend");
    if (blend) for (let i = 0; i < count; i++) blends[i * 3 + variant] = i < blend.count ? blend.getX(i) : 0;
  }
  geometry.setAttribute("groundBlend", new Float32BufferAttribute(blends, 3));
  geometry.computeVertexNormals();
  // Every alternate lies inside these CPU bounds, so frustum culling stays safe.
  geometry.computeBoundingBox();
  for (const source of sources) geometry.boundingBox!.union(source.boundingBox!);
  geometry.computeBoundingSphere();
  geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere!);
  for (const source of [...sources, ...expanded]) source.dispose();
  return geometry;
}

/**
 * Four single-material batches. Rocks stretch into occasional mossy logs;
 * neutral grass blades flatten into dry leaf fragments. The 40k cap covers
 * ALL submitted tiles, bounding every 120 m view without camera culling.
 */
export function createGroundDetails(capacity: number) {
  if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError("Ground capacity must be a non-negative integer");
  const group = new Group();
  group.name = "ground-details";
  const material = createRampMaterial(0xffffff, WORLD_DIRECTION.foliage.ramp);
  material.vertexColors = true;
  material.side = DoubleSide;
  material.defines = { ...material.defines, FLAT_SHADED: "" };
  const rampCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    rampCompile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute float groundVariant;
attribute vec3 groundPosition1;
attribute vec3 groundPosition2;
attribute vec3 groundColor1;
attribute vec3 groundColor2;
attribute vec3 groundBlend;
attribute vec3 groundTip;
vec3 groundSelect(vec3 a, vec3 b, vec3 c) {
  return groundVariant < 0.5 ? a : groundVariant < 1.5 ? b : c;
}`)
      .replace("#include <begin_vertex>", "vec3 transformed = groundSelect(position, groundPosition1, groundPosition2);")
      .replace("#include <color_vertex>", `#include <color_vertex>
vColor.rgb = groundSelect(color, groundColor1, groundColor2);
float blend = groundVariant < 0.5 ? groundBlend.x : groundVariant < 1.5 ? groundBlend.y : groundBlend.z;
if (blend >= 0.0) vColor.rgb = mix(instanceColor.rgb, groundTip, blend);`);
  };
  material.customProgramCacheKey = () => "ground-variants-ramp-v2";
  const meshes = [variantGeometry(FERN_VARIANT_SEEDS.map(seed => createFern(seed, { detail: "high" }))),
    variantGeometry([1600, 1601, 1602].map(seed => createBroadleafBush(seed))),
    variantGeometry(ROCK_VARIANT_SEEDS.map(seed => createRock(seed))),
    variantGeometry(GRASS_VARIANT_SEEDS.map(seed => createGrassTuft(seed)))].map((geometry, i) => {
    geometry.setAttribute("groundVariant", new InstancedBufferAttribute(new Float32Array(capacity), 1));
    geometry.setAttribute("groundTip", new InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = `ground-${["fern", "bush", "wood-stone", "grass-litter"][i]}`;
    // Allocate colours even for empty batches so deferred bounds rebuilds match fresh scenes.
    mesh.setColorAt(0, new Color(0xffffff));
    mesh.count = 0;
    mesh.visible = false;
    mesh.castShadow = mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  });
  const meshIndex = (kind: GroundDetail["kind"]) => kind === "fern" ? 0 : kind === "bush" ? 1 : kind === "rock" || kind === "log" ? 2 : 3;
  const triangleCost = (kind: GroundDetail["kind"]) => {
    const geometry = meshes[meshIndex(kind)]!.geometry;
    return (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
  };
  let buckets: GroundDetail[][] = [];
  let quality: Quality = "High";
  let focus: { x: number; z: number } | undefined;
  let submitted: GroundDetail[] = [];
  let disposed = false;
  const proceduralStone = meshes[2]!.geometry;
  let detailedStone: BufferGeometry | undefined;
  let detailPending: Promise<boolean> | undefined;
  const hasDetail = () => meshes[2]!.geometry === detailedStone;
  const isLow = () => quality === "Low";
  const transform = new Object3D();
  const white = new Color(0xffffff), grassTint = new Color(PALETTE.grass), dryGrass = new Color(PALETTE.grassDry);
  const dryTint = new Color(PALETTE.grassDry).lerp(new Color(PALETTE.flower), 0.03);
  function assertLive() {
    if (disposed) throw new Error("Ground details have been disposed");
  }
  function* updateChunks(): Generator<void> {
    for (const mesh of meshes) mesh.count = 0;
    let rendered = 0, flowers = 0, proposals = 0;
    for (const items of [...buckets.filter(items => items[0]!.kind !== "flower"), ...buckets.filter(items => items[0]!.kind === "flower")]) {
      const kind = items[0]!.kind;
      const count = Math.round(items.length * GROUND_LIMITS[quality][kind] / GROUND_LIMITS.High[kind]);
      for (const item of items.slice(0, count)) {
        if (++proposals % 32 === 0) yield;
        if (kind === "flower" && ++flowers > Math.floor(rendered / 49)) continue;
        if (kind !== "flower") rendered++;
        const mesh = meshes[meshIndex(kind)]!;
        if (kind === "leaf") {
          const { dx, dz } = surfaceFrame(item.x, item.z);
          const c = Math.cos(item.rotation) * item.scale * 0.55, s = Math.sin(item.rotation) * item.scale * 0.55;
          // Flatten into a tangent-plane decal, with less than 4 mm thickness.
          transform.matrix.set(c, -s, 0, item.x, dx * c + dz * s, -dx * s + dz * c, -0.006, item.y,
            s, c, 0, item.z, 0, 0, 0, 1);
        } else if (kind === "flower") {
          // Tiny horizontal petal specks, using the existing blade fans as petals.
          transform.position.set(item.x, item.y + 0.26, item.z);
          transform.rotation.set(Math.PI / 2, 0, item.rotation);
          transform.scale.set(0.16, 0.16, 0.04);
          transform.updateMatrix();
        } else {
          transform.position.set(item.x, item.y, item.z);
          transform.rotation.set(0, item.rotation, 0);
          transform.scale.set(item.scale * (kind === "log" && !hasDetail() ? 3.6 : 1), item.scale,
            item.scale * (kind === "log" && !hasDetail() ? 0.65 : 1));
          transform.updateMatrix();
        }
        mesh.setMatrixAt(mesh.count, transform.matrix);
        const root = kind === "leaf" ? dryTint : kind === "flower" ? new Color(PALETTE[item.variant ? "paper" : "flower"])
          : kind === "grass" && foliageBiomeAt(item.x, item.z) === "forest-dawn" ? new Color(PALETTE.forestDeep) : kind === "grass" ? grassTint.clone().lerp(dryGrass, foliageBiomeAt(item.x, item.z) === "coast-dusk" ? 0.6 : 0) : white;
        mesh.setColorAt(mesh.count, root);
        mesh.geometry.getAttribute("groundVariant").setX(mesh.count, kind === "log" && hasDetail() ? 2 : kind === "flower" ? 0 : item.variant);
        const tip = kind === "grass" ? (foliageBiomeAt(item.x, item.z) === "forest-dawn" ? grassTint : dryGrass) : root;
        mesh.geometry.getAttribute("groundTip").setXYZ(mesh.count++, tip.r, tip.g, tip.b);
      }
    }
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.getAttribute("groundVariant").needsUpdate = true;
      mesh.geometry.getAttribute("groundTip").needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }
  const controller = {
    group,
    /** Explicit post-play hook. Keep all four instance batches and the global 40k cap. */
    loadDetail(load?: PropGeometryLoader): Promise<boolean> {
      if (disposed || quality === "Low") return Promise.resolve(false);
      if (detailedStone) return Promise.resolve(true);
      if (detailPending) return detailPending;
      detailPending = (async () => {
        const loader = load ?? (await import("../props/deferred")).loadPropGeometry;
        const results = await Promise.allSettled([loader("rock-small-1"), loader("rock-small-2"), loader("prop-log")]);
        const sources = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        if (disposed || sources.length !== 3) { sources.forEach(source => source.dispose()); return false; }
        detailedStone = variantGeometry(sources);
        detailedStone.setAttribute("groundVariant", proceduralStone.getAttribute("groundVariant"));
        detailedStone.setAttribute("groundTip", proceduralStone.getAttribute("groundTip"));
        if (!isLow()) {
          meshes[2]!.geometry = detailedStone;
          this.setTiles(submitted);
        }
        return true;
      })().catch(() => false).finally(() => { detailPending = undefined; });
      return detailPending;
    },
    setTiles(items: readonly GroundDetail[]) {
      const build = this.setTilesChunks(items);
      while (!build.next().done) { /* synchronous compatibility API */ }
    },
    *setTilesChunks(items: readonly GroundDetail[]): Generator<void> {
      assertLive();
      if (items.length > capacity) throw new RangeError("Ground capacity exceeded");
      const next = new Map<string, GroundDetail[]>();
      let proposals = 0;
      for (const item of items) {
        if (++proposals % 64 === 0) yield;
        if (!Object.hasOwn(GROUND_LIMITS.High, item.kind) || !Number.isInteger(item.variant)
          || item.variant < 0 || item.variant >= (item.kind === "grass" || item.kind === "fern" || item.kind === "bush" ? 3 : item.kind === "rock" || item.kind === "flower" ? 2 : 1)
          || ![item.x, item.y, item.z, item.scale, item.rotation].every(Number.isFinite) || item.scale <= 0) {
          throw new RangeError("Invalid ground detail");
        }
        const key = `${tileKey(Math.floor(item.x / TILE_SIZE), Math.floor(item.z / TILE_SIZE))}:${item.kind}`;
        const bucket = next.get(key) ?? [];
        bucket.push({ ...item });
        next.set(key, bucket);
      }
      const rank = (item: GroundDetail) => hash(`selection:${item.kind}:${item.x}:${item.z}`);
      const order = (a: GroundDetail, b: GroundDetail) => rank(a) - rank(b) || a.x - b.x || a.z - b.z
        || a.y - b.y || a.scale - b.scale || a.rotation - b.rotation || a.variant - b.variant;
      const center = focus ?? (items.length ? {
        x: items.reduce((sum, item) => sum + Math.floor(item.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2, 0) / items.length,
        z: items.reduce((sum, item) => sum + Math.floor(item.z / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2, 0) / items.length,
      } : { x: 0, z: 0 });
      const distance = (item: GroundDetail) => Math.hypot(item.x - center.x, item.z - center.z);
      const candidates = [...next.values()].flatMap(bucket => bucket.sort(order).slice(0, GROUND_LIMITS.High[bucket[0]!.kind]))
        .filter(item => {
          const d = distance(item), keep = d <= 18 ? 1 : d <= 40 ? 0.55 : d <= 80 ? 0.15 : d <= 120 ? 0.03 : 0;
          const selection = item.kind === "fern" ? hash(`fern-lod:${Math.floor(item.x / 8)}:${Math.floor(item.z / 8)}`) : rank(item);
          return selection / 4294967296 < keep;
        }).sort((a, b) => Math.floor(distance(a) / 18) - Math.floor(distance(b) / 18) || order(a, b));
      // Select before thinning so lower qualities remain nested subsets.
      let triangles = 0;
      const selected = new Map<string, GroundDetail[]>();
      for (const item of candidates) {
        if (++proposals % 64 === 0) yield;
        const cost = triangleCost(item.kind);
        if (triangles + cost > GROUND_TRIANGLE_LIMIT) continue;
        triangles += cost;
        const key = `${tileKey(Math.floor(item.x / TILE_SIZE), Math.floor(item.z / TILE_SIZE))}:${item.kind}`;
        const bucket = selected.get(key) ?? [];
        bucket.push(item);
        selected.set(key, bucket);
      }
      buckets = [...selected.values()];
      submitted = items.map(item => ({ ...item }));
      yield* updateChunks();
    },
    /** Update after crossing a terrain cell; no geometry allocation or extra draw calls. */
    setFocus(x: number, z: number) {
      assertLive();
      if (![x, z].every(Number.isFinite)) throw new RangeError("Invalid ground focus");
      if (focus && Math.floor(focus.x / 8) === Math.floor(x / 8) && Math.floor(focus.z / 8) === Math.floor(z / 8)) return;
      focus = { x: Math.floor(x / 8) * 8 + 4, z: Math.floor(z / 8) * 8 + 4 };
      this.setTiles(submitted);
    },
    setQuality(next: Quality) {
      assertLive();
      if (!Object.hasOwn(GROUND_LIMITS, next)) throw new RangeError("Invalid ground quality");
      setBakedPropQuality(group.parent ?? group, next);
      if (quality === next) return;
      quality = next;
      meshes[2]!.geometry = next === "Low" ? proceduralStone : detailedStone ?? proceduralStone;
      this.setTiles(submitted);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detailLoaders.delete(group);
      buckets = [];
      submitted = [];
      group.removeFromParent();
      group.clear();
      for (const mesh of meshes) { mesh.count = 0; mesh.dispose(); mesh.geometry.dispose(); }
      if (meshes[2]!.geometry !== proceduralStone) proceduralStone.dispose();
      if (detailedStone && meshes[2]!.geometry !== detailedStone) detailedStone.dispose();
      material.dispose();
      // Cached ramp gradients belong to the world; disposeRampGradients owns them.
    },
  };
  detailLoaders.set(group, () => controller.loadDetail());
  // A visible ground batch means play has begun. Start once, after its first render,
  // so scene/compose and the Lead-owned world entry point need no changes.
  const detailMesh = meshes[2]!;
  detailMesh.onAfterRender = () => {
    if (disposed || isLow()) return;
    detailMesh.onAfterRender = () => {};
    void controller.loadDetail();
  };
  return controller;
}
