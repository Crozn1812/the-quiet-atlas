import RAPIER from "@dimforge/rapier3d-compat";
import { BufferGeometry, MeshToonMaterial, Raycaster, Scene, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createTileCollider, removeTileCollider, type TileRapier } from "../../../src/features/world/terrain/collider";
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

  it("uses a subtle valley wash on high ground and warm palette sand on the low coast", () => {
    const material = new MeshToonMaterial();
    const forest = createTileMesh(buildTile(0, -4), material);
    const coast = createTileMesh(buildTile(0, -15), material);
    try {
      for (const mesh of [forest, coast]) {
        const colors = mesh.geometry.getAttribute("color");
        expect(colors.count).toBe(1089);
        for (const channel of colors.array) {
          expect(Number.isFinite(channel)).toBe(true);
          expect(channel).toBeGreaterThan(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
      const greens = forest.geometry.getAttribute("color");
      expect(new Set(greens.array).size).toBeGreaterThan(10);
      const sand = coast.geometry.getAttribute("color");
      expect(sand.getX(0)).toBeGreaterThan(sand.getY(0));
      expect(sand.getY(0)).toBeGreaterThan(sand.getZ(0));
      expect(sand.getZ(0)).toBeLessThan(greens.getZ(0)); // sand is warmer than the valley wash
    } finally { forest.geometry.dispose(); coast.geometry.dispose(); material.dispose(); }
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
