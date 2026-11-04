import RAPIER from "@dimforge/rapier3d-compat";
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Fog, HemisphereLight, Mesh, PCFSoftShadowMap,
  PerspectiveCamera, Scene, WebGLRenderer, type MeshToonMaterial,
} from "three";
import { PALETTE } from "../../src/features/world/art/palette";
import { createFoliage } from "../../src/features/world/foliage/instances";
import { scatterTile, type FoliageTree } from "../../src/features/world/foliage/scatter";
import { createRampGradient, createRampMaterial, disposeRampGradients } from "../../src/features/world/materials/ramp";
import { createPaperPass } from "../../src/features/world/post/paper";
import { createSkyDome } from "../../src/features/world/sky/dome";
import { lightingAt } from "../../src/features/world/sky/grade";
import { PRESETS as QUALITY } from "../../src/features/world/terrain";
import { createTileMesh } from "../../src/features/world/terrain/mesh";
import { createTilePool } from "../../src/features/world/terrain/pool";
import { buildTile, TILE_SIZE, tileKey } from "../../src/features/world/terrain/tiles";
import { createRiverRibbon } from "../../src/features/world/water/ribbon";
import { createSea } from "../../src/features/world/water/sea";
import type { WaterSurface } from "../../src/features/world/water/surface";
import { paletteColor, STYLE_PRESETS, type PaletteRecipe, type StylePreset } from "./presets";
import { parseQuery } from "./query";
import { cameraAt, SHOTS, VIDEO_SECONDS } from "./shots";

declare global {
  interface Window { __frameReady: boolean }
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing bench element: ${id}`);
  return found as T;
}

document.documentElement.style.setProperty("--paper", PALETTE.paper);
document.documentElement.style.setProperty("--ink", PALETTE.ink);
window.__frameReady = false;

async function start() {
  const options = parseQuery(window.location.search);
  const canvas = element<HTMLCanvasElement>("frame");
  const overlay = element("overlay");
  const stats = element<HTMLOutputElement>("stats");
  const presetSelect = element<HTMLSelectElement>("preset");
  const shotSelect = element<HTMLSelectElement>("shot");
  const qualitySelect = element<HTMLSelectElement>("quality");
  const timeInput = element<HTMLInputElement>("time");
  const playButton = element<HTMLButtonElement>("play");
  presetSelect.value = options.preset;
  shotSelect.value = options.shot;
  qualitySelect.value = options.quality;
  timeInput.value = String(options.t);
  overlay.hidden = options.clean;

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.type = PCFSoftShadowMap;
  // A paper frame consists of scene + post + shadow work, not only the final triangle.
  renderer.info.autoReset = false;
  const scene = new Scene();
  scene.background = new Color(PALETTE.paper);
  scene.fog = new Fog(PALETTE.paper, 15, 65); // Low's paper-coloured fallback.
  const camera = new PerspectiveCamera(48, 1, 0.1, 320);
  const paper = createPaperPass(renderer, { quality: options.quality });
  const sky = createSkyDome(lightingAt(0), 300);
  scene.add(sky.mesh);
  const sun = new DirectionalLight();
  const hemi = new HemisphereLight();
  scene.add(sun, sun.target, hemi);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -65;
  sun.shadow.camera.right = sun.shadow.camera.top = 65;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0003;

  // Pool requires real collider ownership; WASM is already embedded in the installed package.
  await RAPIER.init();
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const terrainMaterial = createRampMaterial(paletteColor(STYLE_PRESETS[options.preset].background.terrain));
  const pool = createTilePool({ RAPIER, world: physics, material: terrainMaterial });
  scene.add(pool.group);
  const scenery: Mesh[] = [];
  let waters: WaterSurface[] = [];
  function water() {
    for (const surface of waters) surface.dispose();
    waters = [createRiverRibbon(options.quality), createSea(options.quality)];
    for (const surface of waters) { surface.setTime(options.t); scene.add(surface.mesh); }
  }
  let foliage: ReturnType<typeof createFoliage> | undefined;
  let candidates: FoliageTree[] = [];
  let frames = 0;
  let playing = false;
  let playStart: number | undefined;
  let animation = 0;
  let disposed = false;
  const frameTimes: number[] = [];

  function invalidate() {
    window.__frameReady = false;
    frames = 0;
    frameTimes.length = 0;
  }

  function stop() {
    playing = false;
    playStart = undefined;
    playButton.textContent = "Chạy 18 s";
  }

  function setCamera() {
    const frame = cameraAt(options.shot, options.t);
    for (const surface of waters) surface.setTime(options.t); // deterministic flow per frame time
    camera.position.copy(frame.position);
    camera.lookAt(frame.target);
    return frame;
  }

  function ramp(material: MeshToonMaterial, color: PaletteRecipe, settings: StylePreset["foliage"]["ramp"]) {
    material.color.setHex(paletteColor(color));
    material.gradientMap = createRampGradient(settings.steps, settings.soft);
    material.needsUpdate = true;
  }

  function style() {
    const preset = STYLE_PRESETS[options.preset];
    ramp(terrainMaterial, preset.background.terrain, preset.background.ramp);
    if (foliage) {
      for (const species of Object.values(foliage.species)) {
        ramp(species.crowns.material, preset.foliage.crown, preset.foliage.ramp);
        ramp(species.trunks.material, preset.foliage.trunk, preset.foliage.ramp);
      }
    }
    const grade = lightingAt(SHOTS[options.shot].timeOfDay);
    const skyColors = preset.background.sky[options.shot === "forest-dawn" ? "dawn" : "dusk"];
    grade.skyTop.setHex(paletteColor(skyColors.top));
    grade.skyHorizon.setHex(paletteColor(skyColors.horizon));
    sky.update(grade);
    sun.color.copy(grade.sunColor);
    sun.intensity = grade.sunIntensity;
    const center = cameraAt(options.shot, 0).position;
    sun.position.copy(center).addScaledVector(grade.sunDirection, 70);
    sun.target.position.copy(center);
    hemi.color.copy(grade.hemiSky);
    hemi.groundColor.copy(grade.hemiGround);
    hemi.intensity = grade.hemiIntensity;
    paper.setEdges(preset.background.edges);
    paper.setFog(preset.background.fog);
    if (scene.fog instanceof Fog) { scene.fog.near = preset.background.fog.near; scene.fog.far = preset.background.fog.far; }
    paper.setMist({ ...preset.background.mist, height: setCamera().mistHeight });
    invalidate();
  }

  function trees() {
    if (!foliage) return;
    const density = STYLE_PRESETS[options.preset].foliage.density;
    // Nested deterministic subsets keep retained trees at identical positions across A/B/C.
    foliage.setTiles(candidates.filter((_, index) => ((index * 2654435761) >>> 0) / 4294967296 < density));
    foliage.setQuality(options.quality);
  }

  function buildScene() {
    foliage?.dispose();
    for (const mesh of scenery) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    scenery.length = 0;
    pool.update(SHOTS[options.shot].pathT, 150, 65);
    // Fill lateral views beyond the walking corridor, using the same tile/mesh factories.
    // This also supplies the bare coast while water is pending; never fake an ocean shader.
    const center = cameraAt(options.shot).position;
    const ix = Math.floor(center.x / TILE_SIZE);
    const iz = Math.floor(center.z / TILE_SIZE);
    for (let x = ix - 2; x <= ix + 2; x++) for (let z = iz - 2; z <= iz + 2; z++) {
      if (pool.tiles.has(tileKey(x, z))) continue;
      const mesh = createTileMesh(buildTile(x, z), terrainMaterial);
      scenery.push(mesh);
      scene.add(mesh);
    }
    foliage = createFoliage((pool.tiles.size + scenery.length) * 180);
    scene.add(foliage.group);
    candidates = [...pool.tiles.values(), ...scenery.map(mesh => ({
      ix: mesh.position.x / TILE_SIZE, iz: mesh.position.z / TILE_SIZE,
    }))].flatMap(address => scatterTile(address));
    trees();
    camera.fov = SHOTS[options.shot].fov;
    camera.updateProjectionMatrix();
    style();
    water();
  }

  function resize() {
    const quality = QUALITY[options.quality];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
    paper.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    invalidate();
  }

  function quality() {
    const size = QUALITY[options.quality].shadow;
    renderer.shadowMap.enabled = size > 0;
    sun.castShadow = size > 0;
    if (size > 0) sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    paper.setQuality(options.quality);
    foliage?.setQuality(options.quality);
    water(); // quality changes the water shader defines
    resize();
  }

  function togglePlay() {
    if (playing) { stop(); return; }
    options.t = 0;
    timeInput.value = "0";
    playing = true;
    playStart = undefined;
    playButton.textContent = "Dừng";
    invalidate();
  }

  function reset() {
    stop();
    options.t = 0;
    timeInput.value = "0";
    setCamera();
    invalidate();
  }

  presetSelect.addEventListener("change", () => {
    stop();
    options.preset = parseQuery(`preset=${presetSelect.value}`).preset;
    trees();
    style();
  });
  shotSelect.addEventListener("change", () => {
    reset();
    options.shot = parseQuery(`shot=${shotSelect.value}`).shot;
    buildScene();
  });
  qualitySelect.addEventListener("change", () => {
    stop();
    options.quality = parseQuery(`quality=${qualitySelect.value}`).quality;
    quality();
    style();
  });
  timeInput.addEventListener("input", () => {
    stop();
    options.t = parseQuery(`t=${timeInput.value}`).t;
    setCamera();
    invalidate();
  });
  playButton.addEventListener("click", togglePlay);
  element("reset").addEventListener("click", reset);
  function keydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLElement && event.target.matches("input, select")) return;
    if (event.code === "Space" && event.target instanceof HTMLButtonElement) return;
    if (event.code === "Space") { event.preventDefault(); togglePlay(); }
    if (event.code === "KeyR") reset();
    if (event.code === "KeyH") overlay.hidden = !overlay.hidden;
  }
  window.addEventListener("keydown", keydown);
  window.addEventListener("resize", resize);

  buildScene();
  quality();
  function render(now: number) {
    if (disposed) return;
    // Warm up three stationary frames before starting an in-memory video run.
    if (playing && window.__frameReady) {
      playStart ??= now;
      options.t = Math.min(VIDEO_SECONDS, (now - playStart) / 1000);
      timeInput.value = options.t.toFixed(2);
      if (options.t >= VIDEO_SECONDS) stop();
    }
    setCamera();
    renderer.info.reset();
    paper.render(scene, camera);
    if (++frames >= 3) window.__frameReady = true;
    frameTimes.push(now);
    while (frameTimes.length > 1 && frameTimes[0]! < now - 2000) frameTimes.shift();
    const elapsed = now - frameTimes[0]!;
    const fps = elapsed > 0 ? (frameTimes.length - 1) * 1000 / elapsed : 0;
    if (!overlay.hidden) {
      stats.textContent = `${options.preset} / ${options.shot} / ${options.quality}\n${options.t.toFixed(2)} s · FPS (2 s): ${fps.toFixed(1)} · draw calls: ${renderer.info.render.calls}`;
      stats.style.whiteSpace = "pre-line";
    }
    animation = requestAnimationFrame(render);
  }
  animation = requestAnimationFrame(render);

  window.addEventListener("pagehide", () => {
    disposed = true;
    window.__frameReady = false;
    cancelAnimationFrame(animation);
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("resize", resize);
    foliage?.dispose();
    for (const surface of waters) surface.dispose();
    pool.dispose();
    for (const mesh of scenery) mesh.geometry.dispose();
    terrainMaterial.dispose();
    sky.dispose();
    paper.dispose();
    sun.dispose();
    physics.free();
    disposeRampGradients();
    renderer.dispose();
  }, { once: true });
}

void start().catch(error => {
  window.__frameReady = false;
  const message = element("error");
  message.hidden = false;
  message.textContent = `Không dựng được style frame: ${error instanceof Error ? error.message : String(error)}`;
});
