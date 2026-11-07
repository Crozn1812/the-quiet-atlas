import { STYLE_PRESETS } from "../../../src/features/world/art/direction";
import { afterEach, expect, it, vi } from "vitest";
import { BufferGeometry, Fog, HemisphereLight, InstancedMesh, Material, Matrix4, Mesh, Scene, Vector3 } from "three";
import { createWorldScene, directGrade, nearestSafePath, surfaceHeight, worldSpawn } from "../../../src/features/world/scene/compose";
import { createController } from "../../../src/features/world/rapier";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";
import { createGradedPaperPass } from "../../../src/features/world/scene/paper";
import { createFoliageColliders } from "../../../src/features/world/foliage/colliders";
import { scatterTile } from "../../../src/features/world/foliage/scatter";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { applyCoastAtmosphere, lightingAt } from "../../../src/features/world/sky/grade";
import { tilesToLoad } from "../../../src/features/world/terrain/streaming";
import { TILE_SIZE, tileKey } from "../../../src/features/world/terrain/tiles";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { HEIGHT } from "../../../src/features/world/scene";
import { FIXED_DT } from "../../../src/features/world/timestep";
import { PALETTE } from "../../../src/features/world/art/palette";
import { createWaterMaterial, WaterMaterial } from "../../../src/features/world/water/material";

afterEach(() => { disposeRampGradients(); vi.restoreAllMocks(); });

it("shares biome fog distances between native fog and paper at every quality, including the return to forest", () => {
  const backend = createMeshPhysics();
  const scene = new Scene();
  const paper = { setGrade: vi.fn(), setMist: vi.fn(), setFog: vi.fn() };
  const composed = createWorldScene({ ...backend, scene, quality: "Low", paper });
  try {
    for (const quality of ["Low", "Balanced", "High"] as const) {
      composed.setQuality(quality);
      for (const id of ["first-light", "horizon", "quiet-shore", "last-postcard", "roots"] as const) {
        const zone = ZONES.find(zone => zone.id === id)!;
        composed.update(new Vector3().copy(zone.position), 0);
        const expected = zone.biome === "forest-dawn" ? { near: 35, far: 190 }
          : zone.biome === "coast-dusk" ? { near: 160, far: 900 } : { near: 120, far: 700 };
        expect(scene.fog).toBeInstanceOf(Fog);
        expect((scene.fog as Fog).near).toBe(expected.near);
        expect((scene.fog as Fog).far).toBeCloseTo(expected.far, 8);
        expect(paper.setFog.mock.lastCall![0].near).toBe(expected.near);
        expect(paper.setFog.mock.lastCall![0].far).toBeCloseTo(expected.far, 8);
        expect(paper.setFog.mock.lastCall![0].forestWeight).toBe(zone.biome === "forest-dawn" ? 1 : 0);
        const grade = applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(zone.t)), timeOfDayAt(zone.t)), zone.t);
        // nearestPath's sampled projection differs slightly from the authored zone t.
        expect(composed.sun.intensity).toBeCloseTo(grade.sunIntensity, 6);
        expect(composed.sun.color.toArray()).toEqual(grade.sunColor.toArray().map(v => expect.closeTo(v, 6)));
        const hemi = scene.children.find(child => child instanceof HemisphereLight) as HemisphereLight;
        expect(hemi.intensity).toBeCloseTo(grade.hemiIntensity, 6);
        expect((scene.fog as Fog).color.toArray()).toEqual(grade.fogColor.toArray().map(v => expect.closeTo(v, 6)));
        expect(paper.setGrade.mock.lastCall![0].sunIntensity).toBeCloseTo(grade.sunIntensity, 6);
        const water = scene.children.filter((child): child is Mesh<BufferGeometry, WaterMaterial> =>
          child instanceof Mesh && child.material instanceof WaterMaterial);
        expect(water).toHaveLength(2);
        expect(water.map(mesh => mesh.geometry.index!.count / 3)).toEqual([2048, 2]);
        if (quality === "High" && id === "quiet-shore") {
          let triangles = 0, draws = 0;
          scene.traverseVisible(object => {
            if (!(object instanceof Mesh)) return;
            const instances = object instanceof InstancedMesh ? object.count : 1;
            if (!instances) return;
            triangles += Math.min(object.geometry.drawRange.count,
              object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3 * instances;
            draws += Array.isArray(object.material) ? object.material.length : 1;
          });
          process.stdout.write(`B2-181 High quiet-shore composer: ${triangles} triangles, ${draws} mesh draws; water=2050 triangles, 2 draws (unchanged)\n`);
        }
        // Both surfaces receive exactly the same followed/directed grade as the scene lights,
        // including the first frame after quality reallocation and the return from coast to forest.
        for (const mesh of water) {
          const material = mesh.material;
          const expected = createWaterMaterial(quality, {
            surface: material.defines.SEA_WATER ? "sea" : "river", grade: paper.setGrade.mock.lastCall![0],
          });
          for (const key of ["uEdgeColor", "uDeepColor", "uPaperColor", "uSkyHorizon", "uSunWashColor"]) {
            expect(material.uniforms[key]!.value).toEqual(expected.uniforms[key]!.value);
          }
          expected.dispose();
        }
      }
    }
  } finally { composed.dispose(); }
  // Fifteen full-world streams with dense B2-185 scatter need the same harness
  // window as the preload traversal below when the whole suite runs in parallel.
}, 60_000);

it("preloads spawn, streams 300 m, retains every tree collider at all qualities and releases every resource", async () => {
  const physics = await createController(undefined, [], { streamed: true });
  const scene = new Scene();
  const paper = { setGrade: vi.fn(), setMist: vi.fn() };
  const created = vi.spyOn(physics.world, "createCollider");
  const removed = vi.spyOn(physics.world, "removeCollider");
  const geometryCounts = new Map<BufferGeometry, number>();
  const materialCounts = new Map<Material, number>();
  const track = (composed: ReturnType<typeof createWorldScene>) => {
    const record = (mesh: Mesh) => {
      if (!geometryCounts.has(mesh.geometry)) {
        geometryCounts.set(mesh.geometry, 0);
        mesh.geometry.addEventListener("dispose", () => geometryCounts.set(mesh.geometry, geometryCounts.get(mesh.geometry)! + 1));
      }
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (materialCounts.has(material)) continue;
        materialCounts.set(material, 0);
        material.addEventListener("dispose", () => materialCounts.set(material, materialCounts.get(material)! + 1));
      }
    };
    scene.traverse(object => { if (object instanceof Mesh) record(object); });
    composed.collisionMeshes.forEach(record);
  };
  const composed = createWorldScene({ ...physics, scene, quality: "Balanced", paper });
  try {
    track(composed);
    const initial = tilesToLoad(0);
    const expectedTrees = initial.flatMap(tile => scatterTile(tile));
    const descriptors = created.mock.calls.map(([descriptor]) => descriptor);
    expect(descriptors).toHaveLength(initial.length + expectedTrees.length);
    expect(physics.world.colliders.len()).toBe(1 + initial.length + expectedTrees.length);
    expect(composed.collisionMeshes).toHaveLength(initial.length + expectedTrees.length);
    for (const tile of initial) expect(composed.contains({ x: (tile.ix + 0.5) * TILE_SIZE, z: (tile.iz + 0.5) * TILE_SIZE })).toBe(true);
    expect(worldSpawn().x).toBeCloseTo(ZONES[0]!.position.x);
    physics.teleport(worldSpawn());
    for (let frame = 0; frame < 90; frame++) physics.step(0, 0, FIXED_DT);
    expect(physics.grounded).toBe(true);
    expect(physics.position.y).toBeCloseTo(worldSpawn().y, 1);

    const crown = composed.foliageMeshes.find(mesh => mesh instanceof InstancedMesh && mesh.count > 0 && mesh.geometry.hasAttribute("crownAlpha")) as InstancedMesh;
    const matrix = new Matrix4();
    crown.getMatrixAt(0, matrix);
    const center = new Vector3().setFromMatrixPosition(matrix);
    composed.fadeCrowns(center.clone().add(new Vector3(0, 0, 8)), center.clone().add(new Vector3(0, 0, -8)), 1);
    expect(crown.geometry.getAttribute("crownAlpha").getX(0)).toBeLessThan(0.2);

    const handles = new Set(composed.collisionMeshes);
    for (const quality of ["Low", "High", "Balanced"] as const) {
      composed.setQuality(quality);
      track(composed);
      expect(new Set(composed.collisionMeshes)).toEqual(handles);
      expect(created).toHaveBeenCalledTimes(initial.length + expectedTrees.length);
      expect(removed).not.toHaveBeenCalled();
    }
    const oldTerrain = composed.collisionMeshes.slice(0, initial.length).map(mesh => mesh.geometry);
    const routeLength = pathLength();
    for (let distance = 5; distance <= 300; distance += 5) {
      composed.update(pathPointAt(distance / routeLength), FIXED_DT);
      track(composed);
    }
    const desired = tilesToLoad(300 / routeLength);
    const desiredKeys = new Set(desired.map(tile => tileKey(tile.ix, tile.iz)));
    expect(removed.mock.calls.length).toBeGreaterThan(0);
    expect(created.mock.calls.length).toBeGreaterThan(initial.length + expectedTrees.length);
    expect(oldTerrain.some(geometry => geometryCounts.get(geometry) === 1)).toBe(true);
    expect(initial.some(tile => !desiredKeys.has(tileKey(tile.ix, tile.iz)))).toBe(true);
    for (const tile of desired) expect(composed.contains({ x: (tile.ix + 0.5) * TILE_SIZE, z: (tile.iz + 0.5) * TILE_SIZE })).toBe(true);
    const treeCount = desired.flatMap(tile => scatterTile(tile)).length;
    expect(physics.world.colliders.len()).toBe(1 + desired.length + treeCount);
    const destination = pathPointAt(0.95);
    composed.update(destination, 0);
    track(composed);
    // B2-038: sky/fog colours come from art direction C, blended by time of day; B2-155 adds the coast sunset on top.
    expect(paper.setGrade.mock.lastCall![0].fogColor).toEqual(applyCoastAtmosphere(directGrade(lightingAt(0), timeOfDayAt(0.95)), 0.95).fogColor);
    expect(scene.fog!.color).toEqual(paper.setGrade.mock.lastCall![0].fogColor);
  } finally {
    composed.dispose();
    composed.dispose();
    expect(physics.world.colliders.len()).toBe(1);
    expect(scene.children).toHaveLength(0);
    expect([...geometryCounts.values()]).toEqual(Array(geometryCounts.size).fill(1));
    expect([...materialCounts.values()]).toEqual(Array(materialCounts.size).fill(1));
    physics.dispose();
  }
}, 30_000);

it("uses real full-density trunk collisions on streamed terrain", async () => {
  const physics = await createController(undefined, [], { streamed: true });
  const composed = createWorldScene({ ...physics, scene: new Scene(), quality: "Low" });
  try {
    const trees = tilesToLoad(0).flatMap(tile => scatterTile(tile));
    const tree = trees.find(tree => tree.scale > 0.95)!;
    const trunk = createFoliageColliders([tree])[0]!;
    physics.teleport({ x: trunk.x, y: surfaceHeight(trunk.x, trunk.z + 2) + HEIGHT + 0.02, z: trunk.z + 2 });
    for (let frame = 0; frame < 120; frame++) {
      physics.step(0, -3, FIXED_DT);
      expect(Math.hypot(physics.position.x - trunk.x, physics.position.z - trunk.z)).toBeGreaterThan(0.56);
    }
  } finally { composed.dispose(); physics.dispose(); }
}, 30_000);

it("returns the nearest path point at the shared triangle height", () => {
  const point = pathPointAt(0.4);
  const safe = nearestSafePath(point.clone().add(new Vector3(12, -80, 0)));
  expect(safe.y).toBe(surfaceHeight(safe.x, safe.z) + HEIGHT + 0.02);
  expect(safe.distanceTo(point)).toBeLessThan(30);
});

it("retains walking ground on streaming failure and retries; mesh fallback never needs Rapier", () => {
  const backend = createMeshPhysics();
  const scene = new Scene();
  const composed = createWorldScene({ ...backend, scene, quality: "Low" });
  try {
    const original = backend.world.createCollider;
    backend.world.createCollider = () => { throw new Error("tile allocation failed"); };
    composed.update(pathPointAt(0.4), 0);
    expect(composed.streamingError).toBeInstanceOf(Error);
    expect(composed.contains(worldSpawn())).toBe(true);
    backend.world.createCollider = original;
    composed.update(pathPointAt(0.4), 0);
    expect(composed.streamingError).toBeUndefined();
    expect(composed.contains(pathPointAt(0.4))).toBe(true);
  } finally { composed.dispose(); }
});

it("cleans up an initial tile failure before handing a scene to the first frame", () => {
  const backend = createMeshPhysics();
  const scene = new Scene();
  const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
  const materialDispose = vi.spyOn(Material.prototype, "dispose");
  const geometries = new Set<BufferGeometry>();
  const setAttribute = BufferGeometry.prototype.setAttribute;
  vi.spyOn(BufferGeometry.prototype, "setAttribute").mockImplementation(function (this: BufferGeometry, name, attribute) {
    geometries.add(this);
    return setAttribute.call(this, name, attribute);
  });
  backend.world.createCollider = () => { throw new Error("initial allocation failed"); };
  expect(() => createWorldScene({ ...backend, scene, quality: "Balanced" })).toThrow("initial allocation failed");
  expect(scene.children).toHaveLength(0);
  // B2-194 removes the two temporary rock cylinders by using the stone kit.
  // Six non-ground + 26 ground geometries: 11 source variants, 11 expanded
  // copies and 4 merged batches, all still released exactly once.
  // +1: the B2-214 grass tuft geometry.
  expect(geometryDispose).toHaveBeenCalledTimes(33);
  expect(new Set(geometryDispose.mock.contexts)).toEqual(geometries);
  expect(geometryDispose.mock.contexts).toHaveLength(geometries.size);
  expect(materialDispose).toHaveBeenCalledTimes(8); // +1 shared ground material (B2-047), +1 coast mist (B2-155), +1 grass field (B2-214)
  expect(new Set(materialDispose.mock.contexts).size).toBe(8);
});

it("grades paper fog without changing the paper pigment, across Low and High reallocations", async () => {
  const WORLD_DIRECTION = STYLE_PRESETS.C;
  const { Color, OrthographicCamera, PerspectiveCamera, Vector2 } = await import("three");
  const materials: import("three").ShaderMaterial[] = [];
  const renderer = {
    autoClear: true,
    getSize: (out: import("three").Vector2) => out.copy(new Vector2(100, 100)),
    getPixelRatio: () => 1,
    getRenderTarget: () => null,
    setRenderTarget() {},
    render(scene: Scene, camera: import("three").Camera) {
      if (camera instanceof OrthographicCamera) materials.push((scene.children[0] as Mesh).material as import("three").ShaderMaterial);
    },
  } as unknown as import("three").WebGLRenderer;
  const paper = createGradedPaperPass(renderer, "Balanced", WORLD_DIRECTION);
  try {
    for (const quality of ["Balanced", "Low", "High"] as const) {
      paper.setQuality(quality);
      paper.setGrade(lightingAt(1));
      paper.render(new Scene(), new PerspectiveCamera());
    }
    expect(materials).toHaveLength(2);
    for (const material of materials) {
      expect(material.uniforms.paperColor!.value).toEqual(new Color(PALETTE.paper));
      // Grade tints fog + mist through the pass API (survives Low -> High reallocation); paper stays immutable.
      expect(material.uniforms.fogColor!.value).toEqual(lightingAt(1).fogColor);
      // Mist leans toward the fog colour by direction C's warmth.
      expect(material.uniforms.mistColor!.value).toEqual(new Color(PALETTE.mist).lerp(lightingAt(1).fogColor, WORLD_DIRECTION.background.mist.warmth));
      expect(material.uniforms.fogNear!.value).toBe(WORLD_DIRECTION.background.fog.near);
      expect(material.uniforms.fogFar!.value).toBe(WORLD_DIRECTION.background.fog.far);
      expect(material.fragmentShader).toContain("mix(color.rgb, fogColor, smoothstep(fogNear, fogFar, viewDepth)");
      expect(material.fragmentShader).toContain("1.0 - step(0.99999, depth)");
    }
  } finally { paper.dispose(); }
});

it("streams the river ahead while the intro overlooks it, then unloads after the player moves (B2-043b review)", async () => {
  const physics = await createController(undefined, [], { streamed: true });
  const composed = createWorldScene({ ...physics, scene: new Scene(), quality: "Low", paper: { setGrade: vi.fn(), setMist: vi.fn() } });
  try {
    const spawn = worldSpawn();
    const far = pathPointAt(500 / pathLength());
    expect(composed.contains(far)).toBe(false);
    composed.setPreload(600);
    composed.update(spawn, 0);
    expect(composed.contains(far)).toBe(true);
    composed.setPreload(0);
    composed.update(spawn, 0);
    expect(composed.contains(far)).toBe(true); // no unload hitch at handoff
    composed.update(nearestSafePath(pathPointAt(20 / pathLength())), 0);
    expect(composed.contains(far)).toBe(false);
  } finally { composed.dispose(); physics.dispose?.(); }
}, 60_000);

// B2-155 wiring: the mist shelf (authored toward local +Z) turns to the walker's LEFT on the coast road, where the
// forested ridge is (Duy, Q-37). Left of walking direction (fx, fz) in three.js is (fz, -fx).
it("turns the coast mountain mist to the left of the coast road", async () => {
  const { coastMistYaw } = await import("../../../src/features/world/scene/compose");
  const start = pathPointAt(0.82), end = pathPointAt(1);
  const forward = new Vector3(end.x - start.x, 0, end.z - start.z).normalize();
  const left = new Vector3(forward.z, 0, -forward.x);
  const facing = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), coastMistYaw());
  expect(facing.dot(left)).toBeGreaterThan(0.999);
});

// B2-154 wiring: the sea follows the graded sun, and keeps its foam coastline across quality changes.
it("feeds the graded sun to the sea and keeps the sea coastline when quality changes", () => {
  const backend = createMeshPhysics();
  const scene = new Scene();
  const composed = createWorldScene({ ...backend, scene, quality: "High" });
  type SeaUniforms = { uniforms: Record<string, { value: unknown }> };
  const sea = () => (scene.children.filter((child): child is Mesh => child instanceof Mesh)
    .find(child => (child.material as unknown as SeaUniforms).uniforms?.uHasShore?.value === 1)!.material as unknown as SeaUniforms);
  try {
    composed.update(pathPointAt(0.95), 0);
    const sun = composed.sun.position.clone().sub(composed.sun.target.position).normalize();
    expect((sea().uniforms.uSunDirection!.value as Vector3).dot(sun)).toBeGreaterThan(0.999);
    const shore = [...(sea().uniforms.uShoreZ!.value as number[])];
    composed.setQuality("Low");
    expect(sea().uniforms.uHasShore!.value).toBe(1);
    expect(sea().uniforms.uShoreZ!.value).toEqual(shore);
  } finally {
    composed.dispose();
  }
});


it("defers distant ground, preserves one-shot instance parity, and cancels mid-build", () => {
  const scene = new Scene(), reference = new Scene();
  const backend = createMeshPhysics(), baseline = createMeshPhysics();
  const composed = createWorldScene({ ...backend, scene, quality: "High", deferredGround: true });
  const full = createWorldScene({ ...baseline, scene: reference, quality: "High" });
  const meshes = (root: Scene) => root.getObjectByName("ground-details")!.children as InstancedMesh[];
  const snapshot = (root: Scene) => meshes(root).map(mesh => ({
    name: mesh.name, count: mesh.count,
    matrices: Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)),
    colors: Array.from(mesh.instanceColor!.array.slice(0, mesh.count * 3)),
    variants: Array.from(mesh.geometry.getAttribute("groundVariant").array.slice(0, mesh.count)),
    tips: Array.from(mesh.geometry.getAttribute("groundTip").array.slice(0, mesh.count * 3)),
  }));
  try {
    expect(composed.groundReady).toBe(false);
    expect(composed.collisionMeshes.length).toBe(full.collisionMeshes.length);
    const spawn = worldSpawn(), matrix = new Matrix4();
    let initial = 0;
    for (const mesh of meshes(scene)) for (let i = 0; i < mesh.count; i++) {
      initial++;
      mesh.getMatrixAt(i, matrix);
      const point = new Vector3().setFromMatrixPosition(matrix);
      const x = Math.floor(point.x / TILE_SIZE) * TILE_SIZE;
      const z = Math.floor(point.z / TILE_SIZE) * TILE_SIZE;
      expect(Math.hypot(Math.max(x - spawn.x, 0, spawn.x - x - TILE_SIZE),
        Math.max(z - spawn.z, 0, spawn.z - z - TILE_SIZE))).toBeLessThanOrEqual(25);
    }
    expect(initial).toBeGreaterThan(0);
    let steps = 0;
    while (!composed.buildGround.next().done) {
      expect(++steps).toBeLessThan(100000);
      if (steps === 100) composed.setQuality("Balanced");
      if (steps === 101) composed.setQuality("High");
    }
    expect(steps).toBeGreaterThan(1);
    expect(composed.groundReady).toBe(true);
    expect(snapshot(scene)).toEqual(snapshot(reference));
    composed.setQuality("Low"); full.setQuality("Low");
    expect(snapshot(scene)).toEqual(snapshot(reference));
  } finally { composed.dispose(); full.dispose(); }
  const cancelledScene = new Scene();
  const cancelled = createWorldScene({ ...createMeshPhysics(), scene: cancelledScene, quality: "Low", deferredGround: true });
  cancelled.buildGround.next();
  const dispose = vi.spyOn(meshes(cancelledScene)[0]!.geometry, "dispose");
  cancelled.dispose();
  expect(cancelled.buildGround.next().done).toBe(true);
  cancelled.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(cancelledScene.children).toHaveLength(0);
}, 30000);
