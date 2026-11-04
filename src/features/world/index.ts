import { WORLD_COPY, isWorldLocale, type WorldLocale } from "./copy";
import { initialAdaptive, sampleQuality, selectManualQuality } from "./adaptive-quality";
import { createInteraction, type InteractionTarget } from "../interaction/targets";
import { BoxGeometry } from "three";
import { clampZoom, wrapYaw, springArm, selectOccludingCrowns, INITIAL_ZOOM, CAMERA_PITCH, CAMERA_CLEARANCE, KEY_YAW_SPEED, POINTER_YAW_SPEED, WHEEL_ZOOM_SPEED } from "./camera";
import { createCrownFade } from "./crown-fade";
import { createLocomotion } from "./locomotion";
import { createTerrain, createTerrainMesh, createTrees, createForest, updateForest, terrainHeight, PRESETS, type Quality } from "./terrain";
import { inputReducer, isInputTarget, type InputAction } from "../interaction/input";
import { ACESFilmicToneMapping, DirectionalLight, HemisphereLight, Fog, CapsuleGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Raycaster, Vector2, Vector3, WebGLRenderer } from "three";
import { canSimulate, initialSession, sessionReducer } from "../../state/session";
import { createObstacles, steepRamp, HALF_HEIGHT, RADIUS } from "./scene";
import { FIXED_DT, limitSteps } from "./timestep";
import { PALETTE } from "./art/palette";
import { disposeRampGradients } from "./materials/ramp";
import { createPaperPass } from "./post/paper";
export const WORLD_CHUNK_MARKER = "__TQA_WORLD_CHUNK__";
export interface WorldOptions {
  locale?: WorldLocale;
  collision?: "rapier" | "raycast";
  quality?: Quality | "low" | "balanced" | "high";
  debug?: boolean;
}
export async function mountWorld(container: HTMLElement, opts: WorldOptions = {}): Promise<() => void> {
  let locale = opts.locale ?? "en";
  let quality = normalizeQuality(opts.quality ?? "balanced");
  const terrain = createTerrain();
  const trees = createTrees(terrain);
  const forest = createForest(trees, quality);
  const cameraForest = createForest(trees, "High");
  const fadeCrowns = createCrownFade(forest[1], trees.length);
  const obstacles = [createTerrainMesh(terrain), ...forest, ...createObstacles([steepRamp])];
  let controller;
  let renderer: WebGLRenderer | undefined;
  try {
    controller = opts.collision === "raycast"
      ? await (await import("./raycast")).createController([obstacles[0]!, cameraForest[0], ...obstacles.slice(3)])
      : await (await import("./rapier")).createController(terrain, trees);
    renderer = new WebGLRenderer({ antialias: true });
  } catch (error) {
    controller?.dispose();
    for (const mesh of obstacles) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const mesh of forest) mesh.dispose();
    disposeCameraForest();
    throw error;
  }
  function disposeCameraForest() {
    for (const mesh of cameraForest) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
  }
  const gpu = renderer;
  const physics = controller;
  const perf = opts.debug === true ? (await import("./perf")).createPerf(gpu) : undefined;
  if (perf) container.__tqaPerf = perf;
  let adaptive = initialAdaptive();
  let contextLost = false;
  const locomotion = createLocomotion(physics);
  const scene = new Scene();
  // ADR 0013: paper sky and fog; Balanced/High add the paper pass, Low relies on scene fog only.
  scene.background = new Color(PALETTE.paper);
  scene.fog = new Fog(PALETTE.paper, 15, 65);
  scene.add(new HemisphereLight(0xffe2bb, 0x43574a, 2));
  const sun = new DirectionalLight(0xffce91, 3);
  sun.position.set(-20, 12, 15);
  sun.castShadow = PRESETS[quality].shadow > 0;
  sun.shadow.mapSize.setScalar(PRESETS[quality].shadow || 512);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 80 });
  sun.shadow.bias = -0.001;
  scene.add(sun, sun.target);
  gpu.shadowMap.enabled = sun.castShadow;
  gpu.toneMapping = ACESFilmicToneMapping;
  const paper = createPaperPass(gpu, { quality });
  scene.add(...obstacles);
  const player = new Mesh(new CapsuleGeometry(RADIUS, HALF_HEIGHT * 2), new MeshBasicMaterial({ color: 0xcc754e }));
  scene.add(player);
  const supports: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
  const props = [
    { id: "signpost", zoneId: "first-light" as const, x: 1.8, z: 4, size: [1.2, 0.7, 0.18] },
    { id: "desk", zoneId: "workshop" as const, x: 2, z: -3, size: [1.8, 0.25, 0.9] },
  ].map(spec => {
    const mesh = new Mesh(
      new BoxGeometry(...spec.size as [number, number, number]),
      new MeshBasicMaterial({ color: spec.id === "desk" ? 0x8b6040 : 0xd9bd7b }),
    );
    mesh.position.set(spec.x, terrainHeight(terrain, spec.x, spec.z) + 1, spec.z);
    mesh.name = WORLD_COPY[locale][spec.id === "desk" ? "desk" : "signpost"];
    const feet = spec.id === "desk" ? [-0.65, 0.65] : [0];
    for (const x of feet) {
      const support = new Mesh(
        new BoxGeometry(0.15, 0.9, spec.id === "desk" ? 0.7 : 0.15),
        new MeshBasicMaterial({ color: 0x8b6040 }),
      );
      support.position.set(x, -0.5, 0);
      mesh.add(support);
      supports.push(support);
    }
    mesh.updateMatrixWorld(true);
    scene.add(mesh);
    return { id: spec.id, zoneId: spec.zoneId, position: mesh.position, mesh };
  });
  const labels = document.createElement("p");
  labels.textContent = WORLD_COPY[locale].signpost + " · " + WORLD_COPY[locale].desk;
  container.appendChild(labels);
  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  gpu.setPixelRatio(Math.min(window.devicePixelRatio, PRESETS[quality].dpr));
  gpu.domElement.setAttribute("aria-label", WORLD_COPY[locale].canvas);
  container.dataset.worldLocale = locale;
  container.appendChild(gpu.domElement);
  const metrics = opts.debug ? document.createElement("output") : undefined;
  if (metrics) {
    metrics.dataset.worldDebug = "true";
    container.appendChild(metrics);
  }
  let metricStart = 0;
  let metricFrames = 0;
  const previousMarker = container.dataset.worldChunk;
  container.dataset.worldChunk = WORLD_CHUNK_MARKER;
  let state = sessionReducer(initialSession(), { type: "mode", mode: "world" });
  let yaw = Math.atan2(7, 9);
  let zoom = INITIAL_ZOOM;
  let arm = INITIAL_ZOOM;
  let belowTerrainFrames = 0;
  let drag: { id: number; x: number } | undefined;
  const raycaster = new Raycaster();
  const cameraObstacles = [obstacles[0]!, cameraForest[0], ...obstacles.slice(3), ...props.map(prop => prop.mesh)];
  const sightRay = new Raycaster();
  const interaction = createInteraction({
    container,
    targets: props,
    locale: () => locale,
    player: () => physics.position,
    enabled: cameraEnabled,
    lineOfSight(target: InteractionTarget) {
      const direction = new Vector3().copy(target.position).sub(physics.position);
      sightRay.set(physics.position, direction.clone().normalize());
      sightRay.far = Math.max(0, direction.length() - 0.01);
      const blockers = cameraObstacles.filter(mesh => !props.some(prop => prop.id === target.id && prop.mesh === mesh));
      return sightRay.intersectObjects(blockers).length === 0;
    },
    visit(zoneId) {
      state = sessionReducer(state, { type: "visitZone", zoneId });
    },
  });
  let keys: ReadonlySet<string> = new Set();
  let accumulator = 0;
  let last = 0;
  let frame = 0;
  let disposed = false;
  function clear(action: InputAction = { type: "clear" }) {
    if (drag && gpu.domElement.hasPointerCapture(drag.id)) gpu.domElement.releasePointerCapture(drag.id);
    drag = undefined;
    keys = inputReducer(keys, action);
    locomotion.reset();
    accumulator = 0;
    last = 0;
    adaptive = { ...adaptive, frames: [], windowTime: 0 };
  }
  function pause(reason: "hiddenTab" | "windowBlur" | "overlay" | "error", paused: boolean) {
    state = sessionReducer(state, { type: "pause", reason, paused });
    metricStart = 0;
    metricFrames = 0;
    clear({ type: reason === "windowBlur" ? "blur" : "hidden" });
    publishState();
    interaction.update();
  }
  function cameraEnabled() {
    return canSimulate(state) && !isInputTarget(document.activeElement);
  }
  function keydown(event: KeyboardEvent) {
    if (interaction.keydown(event)) return;
    if (cameraEnabled() && !isInputTarget(event.target)) {
      if (["Equal", "NumpadAdd"].includes(event.code)) zoom = clampZoom(zoom - 0.75);
      if (["Minus", "NumpadSubtract"].includes(event.code)) zoom = clampZoom(zoom + 0.75);
      if (["ArrowLeft", "ArrowRight", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(event.code)) event.preventDefault();
    }
    keys = inputReducer(keys, { type: "keydown", event, enabled: canSimulate(state) });
  }
  function keyup(event: KeyboardEvent) {
    keys = inputReducer(keys, { type: "keyup", event });
  }
  function focusin(event: FocusEvent) {
    if (isInputTarget(event.target)) clear({ type: "focusin", event });
  }
  function blur() {
    pause("windowBlur", true);
  }
  function focus() {
    pause("windowBlur", false);
  }
  function visibility() {
    pause("hiddenTab", document.hidden);
    if (document.hidden) cancelAnimationFrame(frame);
    else if (!disposed && !contextLost) frame = requestAnimationFrame(tick);
  }
  function returnToPath() {
    state = locomotion.recover(state);
    clear();
  }
  function click(event: MouseEvent) {
    if (event.button !== 0 || !cameraEnabled()) return;
    const rect = gpu.domElement.getBoundingClientRect();
    raycaster.far = Infinity;
    raycaster.setFromCamera(new Vector2(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1,
    ), camera);
    const hit = raycaster.intersectObjects([...obstacles, player, ...props.map(prop => prop.mesh)])[0];
    const target = props.find(prop => prop.mesh === hit?.object || prop.mesh === hit?.object.parent);
    if (target) interaction.click(target.id);
  }
  function pointerdown(event: PointerEvent) {
    if (event.button !== 0 || !cameraEnabled()) return;
    const rect = gpu.domElement.getBoundingClientRect();
    raycaster.far = Infinity;
    raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    // Terrain is empty space; visible character, trees and props retain click ownership.
    if (raycaster.intersectObjects([...forest, player, ...obstacles.slice(3), ...props.map(prop => prop.mesh)]).length) return;
    drag = { id: event.pointerId, x: event.clientX };
    gpu.domElement.setPointerCapture(event.pointerId);
  }
  function pointermove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId || !cameraEnabled()) return;
    yaw = wrapYaw(yaw - (event.clientX - drag.x) * POINTER_YAW_SPEED);
    drag.x = event.clientX;
  }
  function pointerup(event: PointerEvent) {
    if (gpu.domElement.hasPointerCapture(event.pointerId)) gpu.domElement.releasePointerCapture(event.pointerId);
    drag = undefined;
  }
  function wheel(event: WheelEvent) {
    if (!cameraEnabled()) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
    if (!event.ctrlKey) yaw = wrapYaw(yaw - event.deltaX * unit * POINTER_YAW_SPEED);
    zoom = clampZoom(zoom + event.deltaY * unit * WHEEL_ZOOM_SPEED * (event.ctrlKey ? 2 : 1));
  }
  function publishState() {
    const paused = state.pauseReasons.size > 0;
    const value = quality.toLowerCase();
    if (container.dataset.worldPaused === String(paused) && container.dataset.worldQuality === value) return;
    container.dataset.worldPaused = String(paused);
    container.dataset.worldQuality = value;
    container.dispatchEvent(new CustomEvent("tqa:world-state", { bubbles: false, detail: { paused, quality: value } }));
  }
  function externalPause(event: Event) {
    const detail = (event as CustomEvent).detail;
    if (detail && ["overlay", "error"].includes(detail.reason) && typeof detail.paused === "boolean") pause(detail.reason, detail.paused);
  }
  function setLocale(event: Event) {
    const next = (event as CustomEvent).detail?.locale;
    if (!isWorldLocale(next)) return;
    locale = next;
    container.dataset.worldLocale = locale;
    labels.textContent = WORLD_COPY[locale].signpost + " · " + WORLD_COPY[locale].desk;
    gpu.domElement.setAttribute("aria-label", WORLD_COPY[locale].canvas);
    for (const prop of props) {
      prop.mesh.name = WORLD_COPY[locale][prop.id === "desk" ? "desk" : "signpost"];
    }
    if (metrics) metrics.textContent = "";
    interaction.update();
  }
  function setQuality(event: Event) {
    const detail = (event as CustomEvent).detail;
    if (!detail || !["low", "balanced", "high"].includes(detail.quality)) return;
    adaptive = selectManualQuality(adaptive);
    applyQuality(normalizeQuality(detail.quality));
  }
  function applyQuality(next: Quality) {
    if (quality === next) return;
    quality = next;
    updateForest(forest, trees, quality);
    gpu.setPixelRatio(Math.min(window.devicePixelRatio, PRESETS[quality].dpr));
    paper.setQuality(quality);
    sun.castShadow = PRESETS[quality].shadow > 0;
    gpu.shadowMap.enabled = sun.castShadow;
    sun.shadow.mapSize.setScalar(PRESETS[quality].shadow || 512);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    resize();
    publishState();
  }
  function updateCamera(dt: number) {
    const target = physics.position.clone();
    const direction = new Vector3(Math.sin(yaw) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(yaw) * Math.cos(CAMERA_PITCH));
    raycaster.set(target, direction);
    raycaster.far = zoom;
    const hit = raycaster.intersectObjects(cameraObstacles)[0];
    arm = springArm(arm, zoom, hit?.distance, dt);
    camera.position.copy(target).addScaledVector(direction, arm);
    camera.position.y = Math.max(camera.position.y, terrainHeight(terrain, camera.position.x, camera.position.z) + CAMERA_CLEARANCE);
    camera.lookAt(target);
    const blocked = new Set(selectOccludingCrowns(trees, camera.position, target));
    const instances = new Set<number>();
    for (let i = 0; i < forest[1].count; i++) {
      if (blocked.has(Math.floor(i * trees.length / forest[1].count))) instances.add(i);
    }
    fadeCrowns(instances, dt);
    if (opts.debug) {
      if (camera.position.y < terrainHeight(terrain, camera.position.x, camera.position.z)) belowTerrainFrames++;
      console.assert(belowTerrainFrames === 0, "T05: camera below terrain", belowTerrainFrames);
      container.dataset.worldCameraBelowTerrainFrames = String(belowTerrainFrames);
    }
  }
  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    gpu.setSize(width, height);
    paper.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function loseContext() {
    if (disposed || contextLost) return;
    contextLost = true;
    cancelAnimationFrame(frame);
    state = sessionReducer(state, { type: "mode", mode: "recoverableError" });
    clear();
    publishState();
    interaction.update();
    container.dispatchEvent(new CustomEvent("tqa:world-error", {
      bubbles: false,
      detail: { kind: "context-lost" },
    }));
  }
  function tick(now: number) {
    if (disposed || contextLost || document.hidden) return;
    if (last && canSimulate(state)) {
      const ms = now - last;
      perf?.record(ms);
      const result = sampleQuality(adaptive, ms, quality);
      adaptive = result.state;
      applyQuality(result.quality);
    }
    const dt = Math.min(0.1, last ? (now - last) / 1000 : FIXED_DT);
    if (cameraEnabled()) yaw = wrapYaw(yaw + (Number(keys.has("ArrowLeft")) - Number(keys.has("ArrowRight"))) * KEY_YAW_SPEED * dt);
    if (canSimulate(state)) {
      const plan = limitSteps(accumulator, last ? (now - last) / 1000 : 0);
      accumulator = plan.remainder;
      for (let i = 0; i < plan.steps; i++) {
        state = locomotion.step(state, keys, yaw, FIXED_DT);
      }
    }
    last = now;
    player.position.copy(physics.position);
    updateCamera(dt);
    interaction.update();
    sun.target.position.copy(physics.position);
    sun.position.copy(physics.position).add(new Vector3(-20, 12, 15));
    paper.render(scene, camera);
    if (metrics) {
      if (!metricStart) metricStart = now;
      metricFrames++;
      if (now - metricStart >= 500) {
        const ms = (now - metricStart) / metricFrames;
        const copy = WORLD_COPY[locale].debug;
        metrics.textContent = `${copy[0]} | ${copy[1]} ${(1000 / ms).toFixed(1)} | ${copy[2]} ${ms.toFixed(2)} ms | ${copy[3]} ${gpu.info.render.calls} | ${copy[4]} ${gpu.info.render.triangles} | ${copy[5]} ${gpu.info.memory.geometries} | ${copy[6]} ${gpu.info.memory.textures}`;
        metricStart = now;
        metricFrames = 0;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  gpu.domElement.addEventListener("webglcontextlost", loseContext);
  updateCamera(FIXED_DT);
  container.addEventListener("tqa:return-to-path", returnToPath);
  container.addEventListener("tqa:pause", externalPause);
  container.addEventListener("tqa:set-quality", setQuality);
  container.addEventListener("tqa:set-locale", setLocale);
  gpu.domElement.addEventListener("click", click);
  gpu.domElement.addEventListener("pointerdown", pointerdown);
  gpu.domElement.addEventListener("pointermove", pointermove);
  gpu.domElement.addEventListener("pointerup", pointerup);
  gpu.domElement.addEventListener("pointercancel", pointerup);
  gpu.domElement.addEventListener("lostpointercapture", pointerup);
  gpu.domElement.addEventListener("wheel", wheel, { passive: false });
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focus);
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("focusin", focusin);
  pause("hiddenTab", document.hidden);
  pause("windowBlur", !document.hasFocus());
  resize();
  if (!document.hidden) frame = requestAnimationFrame(tick);
  return () => {
    if (disposed) return;
    disposed = true;
    gpu.domElement.removeEventListener("webglcontextlost", loseContext);
    if (perf && container.__tqaPerf === perf) delete container.__tqaPerf;
    cancelAnimationFrame(frame);
    observer.disconnect();
    container.removeEventListener("tqa:pause", externalPause);
    container.removeEventListener("tqa:set-quality", setQuality);
    container.removeEventListener("tqa:set-locale", setLocale);
    delete container.dataset.worldLocale;
    gpu.domElement.removeEventListener("click", click);
    interaction.dispose();
    labels.remove();
    gpu.domElement.removeEventListener("pointerdown", pointerdown);
    gpu.domElement.removeEventListener("pointermove", pointermove);
    gpu.domElement.removeEventListener("pointerup", pointerup);
    gpu.domElement.removeEventListener("pointercancel", pointerup);
    gpu.domElement.removeEventListener("lostpointercapture", pointerup);
    gpu.domElement.removeEventListener("wheel", wheel);
    delete container.dataset.worldPaused;
    delete container.dataset.worldQuality;
    delete container.dataset.worldCameraBelowTerrainFrames;
    container.removeEventListener("tqa:return-to-path", returnToPath);
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", focus);
    document.removeEventListener("visibilitychange", visibility);
    document.removeEventListener("focusin", focusin);
    clear();
    physics.dispose();
    for (const mesh of [...obstacles, player, ...props.map(prop => prop.mesh), ...supports]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const mesh of forest) mesh.dispose();
    disposeCameraForest();
    paper.dispose();
    disposeRampGradients();
    sun.shadow.dispose();
    metrics?.remove();
    gpu.dispose();
    gpu.forceContextLoss();
    gpu.domElement.remove();
    if (previousMarker === undefined) delete container.dataset.worldChunk;
    else container.dataset.worldChunk = previousMarker;
  };
}

function normalizeQuality(value: NonNullable<WorldOptions["quality"]>): Quality {
  const lower = value.toLowerCase();
  return lower === "low" ? "Low" : lower === "high" ? "High" : "Balanced";
}
