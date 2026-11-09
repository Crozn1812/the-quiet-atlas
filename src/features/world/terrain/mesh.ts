import { Box3, BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, Ray, Vector3, type Material } from "three";
import { forestAtmosphereWeight } from "../art/direction";
import { hex } from "../art/palette";
import { PATH_WIDTH, riverWidthAt, TERRAIN_SEED, waterLevelAt, worldHeight } from "./height";
import { nearestPath, nearestRiver } from "./samples";
import type { TerrainTile } from "./tiles";

const grass = new Color(hex("grass"));
const grassDry = new Color(hex("grassDry"));
const forestDeep = new Color(hex("forestDeep"));
const meadowMoss = grass.clone().lerp(grassDry, 0.64).lerp(new Color(hex("cloud")), 0.045);
const rock = new Color(hex("rock"));
const rockDark = new Color(hex("rockDark"));
const sand = new Color(hex("sand"));
const bankStone = rock.clone().lerp(sand, 0.22);
const trailSoil = sand.clone().lerp(new Color(hex("sunGold")), 0.06).lerp(new Color(hex("flower")), 0.12);
const seaDeep = new Color(hex("seaDeep"));
const dirt = grassDry.clone().lerp(rockDark, 0.32);
const leafLitter = grassDry.clone().lerp(new Color(hex("dusk")), 0.08);
const dampSoil = rockDark.clone().lerp(forestDeep, 0.25);
const sunlitMoss = grass.clone().lerp(grassDry, 0.72).lerp(new Color(hex("cloud")), 0.045);
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
  const forestSurface = new Float32Array(stride ** 2 * 2);
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
    const path = nearestPath(wx, wz);
    const river = nearestRiver(wx, wz);
    // Preserve the old pigment under the 5 m asphalt and its gravel shoulders.
    const groundDetail = 1 - smoothstep(0.76, 0.78, path.t) * (1 - smoothstep(4, 7, path.distance));
    const patch = pigmentNoise(wx, wz, 8);
    const fleck = pigmentNoise(wx, wz, 1.5);
    const broad = 0.7 * pigmentNoise(wx, wz, 64) + 0.3 * pigmentNoise(wx, wz, 32);
    // Bake a slight golden bias on slopes facing the coastal sun (+X, -Z).
    const sunward = Math.max(0, (-0.8 * dx + 0.6 * dz) / length);
    const dryness = clamp(smoothstep(0.2, 0.8, broad)
      + 0.16 * smoothstep(3, 45, aboveWater) + 0.1 * sunward
      + 0.25 * smoothstep(550, 850, -wz) * groundDetail);
    color.copy(grass).lerp(grassDry, dryness);

    // Share the biome edge with forest air: a 40 m fade in walking distance.
    // 8 m moss islands and 1.5 m leaf/soil flecks stay continuous across tiles.
    const forest = forestAtmosphereWeight(path.t);
    const bankDistance = river.distance - riverWidthAt(river.t) / 2;
    if (forest > 0) {
      const moss = smoothstep(0.2, 0.8, 0.65 * patch + 0.35 * fleck);
      tint.copy(meadowMoss).lerp(grass, 0.15 * moss);
      // Damp soil fades out beyond the stream; it never changes the water masks below.
      const damp = (1 - smoothstep(2, 9, bankDistance)) * (0.3 + 0.2 * patch);
      tint.lerp(dampSoil, damp * 0.4);
      const leaves = smoothstep(0.62, 0.85, fleck) * smoothstep(0.45, 0.7, patch);
      tint.lerp(leafLitter, leaves * 0.22 * (1 - damp));
      // Dawn opens the yellow-green moss islands, leaving wet stream soil dark.
      tint.lerp(sunlitMoss, 0.65 * moss * moss * smoothstep(2, 9, bankDistance));
      color.lerp(tint, forest);
    }

    // Broken soil on grassy slopes, before the existing fully rocky cliff ramp.
    const slope = Math.hypot(dx, dz);
    const exposed = smoothstep(0.25, 0.65, slope) * smoothstep(0.35, 0.75, patch);
    if (exposed > 0) {
      tint.copy(sand).lerp(rockDark, 0.68 + 0.1 * fleck);
      color.lerp(tint, 0.45 * exposed * (1 - forest) * groundDetail);
    }

    // Rock starts above 35 degrees. Fine noise breaks up the soft cliff edge;
    // every 45-degree face is fully rocky, with darker seams rather than a hard band.
    const detail = pigmentNoise(wx, wz, 6);
    const cliffEnd = Math.tan((41 + detail * 4) * Math.PI / 180);
    const cliff = smoothstep(cliffStart, cliffEnd, slope);
    forestSurface.set([forest * smoothstep(0.15, 0.6, aboveWater) * (1 - cliff), smoothstep(2.4, 3.1, path.distance)], vertex * 2);
    tint.copy(rock).lerp(rockDark, 0.08 + 0.2 * detail);
    color.lerp(tint, cliff);

    // Lead fix: sand and seabed belong to real water only. waterLevelAt() is the valley's river level, so low meadow
    // ground far from the stream must stay grass. Sea: south of z −700 (the bay reaches −680). Stream: within ~3 m of
    // the ribbon edge, where the bed reads as light wet stone, not the dark seabed (no black halo beside the ribbon).
    const bank = 1 - smoothstep(riverWidthAt(river.t) / 2 + 0.5, riverWidthAt(river.t) / 2 + 3, river.distance);
    const sea = 1 - smoothstep(-720, -680, wz);
    tint.copy(sand).lerp(rock, 0.08 + 0.12 * detail + 0.25 * (1 - sea));
    // Sea beach is a narrow band (Duy's refs: grass runs down to the stones); the stream bank keeps 1.2–2.2 m.
    color.lerp(tint, Math.max(bank * (1 - smoothstep(1.2, 2.2, aboveWater)), sea * (1 - smoothstep(0.5, 1.1, aboveWater))));
    tint.copy(rockDark).lerp(seaDeep, 0.2 + 0.45 * smoothstep(0, 3, -aboveWater));
    color.lerp(tint, sea * (1 - smoothstep(-0.3, 0, aboveWater)));

    // The coastal stream is still above sea level. Its exposed outer bank must
    // not inherit the sea-depth pigment merely because z is south of -720.
    // A 2 m terrain cell straddles the ribbon edge: retain warm mineral colour
    // just below local water too, so interpolation cannot leave a black rim.
    // Keep the asphalt foundation and the deep channel/sea unchanged.
    const waterEdge = riverWidthAt(river.t) / 2;
    const coastalBank = smoothstep(0.82, 0.85, path.t) * bank
      * smoothstep(waterEdge - 2, waterEdge - 0.5, river.distance)
      * smoothstep(7, 10, path.distance) * smoothstep(-1.1, -0.75, aboveWater);
    tint.copy(bankStone).lerp(rock, 0.12 * patch + 0.08 * fleck);
    color.lerp(tint, coastalBank);

    // The unpaved forest route stays light brown, including its low river-bank stretches.
    const trail = (1 - smoothstep(PATH_WIDTH / 2, PATH_WIDTH / 2 + 1.5, path.distance))
      * (1 - smoothstep(0.8, 0.82, path.t)) * smoothstep(0, 0.15, aboveWater) * (1 - cliff);
    color.lerp(dirt, trail * (1 - forest));
    // A 2.6–3.4 m mineral trail survives interpolation on the existing 2 m grid.
    const trailRadius = 1.3 + 0.4 * patch;
    // A small pigment footprint keeps a sub-cell trail visible on the existing 2 m grid.
    const trailFeather = Math.min(0.5, step * 0.25);
    const trailEdge = smoothstep(trailRadius - trailFeather, trailRadius + trailFeather, path.distance);
    const encroachment = smoothstep(0.55, 0.8, fleck) * smoothstep(0.2, trailRadius, path.distance);
    const forestTrail = (1 - trailEdge) * (1 - 0.65 * encroachment)
      * forest * smoothstep(0, 0.15, aboveWater) * (1 - cliff);
    // Pale mineral soil separates the walking line from jade moss under canopy.
    tint.copy(trailSoil).lerp(rock, 0.02 + 0.03 * fleck);
    color.lerp(tint, forestTrail);
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
  geometry.setAttribute("forestSurface", new BufferAttribute(forestSurface, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (!material.vertexColors) {
    material.vertexColors = true;
    material.needsUpdate = true;
  }
  const mesh = new Mesh(geometry, material);
  // Preserve Three's exact triangle hits, but reject empty row slabs first.
  // Camera/ground rays otherwise visit all 2,048 triangles in a 64 m tile.
  const slabs = Array.from({ length: cells }, (_, x) => {
    const bounds = new Box3();
    const point = new Vector3();
    for (let column = x; column <= x + 1; column++) for (let z = 0; z <= cells; z++) {
      bounds.expandByPoint(point.fromBufferAttribute(geometry.getAttribute("position"), column * stride + z));
    }
    return bounds;
  });
  const localRay = new Ray(), inverse = new Matrix4();
  const raycast = mesh.raycast;
  mesh.raycast = function (caster, hits) {
    if (this.geometry !== geometry) { raycast.call(this, caster, hits); return; }
    localRay.copy(caster.ray).applyMatrix4(inverse.copy(this.matrixWorld).invert());
    if (!localRay.intersectsBox(geometry.boundingBox!)) return;
    const { start, count } = geometry.drawRange;
    try {
      for (let row = 0; row < cells; row++) {
        if (!localRay.intersectsBox(slabs[row]!)) continue;
        const first = Math.max(start, row * cells * 6);
        const last = Math.min(start + count, (row + 1) * cells * 6);
        if (last <= first) continue;
        geometry.setDrawRange(first, last - first);
        raycast.call(this, caster, hits);
      }
    } finally { geometry.setDrawRange(start, count); }
  };
  mesh.name = "terrain-tile";
  mesh.position.set(origin.x, origin.y, origin.z);
  mesh.receiveShadow = true;
  mesh.updateMatrixWorld(true);
  return mesh;
}
