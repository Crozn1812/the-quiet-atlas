import { BufferGeometry, Float32BufferAttribute, Mesh, CylinderGeometry, ConeGeometry, InstancedMesh, Object3D } from "three";
import { createRampMaterial, RAMP_PRESETS } from "./materials/ramp";
export type Quality = "Low" | "Balanced" | "High";
export const PRESETS = { Low: { density: 0.4, dpr: 1, shadow: 0 }, Balanced: { density: 0.7, dpr: 1.25, shadow: 1024 }, High: { density: 1, dpr: 2, shadow: 2048 } } as const;
export const SIZE = 60;
export const CELLS = 60;
export const SEED = 73021;
// P01-B procedural placeholders, not production art. Rapier column-major: z + x * stride.
export function createTerrain() {
  const heights = new Float32Array((CELLS + 1) ** 2);
  for (let x = 0; x <= CELLS; x++) for (let z = 0; z <= CELLS; z++) {
    heights[z + x * (CELLS + 1)] = Math.max(0, Math.min(5, (30 - z - 2) * 0.2));
  }
  return { heights, cells: CELLS, size: SIZE, seed: SEED };
}
export type Terrain = ReturnType<typeof createTerrain>;
export function terrainHeight(terrain: Terrain, x: number, z: number) {
  const fx = Math.max(0, Math.min(CELLS, x + SIZE / 2));
  const fz = Math.max(0, Math.min(CELLS, z + SIZE / 2));
  const ix = Math.min(CELLS - 1, Math.floor(fx)), iz = Math.min(CELLS - 1, Math.floor(fz));
  const sample = (dx: number, dz: number) => terrain.heights[iz + dz + (ix + dx) * (CELLS + 1)]!;
  const tx = fx - ix, tz = fz - iz;
  // Heights vary along z only; interpolation matches both triangle diagonals.
  return (sample(0, 0) * (1 - tz) + sample(0, 1) * tz) * (1 - tx)
    + (sample(1, 0) * (1 - tz) + sample(1, 1) * tz) * tx;
}
export function createTerrainMesh(terrain: Terrain) {
  const vertices: number[] = [], indices: number[] = [];
  for (let x = 0; x <= CELLS; x++) for (let z = 0; z <= CELLS; z++) {
    vertices.push(x - SIZE / 2, terrain.heights[z + x * (CELLS + 1)]!, z - SIZE / 2);
    if (x < CELLS && z < CELLS) {
      const a = z + x * (CELLS + 1), b = a + CELLS + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, createRampMaterial(RAMP_PRESETS.terrain));
  mesh.receiveShadow = true; mesh.updateMatrixWorld(true);
  return mesh;
}
export function createTrees(terrain: Terrain) {
  let seed = terrain.seed;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 200 }, (_, id) => {
    // Keep a broad central walking corridor; dense west, sparse east grove.
    const west = id < 140;
    const x = west ? -27 + random() * 21 : 7 + random() * 20;
    const z = -27 + random() * 54;
    return { x, z, y: terrainHeight(terrain, x, z), radius: 0.28, height: 4 + random() * 2 };
  });
}
export type Trees = ReturnType<typeof createTrees>;
export function createForest(trees: Trees, quality: Quality) {
  const trunks = new InstancedMesh(new CylinderGeometry(0.28, 0.28, 1, 6), createRampMaterial(RAMP_PRESETS.trunk), trees.length);
  const crowns = new InstancedMesh(new ConeGeometry(1.8, 4, 7), createRampMaterial(RAMP_PRESETS.crown), trees.length);
  updateForest([trunks, crowns], trees, quality);
  return [trunks, crowns] as const;
}
export function updateForest(forest: ReturnType<typeof createForest>, trees: Trees, quality: Quality) {
  const [trunks, crowns] = forest;
  const count = Math.round(trees.length * PRESETS[quality].density);
  trunks.count = count;
  crowns.count = count;
  const transform = new Object3D();
  // Evenly select across both groves; collision always uses all trees.
  for (let i = 0; i < count; i++) {
    const tree = trees[Math.floor(i * trees.length / count)]!;
    transform.position.set(tree.x, tree.y + tree.height / 2, tree.z);
    transform.scale.set(1, tree.height, 1);
    transform.updateMatrix();
    trunks.setMatrixAt(i, transform.matrix);
    transform.position.y = tree.y + tree.height;
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    crowns.setMatrixAt(i, transform.matrix);
  }
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}
