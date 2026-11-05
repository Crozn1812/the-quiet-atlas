import { Color, CylinderGeometry, DirectionalLight, Fog, HemisphereLight, Mesh, MeshBasicMaterial, Scene, Vector3, type MeshToonMaterial } from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { createFoliage, foliageVariantAt } from "../foliage/instances";
import { createFoliageColliders, TRUNK_HEIGHT } from "../foliage/colliders";
import { scatterTile, type FoliageTree } from "../foliage/scatter";
import { createGroundDetails, scatterGround, type GroundDetail } from "../foliage/ground";
import { createCrownFade } from "../crown-fade";
import { selectOccludingCrowns } from "../camera";
import { timeOfDayAt } from "../layout/lighting";
import { pathLength } from "../layout/path";
import { ZONES } from "../layout/zones";
import { createRampMaterial, RAMP_PRESETS, RAMP_STEPS } from "../materials/ramp";
import { createSkyDome } from "../sky/dome";
import { lightingAt, type LightingGrade } from "../sky/grade";

const DIRECTED_SKY = {
  dawn: { top: new Color(paletteColor(WORLD_DIRECTION.background.sky.dawn.top)), horizon: new Color(paletteColor(WORLD_DIRECTION.background.sky.dawn.horizon)) },
  dusk: { top: new Color(paletteColor(WORLD_DIRECTION.background.sky.dusk.top)), horizon: new Color(paletteColor(WORLD_DIRECTION.background.sky.dusk.horizon)) },
};
/** Share of the sky horizon in distance fog at dawn/dusk: gold fog over jade sea mixes to olive (B2-031). */
const FOG_HORIZON = { dawn: 1, dusk: 0.25 };
/** Sea mirror of the dusk sky; the bench's coast frame uses 0.35. */
const SEA_SKY_MIX = 0.35;

/** Replace the grade's sky/fog colours with the art direction's, blended by time of day (0 dawn → 1 dusk). */
export function directGrade(grade: LightingGrade, timeOfDay: number): LightingGrade {
  const t = Math.max(0, Math.min(1, timeOfDay));
  grade.skyTop.copy(DIRECTED_SKY.dawn.top).lerp(DIRECTED_SKY.dusk.top, t);
  grade.skyHorizon.copy(DIRECTED_SKY.dawn.horizon).lerp(DIRECTED_SKY.dusk.horizon, t);
  grade.fogColor.set(PALETTE.paper).lerp(grade.skyHorizon, FOG_HORIZON.dawn + (FOG_HORIZON.dusk - FOG_HORIZON.dawn) * t);
  return grade;
}
import { createGradeFollower } from "../sky/smoothing";
import { PRESETS, type Quality } from "../terrain";
import type { TilePhysicsWorld, TileRapier } from "../terrain/collider";
import { createTilePool } from "../terrain/pool";
import { nearestPath } from "../terrain/samples";
import { TILE_SIZE, tileKey } from "../terrain/tiles";
import { HEIGHT } from "../scene";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { createRiverRibbon } from "../water/ribbon";
import { createSea } from "../water/sea";
import { createWaterMaterial } from "../water/material";

/** Height on the rendered/Rapier triangles, including their diagonal and Float32 rounding. */
export function surfaceHeight(x: number, z: number): number {
  const step = 2;
  const x0 = Math.floor(x / step) * step;
  const z0 = Math.floor(z / step) * step;
  const u = (x - x0) / step;
  const v = (z - z0) / step;
  const a = Math.fround(worldHeight(x0, z0));
  const b = Math.fround(worldHeight(x0 + step, z0));
  const c = Math.fround(worldHeight(x0, z0 + step));
  const d = Math.fround(worldHeight(x0 + step, z0 + step));
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export function nearestSafePath(position: { x: number; z: number }): Vector3 {
  const path = nearestPath(position.x, position.z);
  return new Vector3(path.x, surfaceHeight(path.x, path.z) + HEIGHT + 0.02, path.z);
}

export const worldSpawn = () => nearestSafePath(ZONES.find(zone => zone.id === "first-light")!.position);

export function createWorldScene({ RAPIER, world, scene, quality: initialQuality, paper }: {
  RAPIER: TileRapier;
  world: TilePhysicsWorld;
  scene: Scene;
  quality: Quality;
  paper?: { setGrade(grade: LightingGrade): void; setMist(options: { height: number }): void };
}) {
  let quality = initialQuality;
  let disposed = false;
  let elapsed = 0;
  let reducedMotion = false;
  let lastT = -Infinity;
  // Extra streaming reach (m ahead) while the opening cinematic overlooks the river (Lead, B2-043b review).
  let preloadAhead = 0;
  let previousPosition: Vector3 | undefined;
  const terrainMaterial = createRampMaterial(RAMP_PRESETS.terrain, RAMP_STEPS.terrain);
  const pool = createTilePool({ RAPIER, world, material: terrainMaterial });
  const trunkGeometry = new CylinderGeometry(1, 1, 2, 6);
  const trunkMaterial = new MeshBasicMaterial();
  const follower = createGradeFollower(2);
  const sky = createSkyDome();
  const sun = new DirectionalLight();
  const hemisphere = new HemisphereLight();
  const previousFog = scene.fog;
  // Low quality has no paper pass: Three fog carries the same world-scale distances (B2-038).
  const fog = new Fog(PALETTE.paper, WORLD_DIRECTION.background.fog.near, WORLD_DIRECTION.background.fog.far);
  const directed = lightingAt(0);
  scene.fog = fog;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 0.5, far: 120 });
  sun.shadow.bias = -0.001;
  const water = [createRiverRibbon(quality), createSea(quality)];
  const cells = new Map<string, ReturnType<typeof createCell>>();
  // Stable array identity lets the experimental raycast controller follow streaming.
  const collisionMeshes: Mesh[] = [];
  const visibleMeshes: Mesh[] = [];
  const foliageMeshes: Mesh[] = [];
  let streamingError: unknown;
  // B2-047: one shared set of grass/rock instances (<= 5 draw calls) for every resident tile.
  const groundCache = new Map<string, GroundDetail[]>();
  let ground = createGroundDetails(4096);
  let groundCapacity = 4096;
  function syncGround() {
    for (const key of groundCache.keys()) if (!pool.tiles.has(key)) groundCache.delete(key);
    for (const [key, resident] of pool.tiles) if (!groundCache.has(key)) groundCache.set(key, scatterGround(resident.tile));
    const items = [...groundCache.values()].flat();
    if (items.length > groundCapacity) {
      ground.group.removeFromParent();
      ground.dispose();
      groundCapacity = Math.ceil(items.length * 1.5);
      ground = createGroundDetails(groundCapacity);
      scene.add(ground.group);
    }
    ground.setQuality(quality);
    ground.setTiles(items);
  }

  function createCell(trees: FoliageTree[]) {
    const foliage = createFoliage(trees.length);
    // B2-039a: every crown variant shares one material. Each fade hook wraps its material, so give each
    // variant after the first its own clone carrying the pristine ramp hook (never a hook already faded).
    const kinds = ["pine", "broadleaf"] as const;
    const crowns = kinds.flatMap(kind => foliage.species[kind].variants.map((variant, index) => ({ kind, index, mesh: variant.crowns })));
    const shared = crowns[0]!.mesh.material as MeshToonMaterial;
    const pristine = { onBeforeCompile: shared.onBeforeCompile, key: shared.customProgramCacheKey };
    const clones: MeshToonMaterial[] = [];
    for (const { mesh } of crowns.slice(1)) {
      const material = shared.clone();
      material.onBeforeCompile = pristine.onBeforeCompile;
      material.customProgramCacheKey = pristine.key;
      mesh.material = material;
      clones.push(material);
    }
    const fades = crowns.map(({ mesh }) => createCrownFade(mesh, trees.length));
    const colliders: RAPIER.Collider[] = [];
    const trunks: Mesh[] = [];
    let visibleTrees: ReturnType<typeof crownTrees>[] = [];
    // Same order as instances.ts: stratified selection, then per kind and variant.
    function crownTrees(kind: FoliageTree["kind"], variant: number, selected: FoliageTree[]) {
      const count = foliage.species[kind].variants.length;
      return selected.filter(tree => tree.kind === kind && foliageVariantAt(tree.x, tree.z, count) === variant)
        .map(tree => ({ ...tree, height: TRUNK_HEIGHT * tree.scale, radius: 0.28 }));
    }
    function setCellQuality(next: Quality) {
      foliage.setQuality(next);
      const count = Math.round(trees.length * PRESETS[next].density);
      const selected = Array.from({ length: count }, (_, i) => trees[Math.floor((i + 0.5) * trees.length / count)]!);
      visibleTrees = crowns.map(({ kind, index }) => crownTrees(kind, index, selected));
    }
    try {
      for (const trunk of createFoliageColliders(trees)) {
        colliders.push(world.createCollider(RAPIER.ColliderDesc.cylinder(trunk.halfHeight, trunk.radius)
          .setTranslation(trunk.x, trunk.y, trunk.z).setRotation(trunk.rotation)));
        const mesh = new Mesh(trunkGeometry, trunkMaterial);
        mesh.position.set(trunk.x, trunk.y, trunk.z);
        mesh.quaternion.copy(trunk.rotation);
        mesh.scale.set(trunk.radius, trunk.halfHeight, trunk.radius);
        mesh.updateMatrixWorld(true);
        trunks.push(mesh);
      }
      foliage.setTiles(trees);
      setCellQuality(quality);
      scene.add(foliage.group);
    } catch (error) {
      for (const collider of colliders) world.removeCollider(collider, true);
      foliage.dispose();
      for (const material of clones) material.dispose();
      throw error;
    }
    return {
      trunks, foliage, setQuality: setCellQuality,
      fade(camera: Vector3, player: Vector3, dt: number) {
        for (const [index, visible] of visibleTrees.entries()) {
          // The spring arm is <=16 m. Only nearby crowns can cover its sight lines.
          const nearby = visible.map((tree, id) => ({ tree, id }))
            .filter(({ tree }) => Math.hypot(tree.x - camera.x, tree.z - camera.z) <= 24);
          const blocked = selectOccludingCrowns(nearby.map(({ tree }) => tree), camera, player);
          fades[index]!(new Set(blocked.map(id => nearby[id]!.id)), dt);
        }
      },
      dispose() {
        for (const collider of colliders) world.removeCollider(collider, true);
        foliage.dispose();
        for (const material of clones) material.dispose();
      },
    };
  }

  function syncMeshes() {
    collisionMeshes.length = visibleMeshes.length = foliageMeshes.length = 0;
    for (const tile of pool.tiles.values()) {
      collisionMeshes.push(tile.mesh);
      visibleMeshes.push(tile.mesh);
    }
    for (const cell of cells.values()) {
      collisionMeshes.push(...cell.trunks);
      for (const species of Object.values(cell.foliage.species)) {
        for (const variant of species.variants) foliageMeshes.push(variant.trunks, variant.crowns);
      }
    }
    visibleMeshes.push(...foliageMeshes);
  }

  function setQuality(next: Quality) {
    if (disposed) return;
    quality = next;
    for (const cell of cells.values()) cell.setQuality(next);
    ground.setQuality(next);
    for (const surface of water) {
      if (surface.mesh.material.quality === next) continue;
      const previous = surface.mesh.material;
      const material = createWaterMaterial(next, { surface: surface === water[1] ? "sea" : "river" });
      material.setTime(elapsed);
      material.uniforms.uTime!.value = previous.uniforms.uTime!.value;
      material.setReducedMotion(reducedMotion);
      // WaterSurface owns its original material; dispose replacements explicitly below.
      surface.mesh.material = material;
      previous.dispose();
    }
    sun.castShadow = PRESETS[next].shadow > 0;
    sun.shadow.mapSize.setScalar(PRESETS[next].shadow || 512);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const cell of cells.values()) cell.dispose();
    cells.clear();
    pool.dispose();
    ground.group.removeFromParent();
    ground.dispose();
    groundCache.clear();
    terrainMaterial.dispose();
    trunkGeometry.dispose();
    trunkMaterial.dispose();
    for (const surface of water) { surface.mesh.material.dispose(); surface.dispose(); }
    sky.dispose();
    sun.shadow.dispose();
    sun.removeFromParent();
    sun.target.removeFromParent();
    hemisphere.removeFromParent();
    if (scene.fog === fog) scene.fog = previousFog;
    collisionMeshes.length = visibleMeshes.length = foliageMeshes.length = 0;
  }

  function update(player: Vector3, dt: number) {
    if (disposed) return;
    const { t } = nearestPath(player.x, player.z);
    if (Math.abs(t - lastT) * pathLength() >= 8) {
      try {
        pool.update(t, Math.max(120, preloadAhead));
        for (const [key, resident] of pool.tiles) if (!cells.has(key)) cells.set(key, createCell(scatterTile(resident.tile)));
        for (const [key, cell] of cells) if (!pool.tiles.has(key)) { cell.dispose(); cells.delete(key); }
        syncGround();
        lastT = t;
        streamingError = undefined;
      } catch (error) {
        streamingError = error;
        // Pool loads first and retains the preceding walking surface on failure.
        if (!Number.isFinite(lastT)) throw error;
      } finally { syncMeshes(); }
    }
    const target = lightingAt(timeOfDayAt(t));
    const teleport = !previousPosition || previousPosition.distanceTo(player) > 24;
    const followed = teleport ? follower.snap(target) : follower.update(target, dt);
    const tod = timeOfDayAt(t);
    // Copy before directing: the follower keeps its own smoothed state.
    for (const key of ["sunColor", "hemiSky", "hemiGround", "shadowTint"] as const) directed[key].copy(followed[key]);
    directed.sunDirection.copy(followed.sunDirection);
    directed.sunIntensity = followed.sunIntensity;
    directed.hemiIntensity = followed.hemiIntensity;
    const grade = directGrade(directed, tod);
    previousPosition = player.clone();
    sun.color.copy(grade.sunColor);
    sun.intensity = grade.sunIntensity;
    sun.target.position.copy(player);
    sun.position.copy(player).addScaledVector(grade.sunDirection, 50);
    hemisphere.color.copy(grade.hemiSky);
    hemisphere.groundColor.copy(grade.hemiGround);
    hemisphere.intensity = grade.hemiIntensity;
    fog.color.copy(grade.fogColor);
    sky.update(grade);
    paper?.setGrade(grade);
    paper?.setMist({ height: waterLevelAt(player.z) + 1.2 });
    elapsed += dt;
    for (const surface of water) {
      surface.mesh.material.setTime(elapsed);
      surface.mesh.material.setSkyMix(surface === water[1] ? SEA_SKY_MIX * tod : tod);
    }
  }

  scene.add(ground.group, pool.group, sky.mesh, sun, sun.target, hemisphere, ...water.map(surface => surface.mesh));
  try { setQuality(quality); update(worldSpawn(), 0); } catch (error) { dispose(); throw error; }
  return {
    update, setQuality, dispose, sun, collisionMeshes, visibleMeshes, foliageMeshes,
    /** Stream `aheadM` metres of path ahead (0 = normal). Raising it forces a stream on the next update;
     * lowering it lets distant tiles unload on the player's next 8 m of movement (no hitch at handoff). */
    setPreload(aheadM: number) {
      if (disposed || !Number.isFinite(aheadM) || aheadM < 0) return;
      if (aheadM > preloadAhead) lastT = -Infinity;
      preloadAhead = aheadM;
    },
    setReducedMotion(reduced: boolean) {
      if (disposed) return;
      reducedMotion = reduced;
      for (const surface of water) surface.mesh.material.setReducedMotion(reduced);
    },
    get streamingError() { return streamingError; },
    contains(position: { x: number; z: number }) { return pool.tiles.has(tileKey(Math.floor(position.x / TILE_SIZE), Math.floor(position.z / TILE_SIZE))); },
    fadeCrowns(camera: Vector3, player: Vector3, dt: number) {
      for (const cell of cells.values()) cell.fade(camera, player, dt);
    },
  };
}
