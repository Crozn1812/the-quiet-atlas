import { BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Object3D } from "three";
import { WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { PATH_BRIDGES } from "../layout/path";
import { ZONES } from "../layout/zones";
import { createRampMaterial } from "../materials/ramp";
import { PRESETS, type Quality } from "../terrain";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt, worldHeight } from "../terrain/height";
import { nearestPath, nearestRiver, PATH_SAMPLES } from "../terrain/samples";
import { TILE_CELLS, TILE_SIZE, tileKey, type TerrainTile, type TileAddress } from "../terrain/tiles";
import { foliageBiomeAt, PATH_CLEARANCE, ZONE_CLEARANCE } from "./scatter";

export const GRASS_VARIANT_SEEDS = [901, 903, 905] as const;
export const ROCK_VARIANT_SEEDS = [1200, 1201] as const;
export const GROUND_MIN_HEIGHT = 0.9;
/** Conservative XZ radius for ordinary plants/rocks at their largest scale. */
export const GROUND_RADIUS = 0.8;
export const GROUND_LOG_RADIUS = 2.4;
export const GROUND_LEAF_RADIUS = 0.45;
export const GROUND_TRIANGLE_LIMIT = 40_000;
export const GROUND_LIMITS = {
  High: { grass: 600, rock: 40, fern: 200, bush: 160, log: 4, leaf: 160 },
  Balanced: { grass: 360, rock: 24, fern: 120, bush: 96, log: 2, leaf: 96 },
  Low: { grass: 0, rock: Math.round(40 * PRESETS.Low.density), fern: 40, bush: 32, log: 1, leaf: 24 },
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

function grassColor(): Color {
  return new Color(PALETTE.forestLight).lerp(new Color(PALETTE.grass), 0.3);
}

/** 5-9 flat, tapered blades; two bent segments use 3 triangles/blade (at most 27). */
export function createGrassTuft(seed: number = GRASS_VARIANT_SEEDS[0]): BufferGeometry {
  const random = randomFor(seed);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const blades = 5 + (seed >>> 0) % 5;
  const baseColor = new Color(PALETTE.forestDeep);
  const tipColor = grassColor();
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

/** A closed six-sided weathered solid: 24 triangles, also stretched into logs. */
export function createRock(seed: number = ROCK_VARIANT_SEEDS[0]): BufferGeometry {
  const random = randomFor(seed);
  const cylinder = new CylinderGeometry(0.85, 1, 2, 6, 1);
  // Separate face normals keep the weathered stone/wood silhouette softly faceted.
  const geometry = cylinder.toNonIndexed();
  cylinder.dispose();
  geometry.rotateZ(Math.PI / 2);
  geometry.clearGroups();
  const phase = random() * Math.PI * 2;
  const width = 0.42 + random() * 0.14;
  const height = 0.18 + random() * 0.08;
  const positions = geometry.getAttribute("position");
  const colors: number[] = [];
  const base = new Color(PALETTE.rockDark);
  const moss = new Color(PALETTE.grass).lerp(new Color(PALETTE.forestDeep), 0.35);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const wobble = 1 + Math.sin(x * 7 + y * 5 + z * 9 + phase) * 0.09;
    positions.setXYZ(i, x * width * wobble, y * height * wobble + height * 0.45, z * width * 0.85 * wobble);
    const wash = base.clone().lerp(moss, Math.max(0, y));
    colors.push(wash.r, wash.g, wash.b);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
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

/** Five arching fronds with paired tapered pinnae: 40 triangles, 1 m unscaled. */
export function createFern(): BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const root = new Color(PALETTE.forestDeep), tip = new Color(PALETTE.forestLight);
  const add = (angle: number, radius: number, height: number, side: number) => {
    positions.push(Math.cos(angle) * radius - Math.sin(angle) * side, height,
      Math.sin(angle) * radius + Math.cos(angle) * side);
    const color = root.clone().lerp(tip, height);
    colors.push(color.r, color.g, color.b);
    return positions.length / 3 - 1;
  };
  for (let frond = 0; frond < 5; frond++) {
    const angle = frond * Math.PI * 2 / 5;
    const a = add(angle, 0, 0, -0.012), b = add(angle, 0, 0, 0.012);
    const c = add(angle, 0.32, 1, 0), d = add(angle, 0.72, 0.65, 0);
    indices.push(a, b, c, b, d, c);
    for (const t of [0.3, 0.55, 0.8]) for (const side of [-1, 1]) {
      const r = t * 0.72, h = Math.sin(t * Math.PI * 0.7) * 0.94;
      const start = add(angle, r - 0.1, h - 0.12, 0);
      const outer = add(angle, r + 0.04, h, side * (1 - t) * 0.3);
      const end = add(angle, r + 0.12, h + 0.05, 0);
      indices.push(start, outer, end);
    }
  }
  return leafGeometry(positions, colors, indices);
}

/** Six broad folded leaf fans at staggered heights: 24 triangles, 1 m tall. */
export function createBroadleafBush(): BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let leaf = 0; leaf < 6; leaf++) {
    const angle = leaf * 2.39996, height = 0.6 + leaf % 3 * 0.1;
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
function surfaceFrame(x: number, z: number) {
  const step = TILE_SIZE / TILE_CELLS;
  const x0 = Math.floor(x / step) * step, z0 = Math.floor(z / step) * step;
  const u = (x - x0) / step, v = (z - z0) / step;
  const a = Math.fround(worldHeight(x0, z0)), b = Math.fround(worldHeight(x0 + step, z0));
  const c = Math.fround(worldHeight(x0, z0 + step)), d = Math.fround(worldHeight(x0 + step, z0 + step));
  return u + v <= 1 ? { y: a + (b - a) * u + (c - a) * v, dx: (b - a) / step, dz: (c - a) / step }
    : { y: d + (c - d) * (1 - u) + (b - d) * (1 - v), dx: (d - c) / step, dz: (d - b) / step };
}

function dryFootprint(x: number, z: number, radius: number, litter: boolean): boolean {
  const frame = surfaceFrame(x, z);
  for (let i = -1; i < 8; i++) {
    const dx = i < 0 ? 0 : Math.cos(i * Math.PI / 4) * radius;
    const dz = i < 0 ? 0 : Math.sin(i * Math.PI / 4) * radius;
    const minimum = Math.max(GROUND_MIN_HEIGHT, waterLevelAt(z + dz) + 0.03);
    const surface = surfaceFrame(x + dx, z + dz).y;
    if (worldHeight(x + dx, z + dz) < minimum || surface < minimum) return false;
    // Avoid creases where a planar decal could clip through the heightfield.
    if (litter && Math.abs(surface - frame.y - frame.dx * dx - frame.dz * dz) > 0.008) return false;
  }
  return true;
}

/** Seeded forest understory, densest in the 2.5–8 m green corridor. */
export function scatterGround(tile: TileAddress | TerrainTile): GroundDetail[] {
  const ix = "ix" in tile ? tile.ix : tile.origin.x / TILE_SIZE;
  const iz = "iz" in tile ? tile.iz : tile.origin.z / TILE_SIZE;
  const key = tileKey(ix, iz);
  if ("size" in tile && tile.size !== TILE_SIZE) throw new RangeError("Ground details require standard terrain tiles");
  const result: GroundDetail[] = [];
  for (const kind of Object.keys(GROUND_LIMITS.High) as GroundDetail["kind"][]) {
    const random = randomFor(hash(`${kind}:${key}`));
    const trials = kind === "grass" ? 1200 : kind === "fern" || kind === "bush" || kind === "leaf" ? 1400 : 144;
    let count = 0;
    for (let i = 0; i < trials && count < GROUND_LIMITS.High[kind]; i++) {
      let x = (ix + random()) * TILE_SIZE, z = (iz + random()) * TILE_SIZE;
      if ((kind === "fern" || kind === "bush") && i % 4 !== 0) {
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
      const variant = Math.floor(random() * (kind === "grass" ? 3 : kind === "rock" ? 2 : 1));
      const path = nearestPath(x, z), forest = foliageBiomeAt(x, z) === "forest-dawn";
      const litter = kind === "leaf", hard = kind === "rock" || kind === "log";
      if (!forest && kind !== "grass" && kind !== "rock") continue;
      if (forest && kind === "grass") continue;
      const radius = groundRadius(kind);
      if (litter ? path.distance + radius > PATH_WIDTH / 2 - 0.02
        : path.distance < (hard ? PATH_CLEARANCE : PATH_WIDTH / 2) + radius + 0.02) continue;
      if (ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + ZONE_CLEARANCE + radius)
        || PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < 6 + radius)) continue;
      const bank = Math.max(0, 1 - Math.abs(nearestRiver(x, z).distance - 8) / 12);
      const patch = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(x * 0.17 + Math.sin(z * 0.11) * 2));
      const corridor = path.distance <= 8 ? 0.95 : 0.018 + 0.6 * Math.exp(-(path.distance - 8) / 7);
      const density = kind === "fern" || kind === "bush" ? corridor * patch
        : litter ? 0.85 : kind === "log" ? 0.012
          : kind === "rock" ? 0.025 + bank * 0.22 : (0.045 + bank * 0.55) * patch;
      if (roll >= density || !dryFootprint(x, z, radius, litter)) continue;
      const scale = kind === "fern" ? 0.4 + size * 0.6 : kind === "bush" ? 0.6 + size * 0.8 : 0.75 + size * 0.35;
      result.push({ kind, variant, x, z, y: surfaceFrame(x, z).y + (litter ? 0.018 : 0), scale, rotation });
      count++;
    }
  }
  return result;
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
  const fragments = createGrassTuft();
  fragments.getAttribute("color").array.fill(1);
  const meshes = [createFern(), createBroadleafBush(), createRock(), fragments].map((geometry, i) => {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = `ground-${["fern", "bush", "wood-stone", "grass-litter"][i]}`;
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
  let disposed = false;
  const transform = new Object3D();
  const white = new Color(0xffffff), grassTint = grassColor();
  const dryTint = new Color(PALETTE.grassDry).lerp(new Color(PALETTE.flower), 0.03);
  function assertLive() {
    if (disposed) throw new Error("Ground details have been disposed");
  }
  function update() {
    for (const mesh of meshes) mesh.count = 0;
    for (const items of buckets) {
      const kind = items[0]!.kind;
      const count = Math.round(items.length * GROUND_LIMITS[quality][kind] / GROUND_LIMITS.High[kind]);
      for (const item of items.slice(0, count)) {
        const mesh = meshes[meshIndex(kind)]!;
        if (kind === "leaf") {
          const { dx, dz } = surfaceFrame(item.x, item.z);
          const c = Math.cos(item.rotation) * item.scale * 0.55, s = Math.sin(item.rotation) * item.scale * 0.55;
          // Flatten into a tangent-plane decal, with less than 4 mm thickness.
          transform.matrix.set(c, -s, 0, item.x, dx * c + dz * s, -dx * s + dz * c, -0.006, item.y,
            s, c, 0, item.z, 0, 0, 0, 1);
        } else {
          transform.position.set(item.x, item.y, item.z);
          transform.rotation.set(0, item.rotation, 0);
          transform.scale.set(item.scale * (kind === "log" ? 3.6 : 1), item.scale, item.scale * (kind === "log" ? 0.65 : 1));
          transform.updateMatrix();
        }
        mesh.setMatrixAt(mesh.count, transform.matrix);
        mesh.setColorAt(mesh.count++, kind === "leaf" ? dryTint : kind === "grass" ? grassTint : white);
      }
    }
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
        if (!Object.hasOwn(GROUND_LIMITS.High, item.kind) || !Number.isInteger(item.variant)
          || item.variant < 0 || item.variant >= (item.kind === "grass" ? 3 : item.kind === "rock" ? 2 : 1)
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
      const candidates = [...next.values()].flatMap(bucket => bucket.sort(order).slice(0, GROUND_LIMITS.High[bucket[0]!.kind])).sort(order);
      // Select before thinning so lower qualities remain nested subsets.
      let triangles = 0;
      const selected = new Map<string, GroundDetail[]>();
      for (const item of candidates) {
        const cost = triangleCost(item.kind);
        if (triangles + cost > GROUND_TRIANGLE_LIMIT) continue;
        triangles += cost;
        const key = `${tileKey(Math.floor(item.x / TILE_SIZE), Math.floor(item.z / TILE_SIZE))}:${item.kind}`;
        const bucket = selected.get(key) ?? [];
        bucket.push(item);
        selected.set(key, bucket);
      }
      buckets = [...selected.values()];
      update();
    },
    setQuality(next: Quality) {
      assertLive();
      if (!Object.hasOwn(GROUND_LIMITS, next)) throw new RangeError("Invalid ground quality");
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
