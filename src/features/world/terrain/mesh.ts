import { BufferAttribute, BufferGeometry, Color, Mesh, type Material } from "three";
import { hex } from "../art/palette";
import { worldHeight } from "./height";
import { nearestRiver } from "./samples";
import type { TerrainTile } from "./tiles";

const forestDeep = new Color(hex("forestDeep"));
const forestLight = new Color(hex("forestLight"));
const sand = new Color(hex("paper")).lerp(new Color(hex("dusk")), 0.18);
const clamp = (value: number) => Math.max(0, Math.min(1, value));

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
    const wx = origin.x + x * step;
    const wz = origin.z + z * step;
    const height = heights[vertex]!;
    positions.set([x * step, height, z * step], offset);
    const dx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / (2 * step);
    const dz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / (2 * step);
    const length = Math.hypot(dx, 1, dz);
    normals.set([-dx / length, 1 / length, -dz / length], offset);

    const bankHeight = Math.max(0, wz + 900) * 0.008;
    const hill = clamp((height - bankHeight) / 4 + Math.hypot(dx, dz) * 0.4);
    const river = 1 - clamp(nearestRiver(wx, wz).distance / 24);
    const coastT = clamp((-wz - 760) / 140);
    const coast = coastT * coastT * (3 - 2 * coastT);
    tint.copy(forestLight).lerp(forestDeep, river * (1 - hill)).lerp(sand, coast);
    // Near-white linear multipliers keep the caller's shared material colour dominant.
    color.setRGB(1, 1, 1).lerp(tint, 0.22);
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
