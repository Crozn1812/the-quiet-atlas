import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Object3D } from "three";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { ZONES } from "../layout/zones";
import { createRampMaterial } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt, worldHeight } from "../terrain/height";
import { nearestPath, nearestRiver } from "../terrain/samples";
import { TILE_CELLS, TILE_SIZE, tileKey, type TerrainTile, type TileAddress } from "../terrain/tiles";
import { foliageBiomeAt } from "./scatter";

export const GRASS_VARIANT_SEEDS = [901, 903, 905] as const;
export const ROCK_VARIANT_SEEDS = [1200, 1201] as const;
export const GROUND_MIN_HEIGHT = 0.9;
/** Encloses every variant at its largest scatter scale (1.1), in metres. */
export const GROUND_RADIUS = 0.8;
export const GROUND_LIMITS = {
  High: { grass: 600, rock: 40 },
  Balanced: { grass: 360, rock: 24 },
  Low: { grass: 0, rock: Math.round(40 * PRESETS.Low.density) },
} as const;

export interface GroundDetail {
  readonly kind: "grass" | "rock";
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  /** Radians around world Y. */
  readonly rotation: number;
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

function grassColor(): Color {
  const recipe = WORLD_DIRECTION.background.terrain;
  return new Color(paletteColor({ ...recipe, base: "forestLight", mix: "paper" }));
}

/** 5–9 flat, tapered blades; two bent segments use 3 triangles/blade (at most 27). */
export function createGrassTuft(seed: number = GRASS_VARIANT_SEEDS[0]): BufferGeometry {
  const random = randomFor(seed);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const blades = 5 + (seed >>> 0) % 5;
  const baseColor = grassColor().multiplyScalar(0.7);
  const tipColor = grassColor().lerp(new Color(PALETTE.paper), 0.25);
  const phase = random() * Math.PI * 2;
  for (let blade = 0; blade < blades; blade++) {
    const angle = phase + blade * 2.39996;
    const height = 0.32 + random() * 0.26;
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
      }
    }
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Twenty matte facets, flattened and partly buried; coincident vertices stay joined. */
export function createRock(seed: number = ROCK_VARIANT_SEEDS[0]): BufferGeometry {
  const random = randomFor(seed);
  const geometry = new IcosahedronGeometry(1, 0);
  const phase = random() * Math.PI * 2;
  const width = 0.42 + random() * 0.14;
  const height = 0.18 + random() * 0.08;
  const positions = geometry.getAttribute("position");
  const colors: number[] = [];
  const color = new Color(paletteColor(WORLD_DIRECTION.background.terrain)).lerp(new Color(PALETTE.ink), 0.35);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const wobble = 1 + Math.sin(x * 7 + y * 5 + z * 9 + phase) * 0.09;
    positions.setXYZ(i, x * width * wobble, y * height * wobble + height * 0.45, z * width * 0.85 * wobble);
    const wash = color.clone().multiplyScalar(0.85 + (y + 1) * 0.075);
    colors.push(wash.r, wash.g, wash.b);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Matches the 2 m rendered heightfield triangles without depending on scene/compose. */
function surfaceHeight(x: number, z: number): number {
  const step = TILE_SIZE / TILE_CELLS;
  const x0 = Math.floor(x / step) * step, z0 = Math.floor(z / step) * step;
  const u = (x - x0) / step, v = (z - z0) / step;
  const a = Math.fround(worldHeight(x0, z0)), b = Math.fround(worldHeight(x0 + step, z0));
  const c = Math.fround(worldHeight(x0, z0 + step)), d = Math.fround(worldHeight(x0 + step, z0 + step));
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

function dryFootprint(x: number, z: number): boolean {
  // Centre and a conservative ring protect short blades on sloping banks/beaches.
  for (let i = -1; i < 8; i++) {
    const px = x + (i < 0 ? 0 : Math.cos(i * Math.PI / 4) * GROUND_RADIUS);
    const pz = z + (i < 0 ? 0 : Math.sin(i * Math.PI / 4) * GROUND_RADIUS);
    const minimum = Math.max(GROUND_MIN_HEIGHT, waterLevelAt(pz) + 0.03);
    if (worldHeight(px, pz) < minimum || surfaceHeight(px, pz) < minimum) return false;
  }
  return true;
}

/** High-quality candidates, flat like scatterTile; quality only thins them in setQuality. */
export function scatterGround(tile: TileAddress | TerrainTile): GroundDetail[] {
  const ix = "ix" in tile ? tile.ix : tile.origin.x / TILE_SIZE;
  const iz = "iz" in tile ? tile.iz : tile.origin.z / TILE_SIZE;
  const key = tileKey(ix, iz);
  if ("size" in tile && tile.size !== TILE_SIZE) throw new RangeError("Ground details require standard terrain tiles");
  const result: GroundDetail[] = [];
  const oldTrail = ZONES.find(zone => zone.id === "old-trail")!;
  for (const kind of ["grass", "rock"] as const) {
    const random = randomFor(hash(`${kind}:${key}`));
    const trials = kind === "grass" ? 1200 : 144;
    let count = 0;
    for (let i = 0; i < trials && count < GROUND_LIMITS.High[kind]; i++) {
      const x = (ix + random()) * TILE_SIZE, z = (iz + random()) * TILE_SIZE;
      const roll = random(), scale = 0.75 + random() * 0.35, rotation = random() * Math.PI * 2;
      const variant = Math.floor(random() * (kind === "grass" ? 3 : 2));
      const path = nearestPath(x, z);
      if (path.distance < PATH_WIDTH / 2 + GROUND_RADIUS + 0.02) continue;
      const river = nearestRiver(x, z);
      const bank = Math.max(0, 1 - Math.abs(river.distance - 8) / 12);
      const verge = Math.max(0, 1 - Math.abs(path.distance - 4) / 6);
      // World-space patches leave soft, open gaps and cross tile seams continuously.
      const patch = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(x * 0.17 + Math.sin(z * 0.11) * 2));
      const hill = foliageBiomeAt(x, z) === "hill";
      const trail = Math.max(0, 1 - Math.hypot(x - oldTrail.position.x, z - oldTrail.position.z) / 55);
      const density = kind === "grass" ? ((hill ? 0.045 : 0.18) + bank * 0.55 + verge * 0.5) * patch
        : 0.025 + bank * 0.22 + trail * 0.3;
      if (roll >= density || !dryFootprint(x, z)) continue;
      result.push({ kind, variant, x, z, y: surfaceHeight(x, z), scale, rotation });
      count++;
    }
  }
  return result;
}

/**
 * Capacity is the total High-quality item count across all loaded tiles, before
 * thinning. Each of the five variants reserves that capacity for any seed mix.
 * setTiles accepts the flat concatenation of scatterGround results, replacing it
 * atomically. Tile/kind budgets and nested quality subsets survive input order.
 */
export function createGroundDetails(capacity: number) {
  if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError("Ground capacity must be a non-negative integer");
  const group = new Group();
  group.name = "ground-details";
  const material = createRampMaterial(0xffffff, WORLD_DIRECTION.foliage.ramp);
  material.vertexColors = true;
  material.side = DoubleSide;
  const grass = GRASS_VARIANT_SEEDS.map(seed => new InstancedMesh(createGrassTuft(seed), material, capacity));
  const rock = ROCK_VARIANT_SEEDS.map(seed => new InstancedMesh(createRock(seed), material, capacity));
  const meshes = [...grass, ...rock];
  for (const [index, mesh] of meshes.entries()) {
    mesh.name = index < 3 ? `grass-${index}` : `rock-${index - 3}`;
    mesh.count = 0;
    mesh.castShadow = mesh.receiveShadow = false;
    group.add(mesh);
  }
  let buckets: GroundDetail[][] = [];
  let quality: Quality = "High";
  let disposed = false;
  const transform = new Object3D();
  function assertLive() {
    if (disposed) throw new Error("Ground details have been disposed");
  }
  function update() {
    for (const mesh of meshes) mesh.count = 0;
    for (const items of buckets) {
      const kind = items[0]!.kind;
      const ratio = GROUND_LIMITS[quality][kind] / GROUND_LIMITS.High[kind];
      const count = Math.round(Math.min(items.length, GROUND_LIMITS.High[kind]) * ratio);
      for (const item of items.slice(0, count)) {
        const mesh = (kind === "grass" ? grass : rock)[item.variant]!;
        transform.position.set(item.x, item.y, item.z);
        transform.rotation.set(0, item.rotation, 0);
        transform.scale.setScalar(item.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
    }
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
  }
  return {
    group,
    setTiles(items: readonly GroundDetail[]) {
      assertLive();
      if (items.length > capacity) throw new RangeError("Ground capacity exceeded");
      const next = new Map<string, GroundDetail[]>();
      for (const item of items) {
        if ((item.kind !== "grass" && item.kind !== "rock") || !Number.isInteger(item.variant)
          || item.variant < 0 || item.variant >= (item.kind === "grass" ? 3 : 2)
          || ![item.x, item.y, item.z, item.scale, item.rotation].every(Number.isFinite) || item.scale <= 0) {
          throw new RangeError("Invalid ground detail");
        }
        const key = `${tileKey(Math.floor(item.x / TILE_SIZE), Math.floor(item.z / TILE_SIZE))}:${item.kind}`;
        const bucket = next.get(key) ?? [];
        bucket.push({ ...item });
        next.set(key, bucket);
      }
      const rank = (item: GroundDetail) => hash(`selection:${item.x}:${item.z}`);
      buckets = [...next.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, items]) =>
        items.sort((a, b) => rank(a) - rank(b) || a.x - b.x || a.z - b.z));
      update();
    },
    setQuality(next: Quality) {
      assertLive();
      if (!(next in GROUND_LIMITS)) throw new RangeError("Invalid ground quality");
      quality = next;
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      buckets = [];
      group.removeFromParent();
      group.clear();
      for (const mesh of meshes) { mesh.count = 0; mesh.dispose(); mesh.geometry.dispose(); }
      material.dispose();
      // Cached ramp gradients belong to the world; disposeRampGradients owns them.
    },
  };
}
