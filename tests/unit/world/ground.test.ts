import { reportBudget } from "./report-budget";
import { Box3, Color, Group, InstancedMesh, Matrix4, MeshToonMaterial, ShaderLib, Scene, Vector3, type BufferGeometry, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createBroadleafBush, createFern, createGrassTuft, createGroundDetails, createRock, FERN_VARIANT_SEEDS, GRASS_VARIANT_SEEDS,
  groundRadius, GROUND_LIMITS, GROUND_MIN_HEIGHT, GROUND_RADIUS, GROUND_TRIANGLE_LIMIT, ROCK_VARIANT_SEEDS,
  scatterGround, type GroundDetail,
} from "../../../src/features/world/foliage/ground";
import { foliageBiomeAt, isGroundCoverExcluded, PATH_CLEARANCE, ZONE_CLEARANCE } from "../../../src/features/world/foliage/scatter";
import { grassFieldAllowed, grassFieldBlade } from "../../../src/features/world/foliage/grass-field";
import { PALETTE } from "../../../src/features/world/art/palette";
import { PATH_BRIDGES, pathPointAt } from "../../../src/features/world/layout/path";
import { WORLD_SCALE } from "../../../src/features/world/layout/scale";
import { ZONES } from "../../../src/features/world/layout/zones";
import { createRockGeometry } from "../../../src/features/world/props/rocks";
import type { Quality } from "../../../src/features/world/terrain";
import { PATH_WIDTH, waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath, nearestRiver } from "../../../src/features/world/terrain/samples";
import { buildTile, TILE_SIZE, tilesAlongPath } from "../../../src/features/world/terrain/tiles";

import { createWorldScene, surfaceHeight, worldSpawn } from "../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";
import { placeZoneScenes, zoneFoliageBounds } from "../../../src/features/world/zones";

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
  it("keeps the default and explicit low fern at the legacy 40-triangle zone budget", () => {
    const legacy = createFern();
    try {
      expect(triangleCount(legacy)).toBe(40);
      for (const seed of FERN_VARIANT_SEEDS) {
        const low = createFern(seed, { detail: "low" });
        try {
          reportBudget("tests/unit/world/ground.test.ts:69 triangleCount(low)", triangleCount(low), 60);
          expect(low.index!.array).toEqual(legacy.index!.array);
          for (const attribute of ["position", "color", "normal"]) {
            expect(low.getAttribute(attribute).array).toEqual(legacy.getAttribute(attribute).array);
          }
        } finally { low.dispose(); }
      }
    } finally { legacy.dispose(); }
  });

  it("builds three distinct deterministic serrated fern variants below the 300-triangle asset cap", () => {
    const signatures = new Set<string>();
    const triangles: number[] = [];
    for (const seed of FERN_VARIANT_SEEDS) {
      const geometry = createFern(seed, { detail: "high" }), repeated = createFern(seed, { detail: "high" });
      try {
        const p = geometry.getAttribute("position");
        expect(p.array).toEqual(repeated.getAttribute("position").array);
        signatures.add(JSON.stringify([...p.array]));
        triangles.push(triangleCount(geometry));
        // Four rachis vertices and 6 pinnae of 5 vertices per frond.
        expect(p.count / 34).toBeGreaterThanOrEqual(6);
        expect(p.count / 34).toBeLessThanOrEqual(9);
        reportBudget("tests/unit/world/ground.test.ts:92 triangleCount(geometry)", triangleCount(geometry), 300);
        // Serration: the notch is inset between two outer teeth.
        for (let start = 4; start < p.count; start += 34) {
          const distance = (i: number) => Math.hypot(p.getX(i), p.getZ(i));
          expect(distance(start + 2)).toBeLessThan(distance(start + 3));
        }
      } finally { geometry.dispose(); repeated.dispose(); }
    }
    expect(signatures.size).toBe(3);
    console.info("GROUND fern triangles: 40 ->", triangles, "; grass unchanged: 18/24/15; B2-194 rock/log: 24 -> 20; bush: 24");
  });
  it("retains distinct seeded curved grass and weathered, partly buried solids within their radius", () => {
    for (const [seeds, factory, budget] of [[GRASS_VARIANT_SEEDS, createGrassTuft, 27], [ROCK_VARIANT_SEEDS, createRock, 200]] as const) {
      const signatures = new Set<string>();
      for (const seed of seeds) {
        const geometry = factory(seed), repeated = factory(seed);
        try {
          const positions = geometry.getAttribute("position");
          expect(positions.array).toEqual(repeated.getAttribute("position").array);
          signatures.add(JSON.stringify([...positions.array]));
          reportBudget("tests/unit/world/ground.test.ts:112 triangleCount(geometry)", triangleCount(geometry), budget);
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

  it("uses two mossy kit stones with identical vertex counts and intact batched variants", () => {
    const ground = createGroundDetails(2), counts: number[] = [], signatures = new Set<string>();
    try {
      const batch = meshesOf(ground)[2]!.geometry;
      for (const [variant, seed] of ROCK_VARIANT_SEEDS.entries()) {
        const geometry = createRock(seed), kit = createRockGeometry("stone", seed, true);
        try {
          kit.scale(1.5, 1, 1.5).translate(0, -0.08, 0);
          const position = geometry.getAttribute("position");
          counts.push(position.count);
          signatures.add(JSON.stringify([...position.array]));
          expect(triangleCount(geometry)).toBe(20); // B2-194: fixed stone topology replaces 24-triangle cylinder.
          for (const name of ["position", "normal", "color"]) expect(geometry.getAttribute(name).array).toEqual(kit.getAttribute(name).array);
          expect(batch.getAttribute(variant === 0 ? "position" : "groundPosition1").array).toEqual(position.array);
          expect(batch.getAttribute(variant === 0 ? "color" : "groundColor1").array).toEqual(geometry.getAttribute("color").array);
          const size = geometry.boundingBox!.getSize(new Vector3());
          expect(size.x).toBeGreaterThan(0.65);
          expect(size.x).toBeLessThan(1.15);
          expect(size.y).toBeGreaterThan(0.29);
          expect(size.y).toBeLessThan(0.47);
        } finally { geometry.dispose(); kit.dispose(); }
      }
      expect(counts).toEqual([60, 60]);
      expect(signatures.size).toBe(2);
      expect(batch.getAttribute("groundPosition2").array).toEqual(batch.getAttribute("groundPosition1").array);
    } finally { ground.dispose(); }
  });

  it("builds splayed pinnate ferns and broad folded bush leaves with the requested metre envelope", () => {
    for (const [factory, triangles, low, high] of [[createFern, 40, 0.4, 1], [createBroadleafBush, 24, 0.6, 1.4]] as const) {
      const geometry = factory(), repeated = factory();
      try {
        expect(geometry.getAttribute("position").array).toEqual(repeated.getAttribute("position").array);
        expect(triangleCount(geometry)).toBe(triangles);
        expect(geometry.boundingBox!.min.y).toBe(0);
        expect(geometry.boundingBox!.max.y * low).toBeGreaterThan(low * 0.85);
        expect(geometry.boundingBox!.max.y * high).toBeLessThanOrEqual(high);
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
        const colors = geometry.getAttribute("color");
        const rock = new Color(PALETTE.rock);
        // B2-194: fracture/bevel/moss pigments come from the shared kit rather
        // than the old cylinder's single rockDark -> green gradient.
        const stoneColors = [new Color(PALETTE.rockDark), rock.clone().lerp(new Color(PALETTE.sand), 0.16),
          rock.clone().lerp(grass, 0.42), new Color(PALETTE.rockDark).lerp(rock, 0.72)];
        for (let i = 0; i < colors.count; i++) {
          const color = new Color().fromBufferAttribute(colors, i);
          if (factory === createRock) {
            expect(Math.min(...stoneColors.map(pigment => color.toArray().reduce((sum, value, channel) => sum + Math.abs(value - pigment.toArray()[channel]!), 0)))).toBeLessThan(1e-6);
            if (geometry.getAttribute("normal").getY(i) < -0.3) expect(color.toArray()).toEqual(new Color(PALETTE.rockDark).toArray().map(value => expect.closeTo(value, 5)));
          } else if (factory === createGrassTuft) expectRecipe(color, grass, new Color(PALETTE.grassDry));
          else if (factory === createBroadleafBush && Math.floor(i / 5) % 2) expectRecipe(color, deep, grass);
          else expectRecipe(color, deep, light);
        }
      } finally { geometry.dispose(); }
    }
  });
});

describe("ground scatter", () => {
  it.each([0.02, 0.15])("measures B2-223 verge at t=%s", t => {
    const p = pathPointAt(t), a = pathPointAt(t - 0.0001), b = pathPointAt(t + 0.0001);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const center = { x: p.x + (b.z - a.z) / length * -12, z: p.z - (b.x - a.x) / length * -12 };
    const count = details.filter(item => Math.abs(item.x - center.x) <= 5 && Math.abs(item.z - center.z) <= 5).length;
    const before = t === 0.02 ? 54 : 16; // Measured from the pre-ticket scatter, same seed/cell.
    console.info("B2-223 verge before/after", t, before, count);
    // ADR 0017 moves this seeded ten-metre window beside the closer pad;
    // maintain the doubled density per unit of route rather than its old count.
    expect(count).toBeGreaterThanOrEqual(before * 2 * WORLD_SCALE);
    // B2-225 opens the pad/sun-gap area; the rendered triangle cap remains below.
    const ground = createGroundDetails(details.length);
    try {
      ground.setFocus(center.x, center.z);
      ground.setTiles(details);
      const matrix = new Matrix4();
      let visible = 0;
      for (const mesh of meshesOf(ground)) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        const position = new Vector3().setFromMatrixPosition(matrix);
        if (Math.abs(position.x - center.x) <= 5 && Math.abs(position.z - center.z) <= 5) visible++;
      }
      expect(visible).toBeGreaterThanOrEqual(before * 2 * WORLD_SCALE);
      reportBudget("tests/unit/world/ground.test.ts:224 renderedTriangles(meshesOf(ground))", renderedTriangles(meshesOf(ground)), 40_000);
      console.info("B2-223 rendered", t, visible, "triangles", renderedTriangles(meshesOf(ground)));
    } finally { ground.dispose(); }
  });
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

  it.each(route.map((tile, index) => [tile.ix + "," + tile.iz, index] as const))("keeps all footprints on tile %s clear of paths, asphalt, pads, bridges and water", (_, index) => {
    for (const kind of kinds) expect(details.some(item => item.kind === kind), kind).toBe(true);
    const violations: GroundDetail[] = [];
    {
      const tile = route[index]!, items = scattered[index]!;
      for (const kind of kinds) expect(items.filter(item => item.kind === kind).length).toBeLessThanOrEqual(GROUND_LIMITS.High[kind]);
      for (const item of items) {
        const path = nearestPath(item.x, item.z), radius = groundRadius(item.kind);
        let valid = item.x >= tile.ix * TILE_SIZE && item.x < (tile.ix + 1) * TILE_SIZE
          && item.z >= tile.iz * TILE_SIZE && item.z < (tile.iz + 1) * TILE_SIZE;
        const soft = ["grass", "fern", "flower", "leaf"].includes(item.kind);
        if (soft) valid &&= !isGroundCoverExcluded(item.x, item.z, [], radius);
        else {
          valid &&= path.distance - radius >= PATH_CLEARANCE;
          valid &&= ZONES.every(zone => Math.hypot(item.x - zone.position.x, item.z - zone.position.z) - radius >= zone.radius + ZONE_CLEARANCE);
        }
        valid &&= !PATH_BRIDGES.some(bridge => path.t >= bridge.tStart && path.t <= bridge.tEnd && path.distance < 6 + radius);
        valid &&= Math.abs(item.y - renderedHeight(item.x, item.z) - (item.kind === "leaf" ? 0.018 : 0)) < 1e-6;
        for (let i = -1; i < 8; i++) {
          const x = item.x + (i < 0 ? 0 : Math.cos(i * Math.PI / 4) * radius);
          const z = item.z + (i < 0 ? 0 : Math.sin(i * Math.PI / 4) * radius);
          valid &&= worldHeight(x, z) >= GROUND_MIN_HEIGHT && renderedHeight(x, z) > waterLevelAt(z);
        }
        if (item.kind === "fern") valid &&= item.scale >= 0.4 && item.scale <= 1
          && (foliageBiomeAt(item.x, item.z) === "forest-dawn" || Math.abs(nearestRiver(item.x, item.z).distance - 8) < 7.2);
        if (item.kind === "bush") valid &&= item.scale >= 0.6 && item.scale <= 1.4 && foliageBiomeAt(item.x, item.z) === "forest-dawn";
        if (item.kind === "flower") valid &&= foliageBiomeAt(item.x, item.z) === "forest-dawn" && item.variant === 1 || foliageBiomeAt(item.x, item.z) === "hill" || foliageBiomeAt(item.x, item.z) === "coast-dusk" && path.distance < 14;
        if (!valid) violations.push(item);
      }
    }
    expect(violations).toEqual([]);
    expect(details.filter(item => item.kind === "log").length).toBeLessThan(details.filter(item => item.kind === "rock").length * 0.3);
  });

  it("covers forest 10 x 10 m cells at t=0.15 near and far from the path, including after LOD", () => {
    const point = pathPointAt(0.15), a = pathPointAt(0.1499), b = pathPointAt(0.1501);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
    const near = { x: point.x - nx * 22, z: point.z - nz * 22 };
    const far = { x: point.x - nx * 44, z: point.z - nz * 44 };
    const inCell = (p: { x: number; z: number }, center: typeof near) => Math.abs(p.x - center.x) <= 5 && Math.abs(p.z - center.z) <= 5;
    const ground = createGroundDetails(details.length);
    try {
      ground.setFocus(near.x, near.z);
      ground.setTiles(details);
      const matrix = new Matrix4();
      const rendered = meshesOf(ground).flatMap(mesh => Array.from({ length: mesh.count }, (_, i) => {
        mesh.getMatrixAt(i, matrix);
        return new Vector3().setFromMatrixPosition(matrix);
      }));
      const counts = [details, rendered].map(points => ({ near: points.filter(p => inCell(p, near)).length, far: points.filter(p => inCell(p, far)).length }));
      console.info("GROUND density raw/rendered", counts, "triangles", renderedTriangles(meshesOf(ground)));
      for (const count of counts) {
        expect(count.near).toBeGreaterThanOrEqual(25);
        expect(count.far).toBeGreaterThanOrEqual(8);
        expect(count.near).toBeGreaterThan(count.far);
      }
    } finally { ground.dispose(); }
  });
});

describe("ground instancing", () => {
  it("selects real variant positions/colors in the ramp shader within 16 vertex attribute slots", () => {
    const ground = createGroundDetails(1);
    try {
      const meshes = meshesOf(ground), shader = { ...ShaderLib.toon!, uniforms: {} };
      const material = meshes[0]!.material;
      material.onBeforeCompile(shader as unknown as Parameters<typeof material.onBeforeCompile>[0], {} as WebGLRenderer);
      expect(shader.vertexShader).toContain("groundSelect(position, groundPosition1, groundPosition2)");
      expect(shader.vertexShader).toContain("mix(instanceColor.rgb, groundTip, blend)");
      expect(shader.fragmentShader).toContain("rampShadowTint");
      expect(material.defines?.FLAT_SHADED).toBe("");
      for (const mesh of meshes) {
        expect(Object.keys(mesh.geometry.attributes).length + 5).toBeLessThanOrEqual(16);
        expect(mesh.geometry.boundingSphere!.radius).toBeGreaterThan(0);
      }
      for (const [index, seeds, factory] of [[0, FERN_VARIANT_SEEDS, createFern], [3, GRASS_VARIANT_SEEDS, createGrassTuft]] as const) {
        for (const [variant, seed] of seeds.entries()) {
          const geometry = factory(seed, { detail: "high" }), expanded = geometry.toNonIndexed();
          try {
            const actual = meshes[index]!.geometry.getAttribute(variant ? `groundPosition${variant}` : "position");
            expect([...actual.array].slice(0, expanded.getAttribute("position").array.length)).toEqual([...expanded.getAttribute("position").array]);
          } finally { geometry.dispose(); expanded.dispose(); }
        }
      }
    } finally { ground.dispose(); }
  });
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
      for (const quality of ["Low", "High"] as Quality[]) {
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

  it("renders thin palette-colored leaf decals outside the path, seated on the real triangle surface", () => {
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
          expect(nearestPath(vertex.x, vertex.z).distance).toBeGreaterThan(PATH_WIDTH / 2 + 0.3);
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
    for (const kind of kinds.filter(kind => kind !== "grass" && kind !== "flower")) {
      const items = [0].flatMap(ix => Array.from({ length: GROUND_LIMITS.High[kind] + 10 }, (_, i) =>
        ({ ...fixture, kind, variant: 0, x: ix * TILE_SIZE + 1 + i * 0.001, z: 1 })));
      const ground = createGroundDetails(items.length);
      try {
        ground.setFocus(1, 1);
        ground.setTiles(items);
        for (const quality of ["Low", "High"] as Quality[]) {
          ground.setQuality(quality);
          expect(meshesOf(ground).reduce((sum, mesh) => sum + mesh.count, 0)).toBe(GROUND_LIMITS[quality][kind]);
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

describe("B2-225 resident High budget", () => {
  it("keeps the fully dressed spawn world within 25 percent of the pre-ticket world", () => {
    const zones = placeZoneScenes(surfaceHeight), scene = new Scene();
    for (const zone of zones) scene.add(zone.group);
    const world = createWorldScene({ ...createMeshPhysics(), scene, quality: "High",
      zoneBounds: zoneFoliageBounds(zones), zoneBoxes: zones.flatMap(zone => zone.boxes) });
    try {
      for (let frame = 0; frame < 100; frame++) world.update(worldSpawn(), 0);
      let triangles = 0;
      scene.traverse(object => {
        if (!(object instanceof InstancedMesh) && !("isMesh" in object)) return;
        const mesh = object as InstancedMesh;
        if (mesh.visible) triangles += triangleCount(mesh.geometry) * (mesh.isInstancedMesh ? mesh.count : 1);
      });
      process.stdout.write(`B2-225 High spawn triangles: ${triangles}\n`);
      reportBudget("tests/unit/world/ground.test.ts:479 triangles", triangles, 212_337 * 1.25); // Measured after B2-223 with the same scene/seed.
    } finally { world.dispose(); for (const zone of zones) zone.dispose(); }
  }, 30_000);
});

describe("B2-225 soft cover", () => {
  it("fills eligible 4 x 4 m spawn cells and excludes actual prop footprints", () => {
    const zones = placeZoneScenes(surfaceHeight);
    const bounds = zones.flatMap(zone => zone.boxes.map(box => new Box3().setFromObject(box)));
    const spawn = pathPointAt(0);
    try {
      const tiles = tilesAlongPath(20).filter(tile => Math.hypot((tile.ix + 0.5) * TILE_SIZE - spawn.x, (tile.iz + 0.5) * TILE_SIZE - spawn.z) < 60);
      const soft = tiles.flatMap(tile => scatterGround(tile, bounds)).filter(item => ["grass", "fern", "flower", "leaf"].includes(item.kind));
      for (const item of soft) {
        expect(Math.hypot(item.x - spawn.x, item.z - spawn.z)).toBeGreaterThanOrEqual(2);
        expect(nearestPath(item.x, item.z).distance).toBeGreaterThanOrEqual(PATH_WIDTH / 2 + 0.3);
        expect(worldHeight(item.x, item.z)).toBeGreaterThan(waterLevelAt(item.z));
        for (const box of bounds) expect(item.x < box.min.x - 0.4 || item.x > box.max.x + 0.4
          || item.z < box.min.z - 0.4 || item.z > box.max.z + 0.4).toBe(true);
      }
      const blades = [];
      for (let cx = Math.floor((spawn.x - 12) / 0.7); cx <= Math.ceil((spawn.x + 12) / 0.7); cx++) {
        for (let cz = Math.floor((spawn.z - 12) / 0.7); cz <= Math.ceil((spawn.z + 12) / 0.7); cz++) {
          const blade = grassFieldBlade(cx, cz);
          if (grassFieldAllowed(blade.x, blade.z, bounds)) blades.push(blade);
        }
      }
      let checked = 0;
      for (let dx = -12; dx < 12; dx += 4) for (let dz = -12; dz < 12; dz += 4) {
        const x = spawn.x + dx, z = spawn.z + dz;
        const corners = [[x,z], [x+4,z], [x,z+4], [x+4,z+4]];
        if (!corners.every(([px,pz]) => Math.hypot(px! - spawn.x, pz! - spawn.z) >= 3
          && Math.hypot(px! - spawn.x, pz! - spawn.z) <= 12 && !isGroundCoverExcluded(px!, pz!, bounds))) continue;
        const count = [...soft, ...blades].filter(item => item.x >= x && item.x < x + 4 && item.z >= z && item.z < z + 4).length;
        expect(count).toBeGreaterThanOrEqual(6);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
      for (let dx = -1.8; dx <= 1.8; dx += 0.3) for (let dz = -1.8; dz <= 1.8; dz += 0.3) {
        if (Math.hypot(dx, dz) < 2) expect(grassFieldAllowed(spawn.x + dx, spawn.z + dz, bounds)).toBe(false);
      }
      const box = new Box3(new Vector3(spawn.x + 5, -100, spawn.z + 5), new Vector3(spawn.x + 6, 100, spawn.z + 6));
      expect(isGroundCoverExcluded(box.min.x - 0.39, box.min.z, [box])).toBe(true);
      for (const blade of blades) for (const bound of bounds) expect(blade.x < bound.min.x - 0.4 || blade.x > bound.max.x + 0.4
        || blade.z < bound.min.z - 0.4 || blade.z > bound.max.z + 0.4).toBe(true);
    } finally { for (const zone of zones) zone.dispose(); }
  });
});
