import { WORLD_COPY, isWorldLocale, type WorldLocale } from "./copy";
import { initialAdaptive, sampleQuality, selectManualQuality } from "./adaptive-quality";
import { createInteraction, ZONE_IDS, type InteractionTarget, type ZoneId } from "../interaction/targets";
import { SIGNPOSTS, arrivalPoint } from "../navigation/signposts";
import { createTeleport } from "../navigation/teleport";
import { TELEPORT_TO_EVENT, TELEPORT_CANCEL_EVENT } from "../navigation/events";
import { BoxGeometry } from "three";
import { clampZoom, wrapYaw, springArm, INITIAL_ZOOM, CAMERA_PITCH, CAMERA_CLEARANCE, KEY_YAW_SPEED, POINTER_YAW_SPEED, WHEEL_ZOOM_SPEED } from "./camera";
import { createLocomotion } from "./locomotion";
import { PRESETS, type Quality } from "./terrain";
import { createWorldScene, nearestSafePath, surfaceHeight, worldSpawn } from "./scene/compose";
import { createMeshPhysics } from "./scene/mesh-physics";
import { ZONES } from "./layout/zones";
import type { Controller } from "./scene";
import { inputReducer, isInputTarget, type InputAction } from "../interaction/input";
import { ACESFilmicToneMapping, CapsuleGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Raycaster, Vector2, Vector3, WebGLRenderer } from "three";
import { canSimulate, initialSession, sessionReducer } from "../../state/session";
import { HALF_HEIGHT, HEIGHT, RADIUS } from "./scene";
import { FIXED_DT, limitSteps } from "./timestep";
import { PALETTE } from "./art/palette";
import { disposeRampGradients } from "./materials/ramp";
import { createGradedPaperPass } from "./scene/paper";
import { WORLD_DIRECTION } from "./art/direction";
import { pathLength, pathPointAt } from "./layout/path";
import { CORRIDOR_POINTS } from "./post/paper";
import { nearestPath } from "./terrain/samples";
import { TERRAIN_RADIUS } from "./terrain/tiles";
import { createIntroController } from "./cinematic/controller";
import type { IntroFrame } from "./cinematic/intro";

declare global {
  interface Window { __tqaSkipIntro?: boolean }
}
/** Path metres streamed ahead during the opening overview (covers the river bends it shows). */
const INTRO_PRELOAD_M = 600;

/** Path polyline (XZ) over the streamed intro range, for the paper corridor mask. */
function introCorridor(position: { x: number; z: number }) {
  const length = pathLength();
  const start = nearestPath(position.x, position.z).t * length;
  const from = Math.max(0, start - 60);
  const to = Math.min(length, start + INTRO_PRELOAD_M);
  return Array.from({ length: CORRIDOR_POINTS }, (_, i) => pathPointAt((from + (to - from) * i / (CORRIDOR_POINTS - 1)) / length));
}
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
  const scene = new Scene();
  scene.background = new Color(PALETTE.paper);
  let controller: Controller | undefined;
  let composition: ReturnType<typeof createWorldScene> | undefined;
  let paperPass: ReturnType<typeof createGradedPaperPass> | undefined;
  let renderer: WebGLRenderer | undefined;
  try {
    const physicsBackend = opts.collision === "raycast"
      ? createMeshPhysics()
      : await (await import("./rapier")).createController(undefined, [], { streamed: true });
    if ("step" in physicsBackend) controller = physicsBackend;
    renderer = new WebGLRenderer({ antialias: true });
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PRESETS[quality].dpr));
    paperPass = createGradedPaperPass(renderer, quality);
    composition = createWorldScene({ ...physicsBackend, scene, quality, paper: paperPass });
    if (!controller) controller = await (await import("./raycast")).createController(composition.collisionMeshes);
    controller.teleport(worldSpawn());
  } catch (error) {
    composition?.dispose();
    controller?.dispose();
    paperPass?.dispose();
    disposeRampGradients();
    renderer?.dispose();
    renderer?.forceContextLoss();
    throw error;
  }
  const composed = composition;
  const paper = paperPass;
  const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  function updateMotionPreference() { composed.setReducedMotion(motionPreference?.matches ?? false); }
  updateMotionPreference();
  motionPreference?.addEventListener("change", updateMotionPreference);
  const gpu = renderer;
  const physics = controller;
  const perf = opts.debug === true ? (await import("./perf")).createPerf(gpu) : undefined;
  if (perf) container.__tqaPerf = perf;
  let adaptive = initialAdaptive();
  let contextLost = false;
  const locomotion = createLocomotion(physics);
  const sun = composed.sun;
  gpu.shadowMap.enabled = sun.castShadow;
  const player = new Mesh(new CapsuleGeometry(RADIUS, HALF_HEIGHT * 2), new MeshBasicMaterial({ color: 0xcc754e }));
  scene.add(player);
  const supports: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
  const contentProps = [
    { id: "signpost", zoneId: "first-light" as const, offset: 1.8, size: [1.2, 0.7, 0.18] },
    { id: "desk", zoneId: "workshop" as const, offset: 2, size: [1.8, 0.25, 0.9] },
  ].map(spec => {
    const mesh = new Mesh(
      new BoxGeometry(...spec.size as [number, number, number]),
      new MeshBasicMaterial({ color: spec.id === "desk" ? 0x8b6040 : 0xd9bd7b }),
    );
    const zone = ZONES.find(zone => zone.id === spec.zoneId)!;
    const x = zone.position.x + spec.offset;
    const z = zone.position.z;
    mesh.position.set(x, surfaceHeight(x, z) + 1, z);
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
    return { id: spec.id, kind: "content" as const, zoneId: spec.zoneId, position: mesh.position, mesh };
  });
  const props = [...contentProps, ...SIGNPOSTS.map(post => {
    const mesh = new Mesh(new BoxGeometry(1.2, 0.7, 0.18), new MeshBasicMaterial({ color: 0xd9bd7b }));
    mesh.position.set(post.position.x, surfaceHeight(post.position.x, post.position.z) + 1, post.position.z);
    mesh.name = `teleport-${post.zoneId}`;
    const support = new Mesh(new BoxGeometry(0.15, 0.9, 0.15), new MeshBasicMaterial({ color: 0x8b6040 }));
    support.position.set(0, -0.5, 0);
    mesh.add(support);
    supports.push(support);
    mesh.updateMatrixWorld(true);
    scene.add(mesh);
    return { id: mesh.name, kind: "teleport" as const, zoneId: post.zoneId, position: mesh.position, mesh };
  })];
  const labels = document.createElement("p");
  labels.textContent = WORLD_COPY[locale].signpost + " · " + WORLD_COPY[locale].desk;
  container.appendChild(labels);
  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  gpu.setPixelRatio(Math.min(window.devicePixelRatio, PRESETS[quality].dpr));
  gpu.domElement.setAttribute("aria-label", WORLD_COPY[locale].canvas);
  gpu.domElement.tabIndex = 0;
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
  let introUI: { skip: HTMLButtonElement; bars: HTMLDivElement[]; fade: HTMLDivElement } | undefined;
  const gameplayFar = camera.far;
  const introPending = () => intro?.state !== "done";
  let teleport = createTeleport({ reducedMotion: motionPreference?.matches ?? false });
  let destination: ZoneId | undefined;
  let teleportCover: HTMLDivElement | undefined;
  container.dataset.worldTeleport = "idle";
  state = { ...state, position: { ...physics.position }, sessionProgress: { ...state.sessionProgress, lastSafePosition: { ...physics.position } } };
  let yaw = Math.atan2(7, 9);
  let zoom = INITIAL_ZOOM;
  let arm = INITIAL_ZOOM;
  let belowTerrainFrames = 0;
  let drag: { id: number; x: number } | undefined;
  const raycaster = new Raycaster();
  const cameraObstacles = () => [...composed.collisionMeshes, ...props.map(prop => prop.mesh)];
  const sightRay = new Raycaster();
  const interaction = createInteraction({
    container,
    targets: props,
    locale: () => locale,
    player: () => physics.position,
    enabled: cameraEnabled,
    chooseTeleport(from) {
      if (introPending() || teleport.inputLocked) return false;
      teleport = createTeleport({ reducedMotion: motionPreference?.matches ?? false });
      if (!teleport.startChoosing(from)) return false;
      clear();
      container.dataset.worldTeleport = "active";
      interaction.update();
      return true;
    },
    lineOfSight(target: InteractionTarget) {
      const direction = new Vector3().copy(target.position).sub(physics.position);
      sightRay.set(physics.position, direction.clone().normalize());
      sightRay.far = Math.max(0, direction.length() - 0.01);
      const blockers = cameraObstacles().filter(mesh => !props.some(prop => prop.id === target.id && prop.mesh === mesh));
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
  function pause(reason: "hiddenTab" | "windowBlur" | "overlay" | "journal" | "error", paused: boolean) {
    state = sessionReducer(state, { type: "pause", reason, paused });
    metricStart = 0;
    metricFrames = 0;
    clear({ type: reason === "windowBlur" ? "blur" : "hidden" });
    publishState();
    interaction.update();
  }
  function cameraEnabled() {
    return canSimulate(state) && !introPending() && !teleport.inputLocked && !isInputTarget(document.activeElement);
  }
  function keydown(event: KeyboardEvent) {
    if (intro?.inputLocked && (event.code === "Escape" || (event.code === "Enter" && document.activeElement === introUI?.skip))) {
      event.preventDefault();
      skipIntro();
      return;
    }
    if (interaction.keydown(event)) return;
    if (cameraEnabled() && !isInputTarget(event.target)) {
      if (["Equal", "NumpadAdd"].includes(event.code)) zoom = clampZoom(zoom - 0.75);
      if (["Minus", "NumpadSubtract"].includes(event.code)) zoom = clampZoom(zoom + 0.75);
      if (["ArrowLeft", "ArrowRight", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(event.code)) event.preventDefault();
    }
    keys = inputReducer(keys, { type: "keydown", event, enabled: canSimulate(state) && !introPending() && !teleport.inputLocked });
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
    cancelAnimationFrame(frame);
    if (!document.hidden && !disposed && !contextLost) frame = requestAnimationFrame(tick);
  }
  function returnToPath() {
    if (introPending() || teleport.inputLocked) return;
    const safe = nearestSafePath(physics.position);
    composed.update(safe, 0);
    state = sessionReducer(state, { type: "safePosition", position: safe });
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
    const hit = raycaster.intersectObjects([...composed.visibleMeshes, player, ...props.map(prop => prop.mesh)])[0];
    const target = props.find(prop => prop.mesh === hit?.object || prop.mesh === hit?.object.parent);
    if (target) interaction.click(target.id);
  }
  function pointerdown(event: PointerEvent) {
    if (event.button !== 0 || !cameraEnabled()) return;
    const rect = gpu.domElement.getBoundingClientRect();
    raycaster.far = Infinity;
    raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    // Terrain is empty space; visible character, trees and props retain click ownership.
    if (raycaster.intersectObjects([...composed.foliageMeshes, player, ...props.map(prop => prop.mesh)]).length) return;
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
    if (detail && ["overlay", "journal", "error"].includes(detail.reason) && typeof detail.paused === "boolean") pause(detail.reason, detail.paused);
  }
  function setLocale(event: Event) {
    const next = (event as CustomEvent).detail?.locale;
    if (!isWorldLocale(next)) return;
    locale = next;
    container.dataset.worldLocale = locale;
    labels.textContent = WORLD_COPY[locale].signpost + " · " + WORLD_COPY[locale].desk;
    gpu.domElement.setAttribute("aria-label", WORLD_COPY[locale].canvas);
    if (introUI) introUI.skip.textContent = WORLD_COPY[locale].skip;
    for (const prop of contentProps) {
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
    composed.setQuality(quality);
    gpu.setPixelRatio(Math.min(window.devicePixelRatio, PRESETS[quality].dpr));
    paper.setQuality(quality);
    gpu.shadowMap.enabled = sun.castShadow;
    resize();
    publishState();
  }
  function teleportTo(event: Event) {
    if (introPending() || contextLost || teleport.state !== "choosing") return;
    const to = (event as CustomEvent).detail?.to;
    if (!ZONE_IDS.includes(to)) return;
    const start = teleport.choose(to);
    if (!start) return;
    destination = to;
    clear();
    teleportCover = document.createElement("div");
    teleportCover.setAttribute("aria-hidden", "true");
    teleportCover.dataset.worldTeleportCover = teleport.effect;
    Object.assign(teleportCover.style, {
      position: "absolute", inset: "0", background: PALETTE.paper,
      pointerEvents: "none", zIndex: "2", opacity: "0",
    });
    container.appendChild(teleportCover);
    container.dispatchEvent(new CustomEvent(start.type, { bubbles: false, detail: start.detail }));
  }
  function cancelTeleport() {
    // The shared machine only cancels choosing; the world contract also aborts an active fade.
    teleport.cancel();
    teleport = createTeleport({ reducedMotion: motionPreference?.matches ?? false });
    destination = undefined;
    teleportCover?.remove();
    teleportCover = undefined;
    container.dataset.worldTeleport = "idle";
    clear();
    interaction.update();
  }
  function updateTeleport(dt: number) {
    const result = teleport.tick(dt);
    // Navigation emits arrival at completion; move under the opaque paper at the moving boundary.
    if (result.transitions.includes("moving") && destination) {
      const arrival = arrivalPoint(destination);
      const position = new Vector3(arrival.position.x, surfaceHeight(arrival.position.x, arrival.position.z) + HEIGHT + 0.02, arrival.position.z);
      composed.update(position, 0);
      physics.teleport(position);
      state = sessionReducer({ ...state, position: { ...position } }, { type: "safePosition", position });
      yaw = arrival.yaw;
      arm = zoom;
      locomotion.reset();
      player.position.copy(physics.position);
      updateCamera(0);
    }
    if (teleportCover) teleportCover.style.opacity = String(teleport.opacity);
    if (result.events.length) {
      teleportCover?.remove();
      teleportCover = undefined;
      destination = undefined;
      container.dataset.worldTeleport = "idle";
      clear();
      for (const event of result.events) container.dispatchEvent(new CustomEvent(event.type, { bubbles: false, detail: event.detail }));
    }
  }
  function updateCamera(dt: number) {
    const target = physics.position.clone();
    const direction = new Vector3(Math.sin(yaw) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(yaw) * Math.cos(CAMERA_PITCH));
    raycaster.set(target, direction);
    raycaster.far = zoom;
    const hit = raycaster.intersectObjects(cameraObstacles())[0];
    arm = springArm(arm, zoom, hit?.distance, dt);
    camera.position.copy(target).addScaledVector(direction, arm);
    camera.position.y = Math.max(camera.position.y, surfaceHeight(camera.position.x, camera.position.z) + CAMERA_CLEARANCE);
    camera.lookAt(target);
    composed.fadeCrowns(camera.position, target, dt);
    if (opts.debug) {
      if (camera.position.y < surfaceHeight(camera.position.x, camera.position.z)) belowTerrainFrames++;
      console.assert(belowTerrainFrames === 0, "T05: camera below terrain", belowTerrainFrames);
      container.dataset.worldCameraBelowTerrainFrames = String(belowTerrainFrames);
    }
  }
  function publishIntro(next: "playing" | "done") {
    if (container.dataset.worldIntro === next) return;
    container.dataset.worldIntro = next;
    container.dispatchEvent(new CustomEvent("tqa:intro", { bubbles: false, detail: { state: next } }));
  }
  function removeIntroUI() {
    if (!introUI) return;
    introUI.skip.removeEventListener("click", skipIntro);
    introUI.skip.remove();
    for (const bar of introUI.bars) bar.remove();
    introUI.fade.remove();
    introUI = undefined;
  }
  function applyIntro(pose: IntroFrame) {
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.fov = pose.fov;
    // The river overview is hundreds of metres above the gameplay camera.
    camera.far = intro?.state === "done" ? gameplayFar : Math.max(gameplayFar, 2000);
    camera.updateProjectionMatrix();
    // Lead: boost on top of direction C's mist (B2-038), not the pass default.
    paper.setMist({ strength: Math.min(1, WORLD_DIRECTION.background.mist.strength + pose.mistBoost) });
    // Lead: world-scale fog (260 m) would dissolve the 460 m overview into blank paper; stretch it with
    // the camera-to-target distance during the flight and restore the directed distances at handoff.
    const { near, far } = WORLD_DIRECTION.background.fog;
    const reach = intro?.state === "done" ? 0 : pose.position.distanceTo(pose.target);
    paper.setFog({ near: Math.max(near, reach * 0.6), far: Math.max(far, reach * 1.8) });
    if (introUI) {
      for (const bar of introUI.bars) bar.style.height = `${pose.letterbox * 12}%`;
      introUI.fade.style.opacity = String(pose.paperOpacity);
    }
    if (intro?.state === "done") {
      composed.setPreload(0);
      paper.setCorridor(null);
      removeIntroUI();
      clear();
      gpu.domElement.focus({ preventScroll: true });
      interaction.update();
      publishIntro("done");
    }
  }
  function skipIntro() {
    if (intro?.inputLocked) applyIntro(intro.skip());
  }
  function startIntro() {
    if (intro?.state !== "idle" || !canSimulate(state)) return;
    clear();
    const bars = ["top", "bottom"].map(edge => {
      const bar = document.createElement("div");
      bar.setAttribute("aria-hidden", "true");
      bar.dataset.worldLetterbox = edge;
      Object.assign(bar.style, { position: "absolute", left: "0", right: "0", [edge]: "0", background: PALETTE.paper, pointerEvents: "none", zIndex: "2" });
      container.appendChild(bar);
      return bar;
    });
    const fade = document.createElement("div");
    fade.setAttribute("aria-hidden", "true");
    Object.assign(fade.style, { position: "absolute", inset: "0", background: PALETTE.paper, pointerEvents: "none", zIndex: "2" });
    container.appendChild(fade);
    const skip = document.createElement("button");
    skip.type = "button";
    skip.dataset.worldIntroSkip = "true";
    skip.textContent = WORLD_COPY[locale].skip;
    Object.assign(skip.style, { position: "absolute", bottom: "5.5rem", right: "1rem", zIndex: "3", color: PALETTE.ink, background: PALETTE.paper, padding: ".5rem 1rem", cursor: "pointer" });
    skip.addEventListener("click", skipIntro);
    container.appendChild(skip);
    introUI = { skip, bars, fade };
    // The overview shows the first bends of the river: stream them before the first intro frame.
    composed.setPreload(INTRO_PRELOAD_M);
    composed.update(physics.position, 0);
    // Paper wash outside the streamed corridor: tile borders never show in the overview.
    paper.setCorridor(introCorridor(physics.position), TERRAIN_RADIUS);
    applyIntro(intro.start());
    const active = document.activeElement;
    if (!active || active === document.body || active === gpu.domElement) skip.focus({ preventScroll: true });
    interaction.update();
    publishIntro("playing");
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
    const wasPlaying = intro?.inputLocked;
    startIntro();
    if (cameraEnabled()) yaw = wrapYaw(yaw + (Number(keys.has("ArrowLeft")) - Number(keys.has("ArrowRight"))) * KEY_YAW_SPEED * dt);
    if (canSimulate(state) && !introPending() && !teleport.inputLocked) {
      const plan = limitSteps(accumulator, last ? (now - last) / 1000 : 0);
      accumulator = plan.remainder;
      for (let i = 0; i < plan.steps; i++) {
        composed.update(physics.position, FIXED_DT);
        state = locomotion.step(state, keys, yaw, FIXED_DT);
        if (!composed.contains(physics.position)) returnToPath();
      }
    }
    // The chooser's overlay pause must not stall travel. Blur/hidden/error still suspend it.
    if (!introPending() && state.appMode === "world" && !state.pauseReasons.has("windowBlur") && !state.pauseReasons.has("error")) updateTeleport(dt);
    last = now;
    player.position.copy(physics.position);
    if (intro?.inputLocked) {
      if (canSimulate(state) && wasPlaying) applyIntro(intro.tick(dt));
    } else updateCamera(dt);
    interaction.update();
    composed.update(physics.position, 0);
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
  const intro = createIntroController({
    gameplayPose: { position: camera.position, target: physics.position, fov: camera.fov },
    reducedMotion: motionPreference?.matches ?? false,
  });
  if (window.__tqaSkipIntro === true) {
    intro.skip();
    publishIntro("done");
  }
  container.addEventListener("tqa:return-to-path", returnToPath);
  container.addEventListener("tqa:pause", externalPause);
  container.addEventListener("tqa:set-quality", setQuality);
  container.addEventListener("tqa:set-locale", setLocale);
  container.addEventListener(TELEPORT_TO_EVENT, teleportTo);
  container.addEventListener(TELEPORT_CANCEL_EVENT, cancelTeleport);
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
  player.position.copy(physics.position);
  paper.render(scene, camera);
  startIntro();
  if (!document.hidden) frame = requestAnimationFrame(tick);
  return () => {
    if (disposed) return;
    disposed = true;
    removeIntroUI();
    delete container.dataset.worldIntro;
    container.removeEventListener(TELEPORT_TO_EVENT, teleportTo);
    container.removeEventListener(TELEPORT_CANCEL_EVENT, cancelTeleport);
    teleportCover?.remove();
    teleportCover = undefined;
    delete container.dataset.worldTeleport;
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
    motionPreference?.removeEventListener("change", updateMotionPreference);
    composed.dispose();
    physics.dispose();
    for (const mesh of [player, ...props.map(prop => prop.mesh), ...supports]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    paper.dispose();
    disposeRampGradients();
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
