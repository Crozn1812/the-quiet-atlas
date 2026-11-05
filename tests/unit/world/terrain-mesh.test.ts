import RAPIER from "@dimforge/rapier3d-compat";
import { BufferGeometry, Color, MeshToonMaterial, Raycaster, Scene, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { hex } from "../../../src/features/world/art/palette";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { createTileCollider, removeTileCollider, type TileRapier } from "../../../src/features/world/terrain/collider";
import { riverWidthAt, waterLevelAt } from "../../../src/features/world/terrain/height";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";
import { createTilePool } from "../../../src/features/world/terrain/pool";
import { tilesToLoad } from "../../../src/features/world/terrain/streaming";
import { buildTile, tileKey, type TerrainTile } from "../../../src/features/world/terrain/tiles";

function physicsMock() {
  const descriptor = { setTranslation: vi.fn() };
  descriptor.setTranslation.mockReturnValue(descriptor);
  const heightfield = vi.fn().mockReturnValue(descriptor);
  const rapier = { ColliderDesc: { heightfield } } as unknown as TileRapier;
  let handle = 0;
  const world = {
    createCollider: vi.fn(() => ({ handle: handle++ }) as RAPIER.Collider),
    removeCollider: vi.fn(),
  };
  return { rapier, world, descriptor, heightfield };
}

const paletteColor = (key: Parameters<typeof hex>[0]) => new Color(hex(key));
const colorDistance = (a: Color, b: Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const luma = (color: Color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

/** Interior vertex of a known plane, independent of the procedural heightfield at tile edges. */
function sampleColor(x: number, z: number, height: number, dx = 0, dz = 0, originY = 0): Color {
  const tile: TerrainTile = {
    cells: 2, size: 4, origin: { x: x - 2, y: originY, z: z - 2 },
    heights: Float32Array.from({ length: 9 }, (_, i) =>
      height - originY + (Math.floor(i / 3) - 1) * 2 * dx + (i % 3 - 1) * 2 * dz),
  };
  const material = new MeshToonMaterial();
  const mesh = createTileMesh(tile, material);
  try {
    const colors = mesh.geometry.getAttribute("color");
    return new Color().setRGB(colors.getX(4), colors.getY(4), colors.getZ(4));
  } finally { mesh.geometry.dispose(); material.dispose(); }
}

describe("terrain tile mesh", () => {
  it("builds 1089 vertices and 2048 upward triangles from the original heightfield", () => {
    const tile = buildTile(-2, -5);
    const material = new MeshToonMaterial({ color: 0x5e8c6a });
    const baseColor = material.color.clone();
    const mesh = createTileMesh(tile, material);
    try {
      expect(mesh.material).toBe(material);
      expect(material.vertexColors).toBe(true);
      expect(material.color).toEqual(baseColor);
      expect(mesh.position.toArray()).toEqual([tile.origin.x, tile.origin.y, tile.origin.z]);
      const position = mesh.geometry.getAttribute("position");
      const normal = mesh.geometry.getAttribute("normal");
      const indices = mesh.geometry.getIndex()!;
      expect(Object.keys(mesh.geometry.attributes).sort()).toEqual(["color", "normal", "position"]);
      expect(mesh.geometry.groups).toHaveLength(0); // One material / draw call per tile.
      expect(position.count).toBe(33 * 33);
      expect(normal.count).toBe(position.count);
      expect(indices.array).toBeInstanceOf(Uint16Array);
      expect(indices.count / 3).toBe(2048);
      for (let x = 0; x <= 32; x++) for (let z = 0; z <= 32; z++) {
        const i = z + x * 33;
        expect([position.getX(i), position.getY(i), position.getZ(i)])
          .toEqual([x * 2, tile.heights[i], z * 2]);
        expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 6);
        expect(normal.getY(i)).toBeGreaterThan(0);
      }
      const a = new Vector3(), b = new Vector3(), c = new Vector3();
      for (let i = 0; i < indices.count; i += 3) {
        a.fromBufferAttribute(position, indices.getX(i));
        b.fromBufferAttribute(position, indices.getX(i + 1));
        c.fromBufferAttribute(position, indices.getX(i + 2));
        expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
      }
    } finally { mesh.geometry.dispose(); material.dispose(); }
  });

  it("matches world positions, normals and colours across X/Z seams and corners", () => {
    const material = new MeshToonMaterial();
    try {
      for (const [ix, iz] of [[-2, -5], [-1, -1], [0, 0], [1, -14]] as const) {
        const mesh = createTileMesh(buildTile(ix, iz), material);
        const east = createTileMesh(buildTile(ix + 1, iz), material);
        const south = createTileMesh(buildTile(ix, iz + 1), material);
        try {
          for (let i = 0; i <= 32; i++) {
            for (const [neighbor, a, b] of [[east, i + 32 * 33, i], [south, 32 + i * 33, i * 33]] as const) {
              const p = new Vector3().fromBufferAttribute(mesh.geometry.getAttribute("position"), a).add(mesh.position);
              const q = new Vector3().fromBufferAttribute(neighbor.geometry.getAttribute("position"), b).add(neighbor.position);
              expect(p.distanceTo(q)).toBe(0);
              for (const attribute of ["normal", "color"]) {
                const n = new Vector3().fromBufferAttribute(mesh.geometry.getAttribute(attribute), a);
                const m = new Vector3().fromBufferAttribute(neighbor.geometry.getAttribute(attribute), b);
                expect(n.distanceTo(m)).toBeLessThan(1e-3);
              }
            }
          }
        } finally { for (const m of [mesh, east, south]) m.geometry.dispose(); }
      }
    } finally { material.dispose(); }
  });

  it("paints 45-degree faces close to palette rock in every slope direction", () => {
    const rock = paletteColor("rock");
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const color = sampleColor(400, -400, 20, dx, dz);
      expect(colorDistance(color, rock)).toBeLessThan(0.08);
      expect(colorDistance(color, rock)).toBeLessThan(colorDistance(color, paletteColor("grass")));
    }
  });

  it("keeps flat meadows on the grass/grassDry palette blend", () => {
    const grass = paletteColor("grass"), dry = paletteColor("grassDry");
    for (const x of [300, 350, 400, 450, 500]) {
      const color = sampleColor(x, -400, 20);
      const t = (color.r - grass.r) / (dry.r - grass.r);
      expect(t).toBeGreaterThanOrEqual(-1e-6);
      expect(t).toBeLessThanOrEqual(1 + 1e-6); // Float32 vertex storage.
      expect(colorDistance(color, grass.clone().lerp(dry, t))).toBeLessThan(1e-6);
    }
  });

  it("adds a small dry-grass bias with elevation and on sun-facing slopes", () => {
    const dry = paletteColor("grassDry");
    expect(colorDistance(sampleColor(400, -400, 45), dry))
      .toBeLessThan(colorDistance(sampleColor(400, -400, 8), dry));
    expect(colorDistance(sampleColor(400, -400, 20, -0.4, 0.3), dry))
      .toBeLessThan(colorDistance(sampleColor(400, -400, 20, 0.4, -0.3), dry));
  });

  it("softly exposes rock above 35 degrees instead of changing colour in one step", () => {
    const rock = sampleColor(400, -400, 20, 1);
    const distances = [35, 38, 41, 45].map(degrees =>
      colorDistance(sampleColor(400, -400, 20, Math.tan(degrees * Math.PI / 180)), rock));
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeLessThan(distances[i - 1]!);
    const below = sampleColor(400, -400, 20, Math.tan(34.99 * Math.PI / 180));
    const above = sampleColor(400, -400, 20, Math.tan(35.01 * Math.PI / 180));
    expect(colorDistance(below, above)).toBeLessThan(0.001);
  });

  it("uses sand with a little rock from 0 to 0.5 m above the sea, and stone on the stream bank", () => {
    const sand = paletteColor("sand"), rock = paletteColor("rock");
    for (const rise of [0, 0.02, 0.3, 0.5]) {
      const color = sampleColor(400, -1000, waterLevelAt(-1000) + rise);
      const t = (color.r - sand.r) / (rock.r - sand.r);
      expect(t).toBeGreaterThan(0.07);
      expect(t).toBeLessThan(0.21);
      expect(colorDistance(color, sand.clone().lerp(rock, t))).toBeLessThan(1e-6);
      expect(colorDistance(color, sand)).toBeLessThan(0.12);
    }
    // Lead fix (batch 25): low meadow far from the stream is NOT sand, even near the river level.
    const meadow = sampleColor(400, -400, waterLevelAt(-400) + 0.6);
    expect(colorDistance(meadow, paletteColor("grass").lerp(paletteColor("grassDry"), 0.5)))
      .toBeLessThan(colorDistance(meadow, sand));
    // On the stream bank the low ground is sandy stone (more rock than on the beach).
    const centre = nearestRiver(0, -400);
    const bank = sampleColor(centre.x + riverWidthAt(centre.t) / 2 + 0.2, centre.z, waterLevelAt(centre.z) + 0.6);
    const tBank = (bank.r - sand.r) / (rock.r - sand.r);
    expect(tBank).toBeGreaterThan(0.25);
    expect(tBank).toBeLessThan(0.5);
    expect(colorDistance(sampleColor(400, -400, 8), sampleColor(400, -400, 8, 0, 0, 5)))
      .toBeLessThan(1e-6);
  });

  it("blends submerged rockDark toward seaDeep with depth (sea only) and joins the waterline continuously", () => {
    const dark = paletteColor("rockDark"), deep = paletteColor("seaDeep");
    for (const z of [-1000]) {
      const water = waterLevelAt(z);
      const shallow = sampleColor(400, z, water - 0.4);
      const bottom = sampleColor(400, z, water - 3);
      for (const color of [shallow, bottom]) {
        const t = (color.r - dark.r) / (deep.r - dark.r);
        expect(t).toBeGreaterThan(0.19);
        expect(t).toBeLessThan(0.66);
        expect(colorDistance(color, dark.clone().lerp(deep, t))).toBeLessThan(1e-6);
      }
      expect(colorDistance(bottom, deep)).toBeLessThan(colorDistance(shallow, deep));
      expect(colorDistance(sampleColor(400, z, water - 0.001), sampleColor(400, z, water + 0.001)))
        .toBeLessThan(0.001);
    }
  });

  it("keeps the forest trail light brown and leaves the coastal road terrain untinted by dirt", () => {
    const dirt = paletteColor("grassDry").lerp(paletteColor("rockDark"), 0.32);
    for (const t of [0.1, 0.3, 0.6, 0.79]) {
      const p = pathPointAt(t);
      expect(colorDistance(sampleColor(p.x, p.z, waterLevelAt(p.z) + 0.4), dirt)).toBeLessThan(1e-6);
    }
    const coast = pathPointAt(0.9);
    expect(colorDistance(sampleColor(coast.x, coast.z, waterLevelAt(coast.z) + 0.4), paletteColor("sand")))
      .toBeLessThan(0.12);
  });

  it("varies meadow luma by at least 0.03 over 200 m with smooth large-scale patches", () => {
    const material = new MeshToonMaterial();
    const tile: TerrainTile = {
      cells: 100, size: 200, origin: { x: 300, y: 0, z: -500 },
      heights: new Float32Array(101 ** 2).fill(20),
    };
    const mesh = createTileMesh(tile, material);
    try {
      const colors = mesh.geometry.getAttribute("color");
      const luminances: number[] = [];
      for (let x = 1; x < 100; x++) for (let z = 1; z < 100; z++) {
        const i = z + x * 101;
        const color = new Color().setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
        luminances.push(luma(color));
        for (const channel of [color.r, color.g, color.b]) {
          expect(channel).toBeGreaterThan(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
        const nextLuma = 0.2126 * colors.getX(i + 1) + 0.7152 * colors.getY(i + 1) + 0.0722 * colors.getZ(i + 1);
        if (z < 99) expect(Math.abs(luma(color) - nextLuma)).toBeLessThan(0.02);
      }
      const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
      const deviation = Math.sqrt(luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminances.length);
      expect(deviation).toBeGreaterThanOrEqual(0.03);
    } finally { mesh.geometry.dispose(); material.dispose(); }
  });

  it("rebuilds identical vertex colours without modifying heights or using random state", () => {
    const tile = buildTile(-2, -5);
    const heights = tile.heights.slice();
    const material = new MeshToonMaterial();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    const meshes: ReturnType<typeof createTileMesh>[] = [];
    try {
      meshes.push(createTileMesh(tile, material));
      // Three.js uses random UUIDs; colour must stay identical even when that random state changes.
      random.mockReturnValue(0.9);
      meshes.push(createTileMesh(buildTile(0, -15), material), createTileMesh(tile, material));
      expect(meshes[0]!.geometry.getAttribute("color").array).toEqual(meshes[2]!.geometry.getAttribute("color").array);
      expect(tile.heights).toEqual(heights);
    } finally { random.mockRestore(); for (const mesh of meshes) mesh.geometry.dispose(); material.dispose(); }
  });
});

describe("terrain tile colliders", () => {
  it("passes the identical heights array and correct scale/centre to mock Rapier", () => {
    const { rapier, world, descriptor, heightfield } = physicsMock();
    const tile = { ...buildTile(-2, -5), origin: { x: -128, y: 7, z: -320 } };
    const collider = createTileCollider(rapier, world, tile);
    expect(heightfield).toHaveBeenCalledWith(32, 32, tile.heights, { x: 64, y: 1, z: 64 });
    expect(heightfield.mock.calls[0]![2]).toBe(tile.heights);
    expect(descriptor.setTranslation).toHaveBeenCalledWith(-96, 7, -288);
    expect(world.createCollider).toHaveBeenCalledWith(descriptor);
    removeTileCollider(world, collider);
    expect(world.removeCollider).toHaveBeenCalledWith(collider, true);
  });

  it("matches actual Rapier ray heights inside nonplanar cells at a translated origin", async () => {
    await RAPIER.init();
    const tile: TerrainTile = {
      cells: 2, size: 8, origin: { x: -64, y: 7, z: -320 },
      heights: new Float32Array([0, 1, 0, 2, 0, 3, 1, 4, 2]),
    };
    const material = new MeshToonMaterial();
    const mesh = createTileMesh(tile, material);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      const collider = createTileCollider(RAPIER, world, tile);
      world.step();
      expect(collider.heightfieldHeights()).toEqual(tile.heights);
      for (const [x, z] of [[0.7, 0.9], [3.2, 2.8], [5.3, 1.7], [6.8, 7.1]]) {
        const origin = new Vector3(tile.origin.x + x!, 30, tile.origin.z + z!);
        const meshHit = new Raycaster(origin, new Vector3(0, -1, 0)).intersectObject(mesh)[0]!;
        const hit = world.castRay(new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 }), 50, true);
        expect(hit).not.toBeNull();
        expect(Math.abs(30 - hit!.timeOfImpact - meshHit.point.y)).toBeLessThan(1e-4);
      }
      removeTileCollider(world, collider);
    } finally { world.free(); mesh.geometry.dispose(); material.dispose(); }
  });
});

describe("terrain tile pool", () => {
  it("reuses residents and releases every obsolete geometry/collider through repeated trips", () => {
    const { rapier, world, heightfield } = physicsMock();
    const material = new MeshToonMaterial();
    const disposeMaterial = vi.spyOn(material, "dispose");
    const pool = createTilePool({ RAPIER: rapier, world, material });
    const scene = new Scene();
    scene.add(pool.group);
    const tracked: { key: string; geometry: BufferGeometry; disposed: ReturnType<typeof vi.spyOn>; mesh: ReturnType<typeof createTileMesh> }[] = [];
    try {
      for (const t of [0, 0, 0.8, 0.2, 1, 0]) {
        const before = new Map(pool.tiles);
        pool.update(t);
        const desired = new Set(tilesToLoad(t).map(a => tileKey(a.ix, a.iz)));
        expect(new Set(pool.tiles.keys())).toEqual(desired);
        expect(pool.group.children).toHaveLength(desired.size);
        for (const [key, resident] of pool.tiles) {
          expect(resident.mesh.material).toBe(material);
          if (before.has(key)) expect(resident).toBe(before.get(key));
          else {
            expect(heightfield.mock.calls.some(call => call[2] === resident.tile.heights)).toBe(true);
            tracked.push({ key, geometry: resident.mesh.geometry, disposed: vi.spyOn(resident.mesh.geometry, "dispose"), mesh: resident.mesh });
          }
        }
        for (const entry of tracked) {
          const active = pool.tiles.get(entry.key)?.mesh.geometry === entry.geometry;
          expect(entry.disposed).toHaveBeenCalledTimes(active ? 0 : 1);
          expect(entry.mesh.parent).toBe(active ? pool.group : null);
        }
      }
      pool.dispose();
      pool.dispose();
      expect(pool.tiles.size).toBe(0);
      expect(pool.group.children).toHaveLength(0);
      expect(pool.group.parent).toBeNull();
      expect(world.removeCollider).toHaveBeenCalledTimes(world.createCollider.mock.calls.length);
      for (const entry of tracked) expect(entry.disposed).toHaveBeenCalledTimes(1);
      expect(disposeMaterial).not.toHaveBeenCalled();
      expect(() => pool.update(0)).toThrow(/disposed/);
    } finally { pool.dispose(); disposeMaterial.mockRestore(); material.dispose(); }
  });

  it("disposes newly allocated geometry if collider creation fails", () => {
    const { rapier, world } = physicsMock();
    const material = new MeshToonMaterial();
    const pool = createTilePool({ RAPIER: rapier, world, material });
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    try {
      world.createCollider.mockImplementationOnce(() => { throw new Error("physics failure"); });
      expect(() => pool.update(0)).toThrow("physics failure");
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(pool.tiles.size).toBe(0);
      expect(pool.group.children).toHaveLength(0);
      pool.update(0);
      expect(pool.tiles.size).toBeGreaterThan(0);
      const snapshot = new Map(pool.tiles);
      expect(() => pool.update(NaN)).toThrow(RangeError);
      expect(new Map(pool.tiles)).toEqual(snapshot);
    } finally { pool.dispose(); dispose.mockRestore(); material.dispose(); }
  });
});
