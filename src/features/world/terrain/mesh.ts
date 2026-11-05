import { BufferAttribute, BufferGeometry, Color, Mesh, type Material } from "three";
import { hex } from "../art/palette";
import { PATH_WIDTH, riverWidthAt, TERRAIN_SEED, waterLevelAt, worldHeight } from "./height";
import { nearestPath, nearestRiver } from "./samples";
import type { TerrainTile } from "./tiles";

const grass = new Color(hex("grass"));
const grassDry = new Color(hex("grassDry"));
const rock = new Color(hex("rock"));
const rockDark = new Color(hex("rockDark"));
const sand = new Color(hex("sand"));
const seaDeep = new Color(hex("seaDeep"));
const dirt = grassDry.clone().lerp(rockDark, 0.32);
const cliffStart = Math.tan(35 * Math.PI / 180);
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function smoothstep(start: number, end: number, value: number): number {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function pigmentAt(x: number, z: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ TERRAIN_SEED;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

/** Continuous world-space value noise: tile rebuilds and shared edges use identical pigment. */
function pigmentNoise(x: number, z: number, scale: number): number {
  const ix = Math.floor(x / scale), iz = Math.floor(z / scale);
  const tx = smoothstep(0, 1, x / scale - ix);
  const tz = smoothstep(0, 1, z / scale - iz);
  const a = pigmentAt(ix, iz) * (1 - tx) + pigmentAt(ix + 1, iz) * tx;
  const b = pigmentAt(ix, iz + 1) * (1 - tx) + pigmentAt(ix + 1, iz + 1) * tx;
  return a * (1 - tz) + b * tz;
}

/** Local XZ coordinates start at the tile's minimum corner; Y comes from its heightmap. */
export function createTileMesh<M extends Material>(tile: TerrainTile, material: M): Mesh<BufferGeometry, M> {
  const { cells, size, heights, origin } = tile;
  const stride = cells + 1;
  if (!Number.isInteger(cells) || cells < 1 || stride ** 2 > 65536
    || !Number.isFinite(size) || size <= 0 || heights.length !== stride ** 2) {
    throw new RangeError("Tile must have a positive size and a complete Uint16-addressable heightfield");
  }
  const step = size / cells;
  const positions = new Float32Array(stride ** 2 * 3);
  const normals = new Float32Array(positions.length);
  const colors = new Float32Array(positions.length);
  const indices = new Uint16Array(cells ** 2 * 6);
  const tint = new Color();
  const color = new Color();
  const heightAt = (x: number, z: number) => x >= 0 && x <= cells && z >= 0 && z <= cells
    ? heights[z + x * stride]!
    // Neighbour tiles store Float32 too: round before taking differences on BOTH sides.
    : Math.fround(worldHeight(origin.x + x * step, origin.z + z * step));

  let index = 0;
  for (let x = 0; x <= cells; x++) for (let z = 0; z <= cells; z++) {
    const vertex = z + x * stride;
    const offset = vertex * 3;
    const height = heights[vertex]!;
    const wx = origin.x + x * step;
    const wz = origin.z + z * step;
    positions.set([x * step, height, z * step], offset);
    const dx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / (2 * step);
    const dz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / (2 * step);
    const length = Math.hypot(dx, 1, dz);
    normals.set([-dx / length, 1 / length, -dz / length], offset);

    const aboveWater = origin.y + height - waterLevelAt(wz);
    const broad = 0.7 * pigmentNoise(wx, wz, 64) + 0.3 * pigmentNoise(wx, wz, 32);
    // Bake a slight golden bias on slopes facing the coastal sun (+X, -Z).
    const sunward = Math.max(0, (-0.8 * dx + 0.6 * dz) / length);
    const dryness = clamp(smoothstep(0.2, 0.8, broad)
      + 0.16 * smoothstep(3, 45, aboveWater) + 0.1 * sunward);
    color.copy(grass).lerp(grassDry, dryness);

    // Rock starts above 35 degrees. Fine noise breaks up the soft cliff edge;
    // every 45-degree face is fully rocky, with darker seams rather than a hard band.
    const detail = pigmentNoise(wx, wz, 6);
    const cliffEnd = Math.tan((41 + detail * 4) * Math.PI / 180);
    const cliff = smoothstep(cliffStart, cliffEnd, Math.hypot(dx, dz));
    tint.copy(rock).lerp(rockDark, 0.08 + 0.2 * detail);
    color.lerp(tint, cliff);

    // Lead fix: sand and seabed belong to real water only. waterLevelAt() is the valley's river level, so low meadow
    // ground far from the stream must stay grass. Sea: south of z −700 (the bay reaches −680). Stream: within ~3 m of
    // the ribbon edge, where the bed reads as light wet stone, not the dark seabed (no black halo beside the ribbon).
    const river = nearestRiver(wx, wz);
    const bank = 1 - smoothstep(riverWidthAt(river.t) / 2 + 0.5, riverWidthAt(river.t) / 2 + 3, river.distance);
    const sea = 1 - smoothstep(-720, -680, wz);
    const wet = Math.max(bank, sea);
    tint.copy(sand).lerp(rock, 0.08 + 0.12 * detail + 0.25 * (1 - sea));
    color.lerp(tint, wet * (1 - smoothstep(1.2, 2.2, aboveWater)));
    tint.copy(rockDark).lerp(seaDeep, 0.2 + 0.45 * smoothstep(0, 3, -aboveWater));
    color.lerp(tint, sea * (1 - smoothstep(-0.3, 0, aboveWater)));

    // The unpaved forest route stays light brown, including its low river-bank stretches.
    const path = nearestPath(wx, wz);
    const trail = (1 - smoothstep(PATH_WIDTH / 2, PATH_WIDTH / 2 + 1.5, path.distance))
      * (1 - smoothstep(0.8, 0.82, path.t)) * smoothstep(0, 0.15, aboveWater) * (1 - cliff);
    color.lerp(dirt, trail);
    colors.set([color.r, color.g, color.b], offset);

    if (x < cells && z < cells) {
      const next = vertex + stride;
      // Rapier's default diagonal joins (x, z + 1) to (x + 1, z); face upwards.
      indices.set([vertex, vertex + 1, next, next, vertex + 1, next + 1], index);
      index += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (!material.vertexColors) {
    material.vertexColors = true;
    material.needsUpdate = true;
  }
  const mesh = new Mesh(geometry, material);
  mesh.position.set(origin.x, origin.y, origin.z);
  mesh.receiveShadow = true;
  mesh.updateMatrixWorld(true);
  return mesh;
}
