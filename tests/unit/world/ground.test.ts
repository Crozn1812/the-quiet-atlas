import { Group, InstancedMesh, Matrix4, MeshToonMaterial, Vector3, type BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import { createGrassTuft, createGroundDetails, createRock, GRASS_VARIANT_SEEDS, GROUND_LIMITS, GROUND_MIN_HEIGHT, GROUND_RADIUS, ROCK_VARIANT_SEEDS, scatterGround, type GroundDetail } from "../../../src/features/world/foliage/ground";
import { foliageBiomeAt, scatterTile } from "../../../src/features/world/foliage/scatter";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import type { Quality } from "../../../src/features/world/terrain";
import { PATH_WIDTH, waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";
import { buildTile, TILE_SIZE, tilesAlongPath } from "../../../src/features/world/terrain/tiles";

const route = tilesAlongPath();
const scattered = route.map(tile => scatterGround(tile));
const details = scattered.flat();
const meshesOf = (ground: ReturnType<typeof createGroundDetails>) => ground.group.children as InstancedMesh<BufferGeometry, MeshToonMaterial>[];
const countKind = (meshes: ReturnType<typeof meshesOf>, kind: GroundDetail["kind"]) =>
  meshes.filter(mesh => mesh.name.startsWith(kind)).reduce((sum, mesh) => sum + mesh.count, 0);

function snapshot(meshes: ReturnType<typeof meshesOf>) {
  const matrix = new Matrix4();
  return meshes.map(mesh => Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, matrix);
    return [...matrix.elements];
  }));
}

describe("ground shapes", () => {
  it("has three distinct seeded tufts, 5–9 curved flat blades and dark roots/light tips within 40 triangles", () => {
    const signatures = new Set<string>();
    for (const seed of GRASS_VARIANT_SEEDS) {
      const geometry = createGrassTuft(seed), repeated = createGrassTuft(seed);
      try {
        const positions = geometry.getAttribute("position"), colors = geometry.getAttribute("color");
        expect(positions.array).toEqual(repeated.getAttribute("position").array);
        signatures.add(JSON.stringify([...positions.array]));
        const blades = positions.count / 5;
        expect(blades).toBeGreaterThanOrEqual(5);
        expect(blades).toBeLessThanOrEqual(9);
        expect(geometry.index!.count / 3).toBe(blades * 3);
        expect(geometry.index!.count / 3).toBeLessThanOrEqual(40);
        for (let i = 0; i < positions.count; i += 5) {
          const root = new Vector3((positions.getX(i) + positions.getX(i + 1)) / 2, 0,
            (positions.getZ(i) + positions.getZ(i + 1)) / 2);
          const mid = new Vector3((positions.getX(i + 2) + positions.getX(i + 3)) / 2, positions.getY(i + 2),
            (positions.getZ(i + 2) + positions.getZ(i + 3)) / 2);
          const tip = new Vector3().fromBufferAttribute(positions, i + 4);
          expect(root.y).toBe(0);
          expect(mid.y).toBeGreaterThan(0);
          expect(tip.y).toBeGreaterThan(mid.y);
          expect(mid.distanceTo(root.clone().lerp(tip, 0.55))).toBeGreaterThan(0.02);
          for (let channel = 0; channel < 3; channel++) {
            expect(colors.getComponent(i, channel)).toBeLessThan(colors.getComponent(i + 2, channel));
            expect(colors.getComponent(i + 2, channel)).toBeLessThan(colors.getComponent(i + 4, channel));
          }
        }
        for (let i = 0; i < positions.count; i++) {
          expect(Math.hypot(positions.getX(i), positions.getZ(i)) * 1.1).toBeLessThan(GROUND_RADIUS);
        }
      } finally { geometry.dispose(); repeated.dispose(); }
    }
    expect(signatures.size).toBe(3);
  });

  it("has two deterministic flattened low-poly rocks within 60 triangles and the placement radius", () => {
    const signatures = new Set<string>();
    for (const seed of ROCK_VARIANT_SEEDS) {
      const geometry = createRock(seed), repeated = createRock(seed);
      try {
        const positions = geometry.getAttribute("position");
        expect(positions.array).toEqual(repeated.getAttribute("position").array);
        signatures.add(JSON.stringify([...positions.array]));
        expect((geometry.index?.count ?? positions.count) / 3).toBeLessThanOrEqual(60);
        const size = geometry.boundingBox!.getSize(new Vector3());
        expect(size.y).toBeLessThan(size.x * 0.7);
        expect(geometry.boundingBox!.min.y).toBeLessThan(0);
        expect(geometry.boundingBox!.max.y).toBeGreaterThan(0);
        for (let i = 0; i < positions.count; i++) {
          expect(Math.hypot(positions.getX(i), positions.getZ(i)) * 1.1).toBeLessThan(GROUND_RADIUS);
        }
      } finally { geometry.dispose(); repeated.dispose(); }
    }
    expect(signatures.size).toBe(2);
  });
});

describe("ground scatter", () => {
  it("is deterministic across tile representations, call order and a separate tree seed", () => {
    for (let i = route.length - 1; i >= 0; i -= 9) {
      const tile = route[i]!;
      expect(scatterGround(tile)).toEqual(scattered[i]);
      expect(scatterGround(buildTile(tile.ix, tile.iz))).toEqual(scattered[i]);
      const trees = new Set(scatterTile(tile).map(tree => `${tree.x}:${tree.z}`));
      for (const item of scattered[i]!) expect(trees.has(`${item.x}:${item.z}`)).toBe(false);
    }
    expect(() => scatterGround({ ix: 0.5, iz: 0 })).toThrow(RangeError);
    expect(() => scatterGround({ ...buildTile(0, 0), size: 32 })).toThrow(RangeError);
  });

  it("keeps the full footprint off the 3 m path, water and sand throughout the route", () => {
    // A denser independent curve sample checks the path, including bridges.
    const path = Array.from({ length: 8193 }, (_, i) => pathPointAt(i / 8192));
    expect(details.filter(item => item.kind === "grass").length).toBeGreaterThan(500);
    expect(details.filter(item => item.kind === "rock").length).toBeGreaterThan(50);
    for (let tileIndex = 0; tileIndex < route.length; tileIndex++) {
      const tile = route[tileIndex]!;
      for (const item of scattered[tileIndex]!) {
        expect(item.x).toBeGreaterThanOrEqual(tile.ix * TILE_SIZE);
        expect(item.x).toBeLessThan((tile.ix + 1) * TILE_SIZE);
        expect(item.z).toBeGreaterThanOrEqual(tile.iz * TILE_SIZE);
        expect(item.z).toBeLessThan((tile.iz + 1) * TILE_SIZE);
        const distanceSquared = path.reduce((best, p) => Math.min(best, (item.x - p.x) ** 2 + (item.z - p.z) ** 2), Infinity);
        expect(Math.sqrt(distanceSquared)).toBeGreaterThanOrEqual(PATH_WIDTH / 2 + GROUND_RADIUS);
        expect(item.y).toBeGreaterThanOrEqual(GROUND_MIN_HEIGHT);
        expect(item.y).toBeGreaterThan(waterLevelAt(item.z));
        for (let i = -1; i < 8; i++) {
          const x = item.x + (i < 0 ? 0 : Math.cos(i * Math.PI / 4) * GROUND_RADIUS);
          const z = item.z + (i < 0 ? 0 : Math.sin(i * Math.PI / 4) * GROUND_RADIUS);
          expect(worldHeight(x, z)).toBeGreaterThanOrEqual(GROUND_MIN_HEIGHT);
          expect(worldHeight(x, z)).toBeGreaterThan(waterLevelAt(z));
        }
      }
    }
  });

  it("favours banks/verges over open hills and concentrates sparse rocks near banks/Old Trail", () => {
    const oldTrail = ZONES.find(zone => zone.id === "old-trail")!;
    const grass = { bank: 0, verge: 0, hill: 0 }, area = { bank: 0, verge: 0, hill: 0 };
    const rocks = { preferred: 0, other: 0 }, rockArea = { preferred: 0, other: 0 };
    const classify = (x: number, z: number) => {
      const bank = nearestRiver(x, z).distance;
      const path = nearestPath(x, z).distance;
      return bank >= 7 && bank < 14 ? "bank" : path >= 3 && path < 7 ? "verge"
        : bank > 24 && path > 14 && foliageBiomeAt(x, z) === "hill" ? "hill" : undefined;
    };
    const rockClass = (x: number, z: number) => nearestRiver(x, z).distance < 16
      || Math.hypot(x - oldTrail.position.x, z - oldTrail.position.z) < 40 ? "preferred" : "other";
    for (const tile of route) for (let dx = 1; dx < TILE_SIZE; dx += 4) for (let dz = 1; dz < TILE_SIZE; dz += 4) {
      const x = tile.ix * TILE_SIZE + dx, z = tile.iz * TILE_SIZE + dz;
      if (worldHeight(x, z) < GROUND_MIN_HEIGHT || worldHeight(x, z) <= waterLevelAt(z)
        || nearestPath(x, z).distance < PATH_WIDTH / 2 + GROUND_RADIUS) continue;
      const category = classify(x, z);
      if (category) area[category]++;
      rockArea[rockClass(x, z)]++;
    }
    for (const item of details) {
      if (item.kind === "rock") rocks[rockClass(item.x, item.z)]++;
      else {
        const category = classify(item.x, item.z);
        if (category) grass[category]++;
      }
    }
    expect(grass.bank / area.bank).toBeGreaterThan(grass.hill / area.hill * 2);
    expect(grass.verge / area.verge).toBeGreaterThan(grass.hill / area.hill * 2);
    expect(rocks.preferred / rockArea.preferred).toBeGreaterThan(rocks.other / rockArea.other * 2);
    expect(details.filter(item => item.kind === "rock").length).toBeLessThan(details.length * 0.15);
  });
});

describe("ground instancing", () => {
  it("applies exact per-tile quality counts, stable nested subsets and at most five draws with one shared ramp", () => {
    const ground = createGroundDetails(details.length);
    const meshes = meshesOf(ground);
    try {
      ground.setTiles(details);
      expect(meshes).toHaveLength(5);
      expect(new Set(meshes.map(mesh => mesh.material)).size).toBe(1);
      for (const mesh of meshes) {
        expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
        expect(mesh.material.gradientMap).toBeTruthy();
        expect(mesh.material.vertexColors).toBe(true);
        expect(mesh.material.transparent).toBe(false);
        expect(mesh.geometry.groups).toHaveLength(0);
        expect(mesh.castShadow).toBe(false);
      }
      const high = snapshot(meshes);
      const highMatrices = high.map(items => new Set(items.map(matrix => JSON.stringify(matrix))));
      for (const quality of ["Balanced", "Low", "High"] as Quality[]) {
        ground.setQuality(quality);
        for (const kind of ["grass", "rock"] as const) {
          const expected = scattered.reduce((sum, items) => sum + Math.round(items.filter(item => item.kind === kind).length
            * GROUND_LIMITS[quality][kind] / GROUND_LIMITS.High[kind]), 0);
          expect(countKind(meshes, kind)).toBe(expected);
        }
        expect(meshes.filter(mesh => mesh.visible).length).toBeLessThanOrEqual(5);
        const selected = snapshot(meshes);
        for (let i = 0; i < selected.length; i++) for (const matrix of selected[i]!) expect(highMatrices[i]!.has(JSON.stringify(matrix))).toBe(true);
        ground.setTiles([...details].reverse());
        expect(snapshot(meshes)).toEqual(selected);
        if (quality === "Low") {
          expect(countKind(meshes, "grass")).toBe(0);
          expect(countKind(meshes, "rock")).toBeGreaterThan(0);
          expect(meshes.slice(0, 3).every(mesh => !mesh.visible)).toBe(true);
        }
      }
      expect(snapshot(meshes)).toEqual(high);
      const matrix = new Matrix4();
      const expected = new Set(details.map(item => `${Math.fround(item.x)},${Math.fround(item.y)},${Math.fround(item.z)}`));
      for (const mesh of meshes) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        const position = new Vector3().setFromMatrixPosition(matrix);
        expect(expected.has(`${position.x},${position.y},${position.z}`)).toBe(true);
        expect(mesh.boundingBox!.containsPoint(position)).toBe(true);
      }
      ground.setTiles(details.slice(0, 20)); // Streaming unload replaces all previous tiles.
      expect(meshes.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(20);
      ground.setTiles([]);
      expect(meshes.every(mesh => mesh.count === 0 && !mesh.visible)).toBe(true);
    } finally { ground.dispose(); }
  });

  it("caps each tile independently, including oversized caller input", () => {
    const fixture = details[0]!;
    const items: GroundDetail[] = [0, 1].flatMap(ix => (["grass", "rock"] as const).flatMap(kind =>
      Array.from({ length: GROUND_LIMITS.High[kind] + 10 }, (_, i) => ({ ...fixture, kind, variant: 0,
        x: ix * TILE_SIZE + 1 + i * 0.001, z: 1 }))));
    const ground = createGroundDetails(items.length);
    try {
      ground.setTiles(items);
      for (const quality of ["High", "Balanced", "Low"] as Quality[]) {
        ground.setQuality(quality);
        for (const kind of ["grass", "rock"] as const) {
          expect(countKind(meshesOf(ground), kind)).toBe(GROUND_LIMITS[quality][kind] * 2);
        }
      }
    } finally { ground.dispose(); }
  });

  it("rejects invalid inputs atomically, copies caller data and releases owned resources exactly once", () => {
    expect(() => createGroundDetails(-1)).toThrow(RangeError);
    expect(() => createGroundDetails(0.5)).toThrow(RangeError);
    const ground = createGroundDetails(1), parent = new Group();
    const item = { ...details[0]! };
    parent.add(ground.group);
    ground.setTiles([item]);
    const meshes = meshesOf(ground), original = snapshot(meshes);
    expect(() => ground.setTiles([item, item])).toThrow(RangeError);
    for (const invalid of [{ ...item, x: NaN }, { ...item, variant: 3 }, { ...item, scale: 0 }]) {
      expect(() => ground.setTiles([invalid])).toThrow(RangeError);
      expect(snapshot(meshes)).toEqual(original);
    }
    item.x += 10;
    ground.setQuality("High");
    expect(snapshot(meshes)).toEqual(original);
    const spies = meshes.flatMap(mesh => [vi.spyOn(mesh, "dispose"), vi.spyOn(mesh.geometry, "dispose")]);
    const material = vi.spyOn(meshes[0]!.material, "dispose");
    const gradient = vi.spyOn(meshes[0]!.material.gradientMap!, "dispose");
    ground.dispose(); ground.dispose();
    for (const spy of [...spies, material]) expect(spy).toHaveBeenCalledTimes(1);
    expect(gradient).not.toHaveBeenCalled();
    gradient.mockRestore();
    expect(ground.group.children).toHaveLength(0);
    expect(parent.children).toHaveLength(0);
    expect(meshes.every(mesh => mesh.count === 0)).toBe(true);
    expect(() => ground.setTiles([])).toThrow(/disposed/);
    expect(() => ground.setQuality("Low")).toThrow(/disposed/);
    const empty = createGroundDetails(0);
    empty.setTiles([]); empty.setQuality("Low"); empty.dispose();
  });
});
