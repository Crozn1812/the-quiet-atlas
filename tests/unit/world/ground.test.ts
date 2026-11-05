import { Color, Group, InstancedMesh, Matrix4, MeshToonMaterial, Vector3, type BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createBroadleafBush, createFern, createGrassTuft, createGroundDetails, createRock, GRASS_VARIANT_SEEDS,
  groundRadius, GROUND_LIMITS, GROUND_MIN_HEIGHT, GROUND_RADIUS, GROUND_TRIANGLE_LIMIT, ROCK_VARIANT_SEEDS,
  scatterGround, type GroundDetail,
} from "../../../src/features/world/foliage/ground";
import { foliageBiomeAt, PATH_CLEARANCE, ZONE_CLEARANCE } from "../../../src/features/world/foliage/scatter";
import { PALETTE } from "../../../src/features/world/art/palette";
import { PATH_BRIDGES, pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import type { Quality } from "../../../src/features/world/terrain";
import { PATH_WIDTH, waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";
import { buildTile, TILE_SIZE, tilesAlongPath } from "../../../src/features/world/terrain/tiles";

const route = tilesAlongPath(64);
const scattered = route.map(tile => scatterGround(tile));
const details = scattered.flat();
const kinds = Object.keys(GROUND_LIMITS.High) as GroundDetail["kind"][];
const meshesOf = (ground: ReturnType<typeof createGroundDetails>) => ground.group.children as InstancedMesh<BufferGeometry, MeshToonMaterial>[];
const triangleCount = (geometry: BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
const renderedTriangles = (meshes: ReturnType<typeof meshesOf>) => meshes.reduce((sum, mesh) => sum + mesh.count * triangleCount(mesh.geometry), 0);

function snapshot(meshes: ReturnType<typeof meshesOf>) {
  const matrix = new Matrix4();
  return meshes.map(mesh => Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, matrix);
    return [...matrix.elements];
  }));
}

// Independent interpolation from the public rendered tile heights.
function renderedHeight(x: number, z: number): number {
  const x0 = Math.floor(x / 2) * 2, z0 = Math.floor(z / 2) * 2;
  const u = (x - x0) / 2, v = (z - z0) / 2;
  const a = Math.fround(worldHeight(x0, z0)), b = Math.fround(worldHeight(x0 + 2, z0));
  const c = Math.fround(worldHeight(x0, z0 + 2)), d = Math.fround(worldHeight(x0 + 2, z0 + 2));
  return u + v <= 1 ? a * (1 - u - v) + b * u + c * v : b * (1 - v) + c * (1 - u) + d * (u + v - 1);
}

function expectRecipe(actual: Color, a: Color, b: Color) {
  const delta = [b.r - a.r, b.g - a.g, b.b - a.b];
  const channels = [actual.r - a.r, actual.g - a.g, actual.b - a.b];
  const t = channels.reduce((sum, value, i) => sum + value * delta[i]!, 0) / delta.reduce((sum, value) => sum + value * value, 0);
  expect(t).toBeGreaterThanOrEqual(-0.00001);
  expect(t).toBeLessThanOrEqual(1.00001);
  const expected = a.clone().lerp(b, t);
  expect(actual.r).toBeCloseTo(expected.r, 5);
  expect(actual.g).toBeCloseTo(expected.g, 5);
  expect(actual.b).toBeCloseTo(expected.b, 5);
}

describe("ground shapes", () => {
  it("retains distinct seeded curved grass and weathered, partly buried solids within their radius", () => {
    for (const [seeds, factory, budget] of [[GRASS_VARIANT_SEEDS, createGrassTuft, 27], [ROCK_VARIANT_SEEDS, createRock, 24]] as const) {
      const signatures = new Set<string>();
      for (const seed of seeds) {
        const geometry = factory(seed), repeated = factory(seed);
        try {
          const positions = geometry.getAttribute("position");
          expect(positions.array).toEqual(repeated.getAttribute("position").array);
          signatures.add(JSON.stringify([...positions.array]));
          expect(triangleCount(geometry)).toBeLessThanOrEqual(budget);
          for (let i = 0; i < positions.count; i++) {
            expect(Math.hypot(positions.getX(i), positions.getZ(i)) * 1.1).toBeLessThan(GROUND_RADIUS);
          }
          if (factory === createRock) {
            expect(geometry.boundingBox!.min.y).toBeLessThan(0);
            expect(geometry.boundingBox!.max.y).toBeGreaterThan(0);
          } else {
            expect(positions.count / 5).toBeGreaterThanOrEqual(5);
            expect(positions.count / 5).toBeLessThanOrEqual(9);
          }
        } finally { geometry.dispose(); repeated.dispose(); }
      }
      expect(signatures.size).toBe(seeds.length);
    }
  });

  it("builds splayed pinnate ferns and broad folded bush leaves with the requested metre envelope", () => {
    for (const [factory, triangles, low, high] of [[createFern, 40, 0.4, 1], [createBroadleafBush, 24, 0.6, 1.4]] as const) {
      const geometry = factory(), repeated = factory();
      try {
        expect(geometry.getAttribute("position").array).toEqual(repeated.getAttribute("position").array);
        expect(triangleCount(geometry)).toBe(triangles);
        expect(geometry.boundingBox!.min.y).toBe(0);
        expect(geometry.boundingBox!.max.y * low).toBeCloseTo(low);
        expect(geometry.boundingBox!.max.y * high).toBeCloseTo(high);
        const p = geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) expect(Math.hypot(p.getX(i), p.getZ(i)) * high).toBeLessThan(GROUND_RADIUS);
        // Leaf fans/fronds reach all four quadrants rather than forming a vertical billboard.
        expect(geometry.boundingBox!.min.x).toBeLessThan(-0.3);
        expect(geometry.boundingBox!.max.z).toBeGreaterThan(0.3);
      } finally { geometry.dispose(); repeated.dispose(); }
    }
  });

  it("uses only palette foliage recipes and gray roots/green moss tops, without paper tint", () => {
    const deep = new Color(PALETTE.forestDeep), light = new Color(PALETTE.forestLight), grass = new Color(PALETTE.grass);
    for (const factory of [createFern, createBroadleafBush, createGrassTuft, createRock]) {
      const geometry = factory();
      try {
        const colors = geometry.getAttribute("color"), positions = geometry.getAttribute("position");
        const base = new Color(PALETTE.rockDark), moss = grass.clone().lerp(deep, 0.35);
        for (let i = 0; i < colors.count; i++) {
          const color = new Color().fromBufferAttribute(colors, i);
          if (factory === createRock) {
            expectRecipe(color, base, moss);
            if (positions.getY(i) < 0) expect(color.toArray()).toEqual(expect.arrayContaining(base.toArray().map(value => expect.closeTo(value, 5))));
          } else if (factory === createGrassTuft) expectRecipe(color, deep, light.clone().lerp(grass, 0.3));
          else if (factory === createBroadleafBush && Math.floor(i / 5) % 2) expectRecipe(color, deep, grass);
          else expectRecipe(color, deep, light);
        }
      } finally { geometry.dispose(); }
    }
  });
});

describe("ground scatter", () => {
  it("is deterministic across tile forms and invocation order, with no runtime random source", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("unseeded random"); });
    try {
      for (let i = route.length - 1; i >= 0; i -= 13) {
        const tile = route[i]!;
        expect(scatterGround(tile)).toEqual(scattered[i]);
        expect(scatterGround(buildTile(tile.ix, tile.iz))).toEqual(scattered[i]);
      }
    } finally { random.mockRestore(); }
    expect(() => scatterGround({ ix: 0.5, iz: 0 })).toThrow(RangeError);
    expect(() => scatterGround({ ...buildTile(0, 0), size: 32 })).toThrow(RangeError);
  });

  it("keeps complete hard footprints outside PATH_CLEARANCE and every detail off zone pads, bridges and water", () => {
    for (const kind of kinds) expect(details.some(item => item.kind === kind), kind).toBe(true);
    for (let index = 0; index < route.length; index++) {
      const tile = route[index]!, items = scattered[index]!;
      for (const kind of kinds) expect(items.filter(item => item.kind === kind).length).toBeLessThanOrEqual(GROUND_LIMITS.High[kind]);
      for (const item of items) {
        const path = nearestPath(item.x, item.z), radius = groundRadius(item.kind);
        expect(item.x).toBeGreaterThanOrEqual(tile.ix * TILE_SIZE);
        expect(item.x).toBeLessThan((tile.ix + 1) * TILE_SIZE);
        expect(item.z).toBeGreaterThanOrEqual(tile.iz * TILE_SIZE);
        expect(item.z).toBeLessThan((tile.iz + 1) * TILE_SIZE);
        if (item.kind === "rock" || item.kind === "log") expect(path.distance - radius).toBeGreaterThanOrEqual(PATH_CLEARANCE);
        else if (item.kind !== "leaf") expect(path.distance - radius).toBeGreaterThanOrEqual(PATH_WIDTH / 2);
        for (const zone of ZONES) expect(Math.hypot(item.x - zone.position.x, item.z - zone.position.z) - radius).toBeGreaterThanOrEqual(zone.radius + ZONE_CLEARANCE);
        expect(PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < 6 + radius)).toBe(false);
        expect(item.y - renderedHeight(item.x, item.z)).toBeCloseTo(item.kind === "leaf" ? 0.018 : 0, 6);
        for (let i = -1; i < 8; i++) {
          const x = item.x + (i < 0 ? 0 : Math.cos(i * Math.PI / 4) * radius);
          const z = item.z + (i < 0 ? 0 : Math.sin(i * Math.PI / 4) * radius);
          expect(worldHeight(x, z)).toBeGreaterThanOrEqual(GROUND_MIN_HEIGHT);
          expect(renderedHeight(x, z)).toBeGreaterThan(waterLevelAt(z));
        }
        if (item.kind === "fern" || item.kind === "bush" || item.kind === "log" || item.kind === "leaf") expect(foliageBiomeAt(item.x, item.z)).toBe("forest-dawn");
        if (item.kind === "fern") { expect(item.scale).toBeGreaterThanOrEqual(0.4); expect(item.scale).toBeLessThanOrEqual(1); }
        if (item.kind === "bush") { expect(item.scale).toBeGreaterThanOrEqual(0.6); expect(item.scale).toBeLessThanOrEqual(1.4); }
        if (item.kind === "leaf") expect(path.distance + radius).toBeLessThanOrEqual(1.6);
      }
    }
    expect(details.filter(item => item.kind === "log").length).toBeLessThan(details.filter(item => item.kind === "rock").length * 0.3);
  });

  it("has at least triple fern AND bush density in 2.5–8 m versus 30–60 m, on both sides, before and after batching", () => {
    const area = { left: { near: 0, far: 0 }, right: { near: 0, far: 0 } };
    const classify = (x: number, z: number) => {
      if (foliageBiomeAt(x, z) !== "forest-dawn") return;
      const path = nearestPath(x, z);
      const band = path.distance >= 2.5 && path.distance <= 8 ? "near" : path.distance >= 30 && path.distance <= 60 ? "far" : undefined;
      if (!band) return;
      const a = pathPointAt(Math.max(0, path.t - 0.0001)), b = pathPointAt(Math.min(1, path.t + 0.0001));
      const side = (x - path.x) * (a.z - b.z) + (z - path.z) * (b.x - a.x) >= 0 ? "right" : "left";
      return { side, band } as const;
    };
    for (const tile of route) for (let dx = 2; dx < TILE_SIZE; dx += 4) for (let dz = 2; dz < TILE_SIZE; dz += 4) {
      const x = tile.ix * TILE_SIZE + dx, z = tile.iz * TILE_SIZE + dz, category = classify(x, z);
      if (category) area[category.side][category.band] += 16;
    }
    const ground = createGroundDetails(details.length);
    try {
      ground.setTiles(details);
      for (const kind of ["fern", "bush"] as const) {
        const mesh = meshesOf(ground).find(mesh => mesh.name === `ground-${kind}`)!;
        const matrix = new Matrix4();
        const rendered = Array.from({ length: mesh.count }, (_, i) => {
          mesh.getMatrixAt(i, matrix);
          return new Vector3().setFromMatrixPosition(matrix);
        });
        for (const points of [details.filter(item => item.kind === kind), rendered]) {
          const count = { left: { near: 0, far: 0 }, right: { near: 0, far: 0 } };
          for (const item of points) {
            const category = classify(item.x, item.z);
            if (category) count[category.side][category.band]++;
          }
          for (const side of ["left", "right"] as const) {
            expect(area[side].far).toBeGreaterThan(0);
            expect(count[side].far).toBeGreaterThan(0);
            const ratio = (count[side].near / area[side].near) / (count[side].far / area[side].far);
            expect(ratio, `${kind} ${side}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    } finally { ground.dispose(); }
  });
});

describe("ground instancing", () => {
  it("uses four opaque single-pass instance batches and <=40,000 triangles even for the entire route", () => {
    const ground = createGroundDetails(details.length);
    try {
      const meshes = meshesOf(ground);
      expect(meshes).toHaveLength(4);
      expect(meshes.every(mesh => !mesh.visible)).toBe(true);
      ground.setTiles(details);
      expect(new Set(meshes.map(mesh => mesh.material)).size).toBe(1);
      expect(meshes.every(mesh => mesh.count > 0)).toBe(true);
      for (const mesh of meshes) {
        expect(mesh).toBeInstanceOf(InstancedMesh);
        expect(mesh.material).toBeInstanceOf(MeshToonMaterial);
        expect(mesh.material.gradientMap).toBeTruthy();
        expect(mesh.material.vertexColors).toBe(true);
        expect(mesh.material.transparent).toBe(false);
        expect(mesh.geometry.groups).toHaveLength(0);
        expect(mesh.castShadow).toBe(false);
        expect(mesh.receiveShadow).toBe(false);
      }
      const high = snapshot(meshes);
      const sets = high.map(items => new Set(items.map(matrix => JSON.stringify(matrix))));
      for (const quality of ["Balanced", "Low", "High"] as Quality[]) {
        ground.setQuality(quality);
        expect(renderedTriangles(meshes)).toBeLessThanOrEqual(GROUND_TRIANGLE_LIMIT);
        const selected = snapshot(meshes);
        for (let i = 0; i < selected.length; i++) for (const matrix of selected[i]!) expect(sets[i]!.has(JSON.stringify(matrix))).toBe(true);
        ground.setTiles([...details].reverse());
        expect(snapshot(meshes)).toEqual(selected);
      }
      expect(snapshot(meshes)).toEqual(high);
      expect(renderedTriangles(meshes)).toBeGreaterThan(39_950);
      ground.setTiles([]);
      expect(meshes.every(mesh => mesh.count === 0 && !mesh.visible)).toBe(true);
    } finally { ground.dispose(); }
  });

  it("renders thin palette-colored leaf decals within the path, seated on the real triangle surface", () => {
    const leaves = details.filter(item => item.kind === "leaf");
    expect(leaves.length).toBeGreaterThan(20);
    const ground = createGroundDetails(leaves.length);
    try {
      ground.setTiles(leaves);
      const mesh = meshesOf(ground)[3]!, matrix = new Matrix4(), vertex = new Vector3(), color = new Color();
      const p = mesh.geometry.getAttribute("position");
      const tint = new Color(PALETTE.grassDry).lerp(new Color(PALETTE.flower), 0.03);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        mesh.getColorAt(i, color);
        expect(color.r).toBeCloseTo(tint.r, 6); expect(color.g).toBeCloseTo(tint.g, 6); expect(color.b).toBeCloseTo(tint.b, 6);
        for (let j = 0; j < p.count; j++) {
          vertex.fromBufferAttribute(p, j).applyMatrix4(matrix);
          expect(nearestPath(vertex.x, vertex.z).distance).toBeLessThanOrEqual(1.6);
          const offset = vertex.y - renderedHeight(vertex.x, vertex.z);
          expect(offset).toBeGreaterThan(0);
          expect(offset).toBeLessThan(0.03);
        }
      }
      expect("colliders" in ground).toBe(false);
    } finally { ground.dispose(); }
  });

  it("keeps actual rock/log vertices outside the corridor and gives logs an elongated fallen silhouette", () => {
    const solids = details.filter(item => item.kind === "log" || item.kind === "rock");
    const ground = createGroundDetails(solids.length);
    try {
      ground.setTiles(solids);
      const mesh = meshesOf(ground)[2]!, matrix = new Matrix4(), vertex = new Vector3();
      const p = mesh.geometry.getAttribute("position");
      let logs = 0;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        const center = new Vector3().setFromMatrixPosition(matrix);
        const source = solids.find(item => Math.abs(item.x - center.x) < 0.0001 && Math.abs(item.z - center.z) < 0.0001)!;
        if (source.kind === "log") {
          const size = mesh.geometry.boundingBox!.getSize(new Vector3());
          expect(size.x * 3.6).toBeGreaterThan(size.y * 5);
          logs++;
        }
        for (let j = 0; j < p.count; j++) {
          vertex.fromBufferAttribute(p, j).applyMatrix4(matrix);
          expect(nearestPath(vertex.x, vertex.z).distance).toBeGreaterThan(PATH_CLEARANCE);
        }
      }
      expect(logs).toBeGreaterThan(0);
    } finally { ground.dispose(); }
  });

  it("caps per-tile kinds before the global budget and applies exact quality counts below that budget", () => {
    const fixture = details[0]!;
    for (const kind of kinds) {
      const items = [0, 1].flatMap(ix => Array.from({ length: GROUND_LIMITS.High[kind] + 10 }, (_, i) =>
        ({ ...fixture, kind, variant: 0, x: ix * TILE_SIZE + 1 + i * 0.001, z: 1 })));
      const ground = createGroundDetails(items.length);
      try {
        ground.setTiles(items);
        for (const quality of ["High", "Balanced", "Low"] as Quality[]) {
          ground.setQuality(quality);
          expect(meshesOf(ground).reduce((sum, mesh) => sum + mesh.count, 0)).toBe(GROUND_LIMITS[quality][kind] * 2);
        }
      } finally { ground.dispose(); }
    }
  });

  it("rejects invalid input atomically, copies caller data and releases owned resources exactly once", () => {
    expect(() => createGroundDetails(-1)).toThrow(RangeError);
    expect(() => createGroundDetails(0.5)).toThrow(RangeError);
    const ground = createGroundDetails(1), parent = new Group(), item = { ...details[0]! };
    parent.add(ground.group);
    ground.setTiles([item]);
    const meshes = meshesOf(ground), original = snapshot(meshes);
    expect(() => ground.setTiles([item, item])).toThrow(RangeError);
    for (const invalid of [{ ...item, x: NaN }, { ...item, variant: 3 }, { ...item, scale: 0 }, { ...item, kind: "toString" }]) {
      expect(() => ground.setTiles([invalid as GroundDetail])).toThrow(RangeError);
      expect(snapshot(meshes)).toEqual(original);
    }
    expect(() => ground.setQuality("toString" as Quality)).toThrow(RangeError);
    item.x += 10;
    ground.setQuality("High");
    expect(snapshot(meshes)).toEqual(original);
    const spies = meshes.flatMap(mesh => [vi.spyOn(mesh, "dispose"), vi.spyOn(mesh.geometry, "dispose")]);
    const material = vi.spyOn(meshes[0]!.material, "dispose"), gradient = vi.spyOn(meshes[0]!.material.gradientMap!, "dispose");
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
