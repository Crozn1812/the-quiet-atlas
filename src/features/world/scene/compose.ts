import { Color, CylinderGeometry, DirectionalLight, Fog, HemisphereLight, Mesh, MeshBasicMaterial, Scene, Vector3, type Box3, type MeshToonMaterial } from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { fogAt, paletteColor, WORLD_DIRECTION } from "../art/direction";
import { PALETTE } from "../art/palette";
import { bindFirstLightGround, createFirstLightGrove, firstLightGroveWeight, inFirstLightGrove } from "../foliage/first-light-grove";
import { createFoliage, foliageVariantAt } from "../foliage/instances";
import { createForestR1Trees, forestR1Weight } from "../foliage/forest-r1";
import { bindCoastR1Ground, createCoastR1Trees, isCoastR1Tree } from "../foliage/coast-r1";
import { hillR1Weight } from "../foliage/hill-r1";
import { createFoliageColliders, TRUNK_HEIGHT } from "../foliage/colliders";
import { scatterTile, type FoliageTree } from "../foliage/scatter";
import { createGroundDetails, scatterGround, scatterGroundChunks, type GroundDetail } from "../foliage/ground";
import { createGrassField, GRASS_FIELD_RADII } from "../foliage/grass-field";
const createGrassFieldRadius = (quality: keyof typeof GRASS_FIELD_RADII) => GRASS_FIELD_RADII[quality];
import { createCrownFade } from "../crown-fade";
import { selectNearbyOccludingCrowns } from "../camera";
import { timeOfDayAt } from "../layout/lighting";
import { pathLength, pathPointAt } from "../layout/path";
import { ZONES } from "../layout/zones";
import { createRampMaterial, RAMP_PRESETS, RAMP_STEPS } from "../materials/ramp";
import { createCoastMountainMist, createSkyDome } from "../sky/dome";
import { applyCoastAtmosphere, lightingAt, type LightingGrade } from "../sky/grade";

/**
 * B2-155: the mist shelf is authored facing local +Z. Turn it to the coast road's LEFT (the forested ridge, Duy's
 * coast scene Q-37): for walking direction (fx, fz) the left vector is (fz, -fx) in three.js (y up).
 */
export function coastMistYaw(): number {
  const start = pathPointAt(0.82);
  const end = pathPointAt(1);
  const fx = end.x - start.x;
  const fz = end.z - start.z;
  return Math.atan2(fz, -fx);
}

const DIRECTED_SKY = {
  dawn: { top: new Color(paletteColor(WORLD_DIRECTION.background.sky.dawn.top)), horizon: new Color(paletteColor(WORLD_DIRECTION.background.sky.dawn.horizon)) },
  dusk: { top: new Color(paletteColor(WORLD_DIRECTION.background.sky.dusk.top)), horizon: new Color(paletteColor(WORLD_DIRECTION.background.sky.dusk.horizon)) },
};
/** Coloured air follows the same dawn/dusk endpoints as the sky, without a paper wash. */
const FOG_HORIZON = {
  dawn: new Color(paletteColor(WORLD_DIRECTION.background.forest!.color)),
  dusk: DIRECTED_SKY.dusk.top.clone().lerp(DIRECTED_SKY.dusk.horizon, 0.55),
};
/** Sea mirror of the dusk sky; the bench's coast frame uses 0.35. */
const SEA_SKY_MIX = 0.35;
const FIRST_LIGHT_AIR = new Color(PALETTE.skyLow).lerp(new Color(PALETTE.cloud), 0.25);
const FIRST_LIGHT_SKY = new Color(PALETTE.skyHigh).lerp(new Color(PALETTE.cloud), 0.25);
const FIRST_LIGHT_FILL = new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.12);
const FIRST_LIGHT_SUN = new Vector3(-0.65, 0.7, 0.3).normalize();

/** Replace the grade's sky/fog colours with the art direction's, blended by time of day (0 dawn → 1 dusk). */
export function directGrade(grade: LightingGrade, timeOfDay: number, preset = WORLD_DIRECTION): LightingGrade {
  const t = Number.isNaN(timeOfDay) ? 0 : Math.max(0, Math.min(1, timeOfDay));
  if (preset !== WORLD_DIRECTION) {
    const { dawn, dusk } = preset.background.sky;
    grade.skyTop.setHex(paletteColor(dawn.top)).lerp(new Color(paletteColor(dusk.top)), t);
    grade.skyHorizon.setHex(paletteColor(dawn.horizon)).lerp(new Color(paletteColor(dusk.horizon)), t);
    grade.fogColor.set(PALETTE.paper).lerp(grade.skyHorizon, 1 - 0.75 * t);
    return grade;
  }
  grade.skyTop.copy(DIRECTED_SKY.dawn.top).lerp(DIRECTED_SKY.dusk.top, t);
  grade.skyHorizon.copy(DIRECTED_SKY.dawn.horizon).lerp(DIRECTED_SKY.dusk.horizon, t);
  grade.fogColor.copy(FOG_HORIZON.dawn).lerp(FOG_HORIZON.dusk, t);
  return grade;
}
import { createGradeFollower } from "../sky/smoothing";
import { PRESETS, type Quality } from "../terrain";
import type { TilePhysicsWorld, TileRapier } from "../terrain/collider";
import { createTilePool } from "../terrain/pool";
import { bindTerrainDetail } from "../terrain/detail";
import { nearestPath } from "../terrain/samples";
import { TILE_SIZE, tileKey } from "../terrain/tiles";
import { HEIGHT } from "../scene";
import { waterLevelAt, worldHeight } from "../terrain/height";
import { createSpring } from "../terrain/spring";
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

export function createWorldScene({ RAPIER, world, scene, quality: initialQuality, paper, zoneBounds = [], zoneBoxes = [], deferredGround = false }: {
  deferredGround?: boolean;
  zoneBounds?: readonly Box3[];
  zoneBoxes?: readonly Mesh[];
  RAPIER: TileRapier;
  world: TilePhysicsWorld;
  scene: Scene;
  quality: Quality;
  paper?: { setGrade(grade: LightingGrade): void; setMist(options: { height: number }): void; setFog?(options: { near: number; far: number }): void };
}) {
  let quality = initialQuality;
  let disposed = false;
  let elapsed = 0;
  let reducedMotion = false;
  // B2-214: near-camera grass field (hill/coast); rebuilt when its quality radius changes.
  let grass: ReturnType<typeof createGrassField> | undefined;
  let lastT = -Infinity;
  // Extra streaming reach (m ahead) while the opening cinematic overlooks the river (Lead, B2-043b review).
  let preloadAhead = 0;
  let previousPosition: Vector3 | undefined;
  let projectedX = NaN, projectedZ = NaN, projectedT = 0;
  let deferredGrass = deferredGround;
  let firstFrameDrawn = !deferredGround;
  const previousAfterRender = scene.onAfterRender;
  const afterRender: typeof scene.onAfterRender = (...args) => {
    previousAfterRender.apply(scene, args);
    firstFrameDrawn = true;
  };
  if (deferredGround) scene.onAfterRender = afterRender;
  let springInReach = true, groveInReach = true;
  const spring = createSpring();
  const springColliders: RAPIER.Collider[] = [];
  const terrainMaterial = createRampMaterial(RAMP_PRESETS.terrain, RAMP_STEPS.terrain);
  // B2-165: terrain colour now lives in the tile vertex colours (grass/rock/sand); a tinted base would double it.
  terrainMaterial.color.setRGB(1, 1, 1);
  bindFirstLightGround(terrainMaterial);
  bindCoastR1Ground(terrainMaterial);
  const terrainDetail = bindTerrainDetail(scene, terrainMaterial, quality, error => { streamingError = error; }, deferredGround);
  const pool = createTilePool({ RAPIER, world, material: terrainMaterial });
  const trunkGeometry = new CylinderGeometry(1, 1, 2, 6);
  const trunkMaterial = new MeshBasicMaterial();
  const follower = createGradeFollower(2);
  const sky = createSkyDome();
  const coastMist = createCoastMountainMist();
  coastMist.mesh.rotation.y = coastMistYaw();
  const sun = new DirectionalLight();
  const hemisphere = new HemisphereLight();
  const previousFog = scene.fog;
  // Low quality has no paper pass: Three fog carries the same world-scale distances (B2-038).
  const fog = new Fog(PALETTE.paper, WORLD_DIRECTION.background.fog.near, WORLD_DIRECTION.background.fog.far);
  const directed = lightingAt(0);
  scene.fog = fog;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 0.5, far: 120 });
  sun.shadow.bias = -0.001;
  // Three's default PCF uses a five-tap disk; widen it without larger maps or extra passes.
  sun.shadow.radius = 2.5;
  const water = [createRiverRibbon(quality), createSea(quality), ...spring.surfaces];
  const cells = new Map<string, ReturnType<typeof createCell>>();
  // Stable array identity lets the experimental raycast controller follow streaming.
  const collisionMeshes: Mesh[] = [];
  const visibleMeshes: Mesh[] = [];
  const foliageMeshes: Mesh[] = [];
  let streamingError: unknown;
  // B2-047: one shared set of grass/rock instances (<= 5 draw calls) for every resident tile.
  const groundCache = new Map<string, GroundDetail[]>();
  let zoneBoundsCount = zoneBounds.length;
  let ground = createGroundDetails(4096);
  let groundCapacity = 4096;
  const clearOfZones = (point: { x: number; z: number }) => !zoneBounds.some(box =>
    point.x >= box.min.x && point.x <= box.max.x && point.z >= box.min.z && point.z <= box.max.z);
  const clearOfGroveGround = (point: { x: number; z: number }) => clearOfZones(point) && !inFirstLightGrove(point.x, point.z);
  // A leaning trunk collider is centred off its root (colliders.ts): keep both the root and that centre clear.
  const treeClearOfZones = (tree: FoliageTree) => !inFirstLightGrove(tree.x, tree.z) && clearOfZones(tree)
    && clearOfZones({ x: tree.x - Math.sin(tree.lean) * TRUNK_HEIGHT * tree.scale / 2, z: tree.z });
  let grove = createFirstLightGrove(surfaceHeight, zoneBounds, deferredGround);
  const groveColliders: RAPIER.Collider[] = [];
  scene.add(grove.group);
  let groundRevision = 0;
  function syncGround() {
    const build = syncGroundChunks();
    while (!build.next().done) { /* synchronous compatibility API */ }
  }
  function* syncGroundChunks(): Generator<void> {
    const revision = ++groundRevision;
    for (const key of groundCache.keys()) if (!pool.tiles.has(key)) groundCache.delete(key);
    for (const [key, resident] of pool.tiles) if (!groundCache.has(key) && !deferredGround) groundCache.set(key, scatterGround(resident.tile).filter(clearOfGroveGround));
    const items = [...pool.tiles.keys()].flatMap(key => groundCache.get(key) ?? []);
    if (items.length > groundCapacity) {
      ground.group.removeFromParent();
      ground.dispose();
      groundCapacity = Math.ceil(items.length * 1.5);
      ground = createGroundDetails(groundCapacity);
      scene.add(ground.group);
    }
    ground.setQuality(quality);
    const build = ground.setTilesChunks(items);
    let step = build.next();
    while (!step.done) {
      yield;
      if (disposed || revision !== groundRevision) { build.return(undefined); return; }
      step = build.next();
    }
  }

  function createCell(allTrees: FoliageTree[]) {
    const forestTrees: FoliageTree[] = [], coastTrees: FoliageTree[] = [], trees: FoliageTree[] = [];
    for (const tree of allTrees) {
      if (isCoastR1Tree(tree)) { coastTrees.push(tree); continue; }
      const t = nearestPath(tree.x, tree.z).t;
      const weight = forestR1Weight(tree.x, tree.z, t) + hillR1Weight(t);
      const r1 = foliageVariantAt(tree.x + 17.3, tree.z - 9.1, 1000) / 1000 < weight;
      (r1 ? forestTrees : trees).push(tree);
    }
    const forest = createForestR1Trees(forestTrees);
    const coast = coastTrees.length ? createCoastR1Trees(coastTrees) : undefined;
    const foliage = trees.length ? createFoliage(trees.length) : undefined;
    // B2-039a: every crown variant shares one material. Each fade hook wraps its material, so give each
    // variant after the first its own clone carrying the pristine ramp hook (never a hook already faded).
    const kinds = ["pine", "broadleaf"] as const;
    const crowns = kinds.flatMap(kind => (foliage?.species[kind].variants ?? []).map((variant, index) => ({ kind, index, mesh: variant.crowns })));
    const shared = crowns[0]?.mesh.material as MeshToonMaterial | undefined;
    const pristine = shared && { onBeforeCompile: shared.onBeforeCompile, key: shared.customProgramCacheKey };
    const clones: MeshToonMaterial[] = [];
    for (const { mesh } of crowns.slice(1)) {
      const material = shared!.clone();
      material.onBeforeCompile = pristine!.onBeforeCompile;
      material.customProgramCacheKey = pristine!.key;
      mesh.material = material;
      clones.push(material);
    }
    const fades = crowns.map(({ mesh }) => createCrownFade(mesh, trees.length));
    const colliders: RAPIER.Collider[] = [];
    const trunks: Mesh[] = [];
    let visibleTrees: ReturnType<typeof crownTrees>[] = [];
    // Same order as instances.ts: stratified selection, then per kind and variant.
    function crownTrees(kind: FoliageTree["kind"], variant: number, selected: FoliageTree[]) {
      const count = foliage!.species[kind].variants.length;
      return selected.filter(tree => tree.kind === kind && foliageVariantAt(tree.x, tree.z, count) === variant)
        .map(tree => ({ ...tree, height: TRUNK_HEIGHT * tree.scale, radius: 0.28 }));
    }
    function setCellQuality(next: Quality) {
      forest.setQuality(next);
      coast?.setQuality(next);
      foliage?.setQuality(next);
      const count = Math.round(trees.length * PRESETS[next].density);
      const selected = Array.from({ length: count }, (_, i) => trees[Math.floor((i + 0.5) * trees.length / count)]!);
      visibleTrees = crowns.map(({ kind, index }) => crownTrees(kind, index, selected));
    }
    try {
      for (const trunk of createFoliageColliders(allTrees)) {
        colliders.push(world.createCollider(RAPIER.ColliderDesc.cylinder(trunk.halfHeight, trunk.radius)
          .setTranslation(trunk.x, trunk.y, trunk.z).setRotation(trunk.rotation)));
        const mesh = new Mesh(trunkGeometry, trunkMaterial);
        mesh.position.set(trunk.x, trunk.y, trunk.z);
        mesh.quaternion.copy(trunk.rotation);
        mesh.scale.set(trunk.radius, trunk.halfHeight, trunk.radius);
        mesh.updateMatrixWorld(true);
        trunks.push(mesh);
      }
      foliage?.setTiles(trees);
      setCellQuality(quality);
      if (foliage) scene.add(foliage.group);
      scene.add(forest.group);
      if (coast) scene.add(coast.group);
    } catch (error) {
      for (const collider of colliders) world.removeCollider(collider, true);
      foliage?.dispose();
      forest.dispose();
      coast?.dispose();
      for (const material of clones) material.dispose();
      throw error;
    }
    return {
      trees: allTrees, trunks, foliage, forest, coast, setQuality: setCellQuality,
      fade(camera: Vector3, player: Vector3, dt: number) {
        forest.fade(camera, player, dt);
        coast?.fade(camera, player, dt);
        for (const [index, visible] of visibleTrees.entries()) {
          // The spring arm is <=16 m. Only nearby crowns can cover its sight lines.
          fades[index]!(new Set(selectNearbyOccludingCrowns(visible, camera, player)), dt);
        }
      },
      dispose() {
        for (const collider of colliders) world.removeCollider(collider, true);
        foliage?.dispose();
        forest.dispose();
        coast?.dispose();
        for (const material of clones) material.dispose();
      },
    };
  }

  function syncMeshes() {
    collisionMeshes.length = visibleMeshes.length = foliageMeshes.length = 0;
    collisionMeshes.push(...zoneBoxes);
    // These authored solids stay in Rapier, but distant camera/vehicle rays
    // cannot reach them. Avoid ray-testing the entire grove in later zones.
    if (groveInReach) collisionMeshes.push(...grove.trunks);
    if (springInReach) collisionMeshes.push(spring.cliff);
    visibleMeshes.push(...grove.meshes);
    for (const tile of pool.tiles.values()) {
      collisionMeshes.push(tile.mesh);
      visibleMeshes.push(tile.mesh);
    }
    for (const cell of cells.values()) {
      collisionMeshes.push(...cell.trunks);
      foliageMeshes.push(...cell.forest.meshes);
      if (cell.coast) foliageMeshes.push(...cell.coast.meshes);
      for (const species of Object.values(cell.foliage?.species ?? {})) {
        for (const variant of species.variants) foliageMeshes.push(variant.trunks, variant.crowns);
      }
    }
    visibleMeshes.push(...foliageMeshes);
  }

  function setQuality(next: Quality) {
    if (disposed) return;
    quality = next;
    terrainDetail.setQuality(next);
    grove.setQuality(next);
    groundRevision++;
    for (const cell of cells.values()) cell.setQuality(next);
    ground.setQuality(next);
    if (!grass || grass.radius !== createGrassFieldRadius(next)) {
      grass?.group.removeFromParent(); grass?.dispose();
      grass = createGrassField(next, zoneBounds);
      grass.group.visible = !deferredGrass;
      scene.add(grass.group);
    }
    for (const surface of water) {
      if (surface.mesh.material.quality === next) continue;
      const previous = surface.mesh.material;
      const material = createWaterMaterial(next, { surface: surface === water[1] ? "sea" : "river" });
      material.setTime(elapsed);
      material.uniforms.uTime!.value = previous.uniforms.uTime!.value;
      material.setReducedMotion(reducedMotion);
      // B2-154: the sea's sampled coastline (foam) and sun direction survive a quality change.
      for (const key of ["uShoreBounds", "uShoreZ", "uHasShore", "uSunDirection"]) {
        const from = previous.uniforms[key];
        const to = material.uniforms[key];
        if (!from || !to) continue;
        to.value = typeof from.value?.clone === "function" ? from.value.clone()
          : Array.isArray(from.value) ? [...from.value] : from.value;
      }
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
    if (scene.onAfterRender === afterRender) scene.onAfterRender = previousAfterRender;
    for (const cell of cells.values()) cell.dispose();
    cells.clear();
    grove.dispose();
    spring.dispose();
    for (const collider of springColliders) world.removeCollider(collider, true);
    for (const collider of groveColliders) world.removeCollider(collider, true);
    pool.dispose();
    ground.group.removeFromParent();
    ground.dispose();
    grass?.group.removeFromParent();
    grass?.dispose();
    groundCache.clear();
    terrainDetail.dispose();
    terrainMaterial.dispose();
    trunkGeometry.dispose();
    trunkMaterial.dispose();
    for (const surface of water) { surface.mesh.material.dispose(); surface.dispose(); }
    sky.dispose();
    coastMist.dispose();
    sun.shadow.dispose();
    sun.removeFromParent();
    sun.target.removeFromParent();
    hemisphere.removeFromParent();
    if (scene.fog === fog) scene.fog = previousFog;
    collisionMeshes.length = visibleMeshes.length = foliageMeshes.length = 0;
  }

  function update(player: Vector3, dt: number) {
    if (disposed) return;
    // Deferred zones append bounds. Rebuild only foliage cells that now overlap their solids;
    // filtering cached ground preserves the synchronous scatter order and instance selection.
    if (zoneBounds.length !== zoneBoundsCount) {
      // A deferred solid may also cover an authored trunk. Stage its replacement before
      // releasing the current grove, so a partial collider failure retains safe ground.
      if (grove.sites.some(tree => zoneBounds.some(b => tree.x > b.min.x - 1 && tree.x < b.max.x + 1 && tree.z > b.min.z - 1 && tree.z < b.max.z + 1))) {
        const replacement = createFirstLightGrove(surfaceHeight, zoneBounds);
        const staged: RAPIER.Collider[] = [];
        try {
          for (const tree of replacement.sites) staged.push(world.createCollider(RAPIER.ColliderDesc.cylinder(2.6 * tree.scale, 0.45)
            .setTranslation(tree.x, tree.y + 2.6 * tree.scale, tree.z)));
        } catch (error) {
          for (const collider of staged) world.removeCollider(collider, true);
          replacement.dispose(); streamingError = error; return;
        }
        grove.dispose();
        for (const collider of groveColliders) world.removeCollider(collider, true);
        groveColliders.splice(0, groveColliders.length, ...staged);
        grove = replacement; grove.setQuality(quality); scene.add(grove.group);
      }
      for (const [key, cell] of cells) if (cell.trees.some(tree => !treeClearOfZones(tree))) {
        cell.dispose(); cells.delete(key);
      }
      // Ground scatter has ratio caps (e.g. flowers per item), so it is scattered without zone boxes and
      // filtered here: a late zone then matches bounds supplied up front exactly (B2-197 parity).
      for (const [key, items] of groundCache) groundCache.set(key, items.filter(clearOfGroveGround));
      // Grass cells sampled before the late zone keep stale blades: resample from scratch (~0.5 ms).
      if (grass) { grass.group.removeFromParent(); grass.dispose(); grass = createGrassField(quality, zoneBounds); scene.add(grass.group); }
      zoneBoundsCount = zoneBounds.length;
      lastT = -Infinity;
    }
    // Idle frames (including camera turns) reuse the exact route projection.
    // No quantization: any horizontal movement still recomputes the grade/streaming position.
    if (player.x !== projectedX || player.z !== projectedZ) {
      projectedT = nearestPath(player.x, player.z).t;
      projectedX = player.x; projectedZ = player.z;
    }
    const t = projectedT;
    // The authored grove already owns every nearby tree/collider inside 48 m.
    // At its protected 18 m centre, remote legacy foliage can join after input
    // becomes available. Leaving that centre forces synchronous collision parity.
    const deferTrees = deferredGround && firstLightGroveWeight(player.x, player.z) === 1;
    if (!deferTrees && deferredGrass) {
      deferredGrass = false;
      if (grass) grass.group.visible = true;
    }
    if (deferredGround && !deferTrees && [...pool.tiles.keys()].some(key => !cells.has(key))) lastT = -Infinity;
    const anchor = ZONES[0]!.position;
    const nearGrove = (player.x - anchor.x) ** 2 + (player.z - anchor.z) ** 2 < 160 ** 2;
    const nearSpring = (player.x - spring.origin.x) ** 2 + (player.z - spring.origin.z) ** 2 < 160 ** 2;
    if (nearGrove !== groveInReach || nearSpring !== springInReach) {
      groveInReach = nearGrove; springInReach = nearSpring; syncMeshes();
    }
    grove.group.visible = (player.x - anchor.x) ** 2 + (player.z - anchor.z) ** 2 < 240 ** 2;
    spring.group.visible = player.distanceToSquared(spring.origin) < 240 ** 2;
    if (Math.abs(t - lastT) * pathLength() >= 8) {
      try {
        pool.update(t, Math.max(120, preloadAhead));
        for (const [key, resident] of pool.tiles) if (!cells.has(key) && !deferTrees) cells.set(key, createCell(scatterTile(resident.tile).filter(treeClearOfZones)));
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
    const grade = applyCoastAtmosphere(directGrade(directed, tod), t);
    const clearing = forestR1Weight(player.x, player.z, t);
    grade.fogColor.lerp(FIRST_LIGHT_AIR, clearing);
    grade.skyTop.lerp(FIRST_LIGHT_SKY, clearing);
    grade.skyHorizon.lerp(FIRST_LIGHT_AIR, clearing);
    grade.hemiSky.lerp(FIRST_LIGHT_FILL, clearing * 0.7);
    grade.sunDirection.lerp(FIRST_LIGHT_SUN, clearing).normalize();
    grade.sunIntensity += (2.0 - grade.sunIntensity) * clearing;
    grade.hemiIntensity += (1.25 - grade.hemiIntensity) * clearing;
    if (previousPosition) previousPosition.copy(player);
    else previousPosition = player.clone();
    sun.color.copy(grade.sunColor);
    sun.intensity = grade.sunIntensity;
    sun.target.position.copy(player);
    sun.position.copy(player).addScaledVector(grade.sunDirection, 50);
    hemisphere.color.copy(grade.hemiSky);
    hemisphere.groundColor.copy(grade.hemiGround);
    hemisphere.intensity = grade.hemiIntensity;
    fog.color.copy(grade.fogColor);
    // AD r3: use the same biome distances for native fog and the High/Balanced paper pass.
    const distances = fogAt(t);
    fog.near = distances.near + (60 - distances.near) * clearing;
    fog.far = distances.far + (180 - distances.far) * clearing;
    // The whole dawn biome shares the prototype's clear air; fade over the biome boundary.
    distances.near = fog.near;
    distances.far = fog.far;
    if (distances.forestWeight !== undefined) distances.forestWeight *= 1 - clearing;
    paper?.setFog?.(distances);
    // B2-162: clouds drift with dt and stop under reduced motion.
    sky.update(grade, dt, reducedMotion);
    coastMist.update(t, player, grade);
    paper?.setGrade(grade);
    paper?.setMist({ height: waterLevelAt(player.z) + 1.2 });
    elapsed += dt;
    grass?.update(player.x, player.z, elapsed, reducedMotion);
    for (const surface of water) {
      surface.mesh.material.setGrade(grade);
      surface.mesh.material.setTime(elapsed);
      surface.mesh.material.setSkyMix(surface === water[1] ? SEA_SKY_MIX * tod : tod);
    }
  }

  scene.add(ground.group, pool.group, sky.mesh, coastMist.mesh, sun, sun.target, hemisphere, ...water.map(surface => surface.mesh));
  try {
    scene.add(spring.group);
    for (const solid of spring.colliders) springColliders.push(world.createCollider(
      RAPIER.ColliderDesc.cylinder(solid.halfHeight, solid.radius)
        .setTranslation(solid.center.x, solid.center.y, solid.center.z)));
    for (const tree of grove.sites) groveColliders.push(world.createCollider(RAPIER.ColliderDesc.cylinder(2.6 * tree.scale, 0.45)
      .setTranslation(tree.x, tree.y + 2.6 * tree.scale, tree.z)));
    setQuality(quality); update(worldSpawn(), 0);
  } catch (error) { dispose(); throw error; }
  return {
    update, setQuality, dispose, sun, collisionMeshes, visibleMeshes, foliageMeshes,
    loadTerrainDetail: terrainDetail.ready,
    /** Owned and cancelled by the post-control dressing queue. */
    get groundReady() { return !deferredGround; },
    buildGround: (function* (): Generator<void> {
      // Dressing can be pumped before paper.render in the very first RAF.
      // Wait for an actual scene draw, rather than merely yielding once.
      while (!firstFrameDrawn && !disposed) yield;
      if (disposed) return;
      terrainDetail.resume();
      deferredGrass = false;
      if (grass) grass.group.visible = true;
      while (!disposed) {
        const missing = [...pool.tiles].find(([key]) => !cells.has(key));
        if (!missing) break;
        yield;
        if (disposed) return;
        const [key, resident] = missing;
        if (pool.tiles.get(key) === resident && !cells.has(key)) {
          cells.set(key, createCell(scatterTile(resident.tile).filter(treeClearOfZones)));
          syncMeshes();
        }
      }
      yield* grove.buildGround;
      while (!disposed) {
        const missing = [...pool.tiles].find(([key]) => !groundCache.has(key));
        if (!missing) {
          yield* syncGroundChunks();
          if (disposed) return;
          if ([...pool.tiles.keys()].some(key => !groundCache.has(key))) continue;
          deferredGround = false;
          return;
        }
        const [key, resident] = missing;
        const build = scatterGroundChunks(resident.tile);
        let step = build.next();
        while (!step.done) {
          yield;
          if (disposed) { build.return([]); return; }
          step = build.next();
        }
        if (pool.tiles.get(key) === resident) groundCache.set(key, step.value.filter(clearOfGroveGround));
        const publish = syncGroundChunks();
        let publication = publish.next();
        while (!publication.done) {
          yield;
          if (disposed) { publish.return(undefined); return; }
          publication = publish.next();
        }
        yield;
      }
    })(),
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
