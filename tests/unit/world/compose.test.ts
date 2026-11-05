import { WORLD_DIRECTION } from "../../../src/features/world/art/direction";
import { afterEach, expect, it, vi } from "vitest";
import { BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, Scene, Vector3 } from "three";
import { createWorldScene, directGrade, nearestSafePath, surfaceHeight, worldSpawn } from "../../../src/features/world/scene/compose";
import { createController } from "../../../src/features/world/rapier";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";
import { createGradedPaperPass } from "../../../src/features/world/scene/paper";
import { createFoliageColliders } from "../../../src/features/world/foliage/colliders";
import { scatterTile } from "../../../src/features/world/foliage/scatter";
import { pathLength, pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { lightingAt } from "../../../src/features/world/sky/grade";
import { tilesToLoad } from "../../../src/features/world/terrain/streaming";
import { TILE_SIZE, tileKey } from "../../../src/features/world/terrain/tiles";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";
import { HEIGHT } from "../../../src/features/world/scene";
import { FIXED_DT } from "../../../src/features/world/timestep";
import { PALETTE } from "../../../src/features/world/art/palette";

afterEach(() => { disposeRampGradients(); vi.restoreAllMocks(); });

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
    // B2-038: sky/fog colours come from art direction C, blended by time of day.
    expect(paper.setGrade.mock.lastCall![0].fogColor).toEqual(directGrade(lightingAt(0), timeOfDayAt(0.95)).fogColor);
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
  backend.world.createCollider = () => { throw new Error("initial allocation failed"); };
  expect(() => createWorldScene({ ...backend, scene, quality: "Balanced" })).toThrow("initial allocation failed");
  expect(scene.children).toHaveLength(0);
  // Failed tile, sky, river, sea and the shared camera trunk geometry.
  expect(geometryDispose).toHaveBeenCalledTimes(10); // +5 ground-detail variants (B2-047)
  expect(materialDispose).toHaveBeenCalledTimes(6); // +1 shared ground material (B2-047)
});

it("grades paper fog without changing the paper pigment, across Low and High reallocations", async () => {
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
  const paper = createGradedPaperPass(renderer, "Balanced");
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
