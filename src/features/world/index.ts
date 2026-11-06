import { WORLD_COPY, isWorldLocale, type WorldLocale } from "./copy";
import { initialAdaptive, sampleQuality, selectManualQuality } from "./adaptive-quality";
import { createInteraction, ZONE_IDS, type InteractionTarget, type ZoneId } from "../interaction/targets";
import { SIGNPOSTS, arrivalPoint } from "../navigation/signposts";
import { createTeleport, MIST_SECONDS, REDUCED_MOTION_SECONDS } from "../navigation/teleport";
import { TELEPORT_TO_EVENT, TELEPORT_CANCEL_EVENT } from "../navigation/events";
import { clampZoom, wrapYaw, springArm, INITIAL_ZOOM, CAMERA_PITCH, CAMERA_CLEARANCE, KEY_YAW_SPEED, POINTER_YAW_SPEED, WHEEL_ZOOM_SPEED } from "./camera";
import { createLocomotion } from "./locomotion";
import { PRESETS, type Quality } from "./terrain";
import { createWorldScene, directGrade, nearestSafePath, surfaceHeight, worldSpawn } from "./scene/compose";
import { createMeshPhysics } from "./scene/mesh-physics";
import { ZONES } from "./layout/zones";
import { createDeferredZoneScenes, createZoneEntryTracker, zoneFoliageBounds } from "./zones";
import { createForestSunShafts } from "./zones/first-light";
import { placeDressing } from "./dressing";
import { createFarLandscape, GAMEPLAY_FAR } from "./scene/far-landscape";
import { addBridgeColliders } from "./bridges";
import type { Controller } from "./scene";
import { inputReducer, isInputTarget, type InputAction } from "../interaction/input";
import { ACESFilmicToneMapping, Box3, Color, HemisphereLight, PerspectiveCamera, Ray, Scene, Raycaster, Vector2, Vector3, WebGLRenderer, type Mesh, type ShaderMaterial } from "three";
import { canSimulate, initialSession, sessionReducer } from "../../state/session";
import { HEIGHT, RADIUS } from "./scene";
import { FIXED_DT, limitSteps } from "./timestep";
import { PALETTE } from "./art/palette";
import { disposeRampGradients } from "./materials/ramp";
import { createCharacterAnimator } from "./character/animator";
import { loadCharacter } from "./character/loader";
import { createProp, type PropKind } from "./props";
import { createGradedPaperPass } from "./scene/paper";
import { STYLE_PRESETS, WORLD_DIRECTION } from "./art/direction";
import { pathLength, pathPointAt } from "./layout/path";
import { CORRIDOR_POINTS } from "./post/paper";
import { nearestPath, nearestRiver } from "./terrain/samples";
import { TERRAIN_RADIUS } from "./terrain/tiles";
import { createIntroController } from "./cinematic/controller";
import { createEndingController } from "./cinematic/ending-controller";
import type { EndingFrame } from "./cinematic/ending";
import { introAtmosphere, type IntroFrame } from "./cinematic/intro";
import { SECRETS, nearestSecret } from "../story/secrets";
import { initialStory, storyReducer } from "../story/story";
import { POEM_TOGGLE, storyFeedbackText } from "../story/copy";
import { createSecretLandmark, disposeLandmark } from "./props/secrets";
import { applyCoastAtmosphere, lightingAt } from "./sky/grade";
import { timeOfDayAt } from "./layout/lighting";
import { createVehicleView } from "./vehicle/view";
import { cancelCruise, dismount, initialVehicle, mount, step as stepVehicle, toggleCruise, vehiclePosition, VEHICLE_LIMITS, type VehicleCorridor } from "../vehicle/model";
import { VEHICLE_LABELS } from "../vehicle/labels";
import { PATH_WIDTH, waterLevelAt } from "./terrain/height";
import { createMascotMesh } from "../mascot/shape";
import { createMascotFollowState, stepMascotFollow } from "../mascot/follow";
import { createMascotHints, MASCOT_HINTS } from "../mascot/hints";
import { ambienceMixAt } from "../audio/mix";
import { updateFoliageWind } from "./foliage/instances";

declare global {
  interface Window { __tqaSkipIntro?: boolean; __tqaJourney?: boolean }
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
/** B2-045: optimized rig (meshopt), loaded only after Enter World. */
const CHARACTER_URL = "/world/start/character-duy.glb";
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
  let zoneScenes: ReturnType<typeof createDeferredZoneScenes> | undefined;
  let zones: NonNullable<typeof zoneScenes>["zones"] = [];
  const zoneMeshes: Mesh[] = [];
  const contentTargets: (typeof zones)[number]["target"][] = [];
  const interactionTargets: InteractionTarget[] = [];
  let dressing: ReturnType<typeof placeDressing> | undefined;
  let removeDressingTrimeshes: (() => void) | undefined;
  let forestSun: ReturnType<typeof createForestSunShafts> | undefined;
  let farLandscape: ReturnType<typeof createFarLandscape> | undefined;
  try {
    // User Timing is compiled out of production; development can inspect each mount step.
    const measure = <T,>(name: string, build: () => T): T => {
      if (process.env.NODE_ENV === "production") return build();
      const start = `world:mount:${name}:start`;
      performance.mark(start);
      try { return build(); }
      finally {
        performance.clearMeasures(`world:mount:${name}`);
        performance.measure(`world:mount:${name}`, start);
        performance.clearMarks(start);
      }
    };
    const physicsBackend = opts.collision === "raycast"
      ? createMeshPhysics()
      : await (await import("./rapier")).createController(undefined, [], { streamed: true });
    if ("step" in physicsBackend) controller = physicsBackend;
    zoneScenes = measure("zones", () => createDeferredZoneScenes(surfaceHeight, zone => {
      scene.add(zone.group);
      addZoneColliders(zone.boxes);
      fixedMeshes.push(...zone.boxes);
      // Both backends retain this array; new obstacles are effective before ensure returns.
      composition?.collisionMeshes.push(...zone.boxes);
      zoneBounds.push(...zoneFoliageBounds([zone]));
      contentTargets.push(zone.target);
      interactionTargets.push(zone.target);
      zone.group.traverse(object => { if ((object as Mesh).isMesh) zoneMeshes.push(object as Mesh); });
    }));
    zones = zoneScenes.zones;
    dressing = measure("dressing", () => placeDressing({ deferred: true }));
    const zoneBoxes = [...zones.flatMap(zone => zone.boxes), ...dressing.boxes];
    const fixedMeshes: Mesh[] = [...zoneBoxes, ...dressing.surfaces];
    const zoneBounds = zoneFoliageBounds(zones);
    for (const zone of zones) scene.add(zone.group);
    for (const group of dressing.groups) scene.add(group);
    // B2-179: the first playable frame only needs the nearby world and fixed colliders.
    // Optional visuals share a 4 ms queue, started after the intro hands control to the player.
    dressing.defer((function* () {
      const shafts = measure("forest-sun", () => createForestSunShafts(surfaceHeight));
      forestSun = { ...shafts, dispose() {
        // The original shaft factory owns geometry/material; the instance buffer needs its own release.
        for (const child of shafts.group.children) if ("dispose" in child && typeof child.dispose === "function") child.dispose();
        shafts.dispose();
      } };
      scene.add(forestSun.group);
    })());
    farLandscape = measure("far-landscape", () => createFarLandscape({ deferred: true }));
    scene.add(farLandscape.mesh);
    dressing.defer(farLandscape.build);
    // Tests that compare frames wait for "done": deferred dressing/ground may still land while paused.
    container.dataset.worldBuild = "pending";
    dressing.startDeferred(() => container.dataset.worldIntro === "done", () => { container.dataset.worldBuild = "done"; });
    // Fixed cuboids in Rapier; the mesh backend uses these same oriented boxes as raycast obstacles.
    function addZoneColliders(boxes: typeof zoneBoxes) {
      if (opts.collision === "raycast") return;
      for (const box of boxes) {
        const size = box.geometry.parameters;
        physicsBackend.world.createCollider(physicsBackend.RAPIER.ColliderDesc.cuboid(size.width / 2, size.height / 2, size.depth / 2)
          .setTranslation(box.position.x, box.position.y, box.position.z).setRotation(box.quaternion));
      }
    }
    addZoneColliders(zoneBoxes);
    // B2-168: bridge decks and rails are trimeshes in Rapier; the raycast backend gets matching meshes below.
    if (opts.collision !== "raycast") removeDressingTrimeshes = addBridgeColliders(physicsBackend.RAPIER, physicsBackend.world, dressing.trimeshes);
    renderer = new WebGLRenderer({ antialias: true });
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PRESETS[quality].dpr));
    paperPass = createGradedPaperPass(renderer, quality);
    composition = measure("composition", () => createWorldScene({ ...physicsBackend, scene, quality, paper: paperPass, zoneBoxes: fixedMeshes, zoneBounds, deferredGround: true }));
    if (!controller) controller = await (await import("./raycast")).createController(composition.collisionMeshes);
    controller.teleport(worldSpawn());
  } catch (error) {
    dressing?.dispose();
    zoneScenes?.dispose();
    removeDressingTrimeshes?.();
    forestSun?.dispose();
    farLandscape?.dispose();
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
  let motionOverride: boolean | undefined;
  let reducedMotion = motionPreference?.matches ?? false;
  let syncMotion = () => {};
  const bike = createVehicleView({ surfaceHeight, reducedMotion });
  function updateMotionPreference() {
    const previous = reducedMotion;
    reducedMotion = motionOverride ?? motionPreference?.matches ?? false;
    container.dataset.worldMotion = reducedMotion ? "reduced" : "full";
    composed.setReducedMotion(reducedMotion);
    bike.setReducedMotion(reducedMotion);
    if (previous !== reducedMotion) syncMotion();
  }
  function setMotion(event: Event) {
    const reduced = (event as CustomEvent).detail?.reduced;
    if (typeof reduced !== "boolean") return;
    motionOverride = reduced;
    updateMotionPreference();
  }
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
  // B2-045: rigged character (D-23) with Idle/Walk/Run; the loader falls back to the capsule on any failure.
  const character = await loadCharacter(CHARACTER_URL);
  const player = character.root;
  scene.add(player);
  const animator = createCharacterAnimator(character, { reducedMotion });
  const lastPlayer = new Vector3();
  // Teleport signs retain their separate interaction; zone scenes own all content objects.
  function placeProp(kind: PropKind, x: number, z: number, name: string) {
    const mesh = createProp(kind);
    mesh.geometry.computeBoundingBox();
    mesh.position.set(x, surfaceHeight(x, z) - mesh.geometry.boundingBox!.min.y, z);
    mesh.name = name;
    mesh.updateMatrixWorld(true);
    scene.add(mesh);
    return mesh;
  }
  contentTargets.push(...zones.map(zone => zone.target));
  const props = SIGNPOSTS.map(post => {
    const mesh = placeProp("signpost", post.position.x, post.position.z, `teleport-${post.zoneId}`);
    return { id: mesh.name, kind: "teleport" as const, zoneId: post.zoneId, position: mesh.position, mesh };
  });
  let story = initialStory();
  let ending: ReturnType<typeof createEndingController> | undefined;
  let endingOptions: Parameters<typeof createEndingController>[0] | undefined;
  let sunsetBoost = 0;
  let chimeTime = 0;
  const secretSolids: Box3[] = [];
  const secretMeshes: Mesh[] = [];
  const secretTargets = SECRETS.map(secret => {
    const root = createSecretLandmark(secret.landmark);
    const { x, z } = secret.position;
    root.position.set(x, surfaceHeight(x, z), z);
    root.updateMatrixWorld(true);
    root.traverse(object => { if ((object as Mesh).isMesh) secretMeshes.push(object as Mesh); });
    scene.add(root);
    if (secret.landmark === "vine-arch-mirror" || secret.landmark === "bench") {
      const size = secret.landmark === "bench" ? new Vector3(2.2, 1.05, 1.5) : new Vector3(1.95, 2.5, 0.25);
      secretSolids.push(new Box3().setFromCenterAndSize(root.position.clone().add(new Vector3(0, size.y / 2, 0)), size));
    }
    return { id: secret.id, kind: "secret" as const, zoneId: "quiet-shore" as const,
      position: root.position.clone().add(new Vector3(0, HEIGHT, 0)), root };
  });
  const chimes = secretTargets.find(target => target.id === "forgotten-sound")!.root.getObjectByName("chimes")!;
  // Shared swept boxes protect walking and riding with either physics backend.
  const stepPhysics = physics.step.bind(physics);
  physics.step = (x, z, dt) => {
    const delta = new Vector3(x * dt, 0, z * dt);
    const distance = delta.length();
    let travel = distance;
    if (distance > 0) {
      const ray = new Ray(physics.position, delta.clone().normalize());
      for (const solid of secretSolids) {
        const box = solid.clone();
        box.min.add(new Vector3(-RADIUS, -HEIGHT, -RADIUS));
        box.max.add(new Vector3(RADIUS, HEIGHT, RADIUS));
        const hit = ray.intersectBox(box, new Vector3());
        if (hit) travel = Math.min(travel, Math.max(0, hit.distanceTo(ray.origin) - 0.01));
      }
    }
    const scale = distance > 0 ? travel / distance : 1;
    stepPhysics(x * scale, z * scale, dt);
  };
  // Include the one-metre dry shoulder: the model's margin leaves a 2 m lateral limit.
  const corridor: VehicleCorridor = {
    length: pathLength(),
    halfWidthAt: () => PATH_WIDTH / 2 + 1,
    pointAt: s => pathPointAt(s / corridor.length),
    tangentAt: s => pathPointAt(Math.min(1, (s + 0.1) / corridor.length))
      .sub(pathPointAt(Math.max(0, (s - 0.1) / corridor.length))).normalize(),
  };
  // Downstream and on the outer bank, clear of both First Light signs.
  const parkedVehicle = initialVehicle(corridor, 6, -2);
  let vehicle = parkedVehicle;
  let unsafeStop = false;
  scene.add(bike.group);
  const vehicleTarget: InteractionTarget = {
    id: "gd110", kind: "vehicle", zoneId: "first-light", position: new Vector3(),
  };
  function publishVehicle(dt = 0) {
    bike.update(vehicle, corridor, dt);
    Object.assign(vehicleTarget.position, bike.group.position);
    vehicleTarget.position.y += HEIGHT;
    player.visible = vehicle.mode !== "ride";
    container.dataset.worldVehicle = vehicle.mode === "walk" ? "parked" : vehicle.cruise ? "cruise" : "manual";
  }
  publishVehicle();
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
  let cinematicUI: { skip: HTMLButtonElement; bars: HTMLDivElement[]; fade: HTMLDivElement } | undefined;
  // Lead batch 25: the view reaches the sea horizon and far ridges; shorter on lower quality.
  let gameplayFar = GAMEPLAY_FAR[quality];
  camera.far = gameplayFar;
  camera.updateProjectionMatrix();
  const introPending = () => intro?.state !== "done";
  const cinematicLocked = () => introPending() || ending?.inputLocked === true;
  let teleport = createTeleport({ reducedMotion });
  let teleportFrom: ZoneId | undefined;
  let destination: ZoneId | undefined;
  let teleportCover: HTMLDivElement | undefined;
  container.dataset.worldTeleport = "idle";
  state = { ...state, position: { ...physics.position }, sessionProgress: { ...state.sessionProgress, lastSafePosition: { ...physics.position } } };
  let yaw = Math.atan2(7, 9);
  let mascotEnabled = true;
  const mascot = createMascotMesh();
  mascot.visible = false;
  scene.add(mascot);
  container.dataset.worldMascot = "on";
  const mascotForward = new Vector3();
  function mascotInput(teleported = false) {
    const forward = vehicle.mode === "ride" ? corridor.tangentAt(vehicle.s) : player.getWorldDirection(mascotForward);
    return {
      playerPosition: { x: physics.position.x, y: physics.position.y - HEIGHT, z: physics.position.z },
      heading: Math.atan2(-forward.x, -forward.z),
      terrainHeight: surfaceHeight,
      reducedMotion,
      teleported,
    };
  }
  let mascotFollow = createMascotFollowState(mascotInput());
  mascot.position.copy(mascotFollow.position);
  const mascotHints = createMascotHints();
  let mascotTime = 0;
  let mascotHintZone: ZoneId | undefined;
  let mascotHintTimer: ReturnType<typeof setTimeout> | undefined;
  let lastAmbience = -Infinity;
  let zoom = INITIAL_ZOOM;
  let arm = INITIAL_ZOOM;
  let belowTerrainFrames = 0;
  let drag: { id: number; x: number } | undefined;
  const raycaster = new Raycaster();
  zones.forEach(zone => zone.group.traverse(object => { if ((object as Mesh).isMesh) zoneMeshes.push(object as Mesh); }));
  const cameraObstacles = () => [...composed.collisionMeshes, ...zoneMeshes, ...props.map(prop => prop.mesh), ...secretMeshes];
  const sightRay = new Raycaster();
  interactionTargets.push(...contentTargets, ...props, ...secretTargets, vehicleTarget);
  const interaction = createInteraction({
    container,
    targets: interactionTargets,
    locale: () => locale,
    player: () => physics.position,
    enabled: cameraEnabled,
    discover,
    ride() {
      if (!cameraEnabled()) return false;
      const result = mount(vehicle, Math.hypot(physics.position.x - vehicleTarget.position.x, physics.position.z - vehicleTarget.position.z));
      if (!result.ok) return false;
      vehicle = result.state;
      unsafeStop = false;
      physics.teleport(vehicleTarget.position);
      updateMascot(0, true);
      clear();
      publishVehicle();
      interaction.update();
      return true;
    },
    hint() {
      if (!cameraEnabled() || vehicle.mode !== "ride") return undefined;
      if (nearestSecret({ x: physics.position.x, y: physics.position.y - HEIGHT, z: physics.position.z })) return WORLD_COPY[locale].secretHint;
      return unsafeStop ? WORLD_COPY[locale].vehicleUnsafe
        : `${VEHICLE_LABELS[locale].getOff} · ${VEHICLE_LABELS[locale].cruise}`;
    },
    chooseTeleport(from) {
      if (cinematicLocked() || teleport.inputLocked) return false;
      teleport = createTeleport({ reducedMotion });
      if (!teleport.startChoosing(from)) return false;
      teleportFrom = from;
      parkVehicle();
      clear();
      container.dataset.worldTeleport = "active";
      interaction.update();
      return true;
    },
    lineOfSight(target: InteractionTarget) {
      const direction = new Vector3().copy(target.position).sub(physics.position);
      sightRay.set(physics.position, direction.clone().normalize());
      sightRay.far = Math.max(0, direction.length() - 0.01);
      const ownSecret = secretTargets.find(secret => secret.id === target.id)?.root;
      const ownZone = zones.find(zone => zone.target.id === target.id);
      const blockers = cameraObstacles().filter(mesh => !props.some(prop => prop.id === target.id && prop.mesh === mesh)
        && !ownSecret?.getObjectById(mesh.id) && !ownZone?.group.getObjectById(mesh.id) && !ownZone?.boxes.includes(mesh as typeof ownZone.boxes[number]));
      return sightRay.intersectObjects(blockers).length === 0;
    },
    visit(zoneId) {
      state = sessionReducer(state, { type: "visitZone", zoneId });
    },
  });
  // Adjacent to the interaction line, with no focusable content or input interception.
  const mascotHint = document.createElement("div");
  mascotHint.dataset.worldMascotHint = "true";
  mascotHint.setAttribute("aria-live", "polite");
  mascotHint.setAttribute("aria-atomic", "true");
  Object.assign(mascotHint.style, {
    position: "fixed", left: "50%", bottom: "8.5rem", transform: "translateX(-50%)",
    width: "max-content", maxWidth: "calc(100% - 2rem)", textAlign: "center",
    fontSize: ".875rem", color: PALETTE.ink, pointerEvents: "none", zIndex: "1",
  });
  container.appendChild(mascotHint);
  function clearMascotHint() {
    clearTimeout(mascotHintTimer);
    mascotHintTimer = undefined;
    mascotHintZone = undefined;
    mascotHint.textContent = "";
  }
  function updateMascot(dt: number, snap = false) {
    mascot.visible = mascotEnabled && !cinematicLocked();
    mascotFollow = stepMascotFollow(mascotFollow, mascotInput(snap), dt);
    mascot.position.copy(mascotFollow.position);
  }
  function nearestZone() {
    return ZONES.reduce((nearest, zone) =>
      Math.hypot(physics.position.x - zone.position.x, physics.position.z - zone.position.z)
        < Math.hypot(physics.position.x - nearest.position.x, physics.position.z - nearest.position.z) ? zone : nearest);
  }
  // Opt-in QA hook: no per-frame work or controller/camera references escape.
  const journeyContainer = container as HTMLElement & { __tqaJourney?: {
    position(): { x: number; y: number; z: number };
    cameraYaw(): number;
    zone(): string | null;
    goTo(zoneId: string): Promise<void>;
  } };
  const journey = window.__tqaJourney === true ? Object.freeze({
    position: () => ({ x: physics.position.x, y: physics.position.y, z: physics.position.z }),
    cameraYaw: () => yaw,
    zone: () => {
      const zone = nearestZone();
      return Math.hypot(physics.position.x - zone.position.x, physics.position.z - zone.position.z) <= zone.radius ? zone.id : null;
    },
    goTo: async (zoneId: string) => {
      const to = ZONE_IDS.find(id => id === zoneId);
      if (!to) throw new Error(`Invalid journey zone: ${zoneId}`);
      if (disposed || cinematicLocked() || contextLost || teleport.inputLocked) throw new Error("Journey teleport unavailable");
      // The chooser rejects same-zone travel; use another origin to allow QA to revisit any arrival.
      const from = nearestZone().id === to ? ZONE_IDS.find(id => id !== to)! : nearestZone().id;
      teleport = createTeleport({ reducedMotion });
      teleport.startChoosing(from);
      teleportFrom = from;
      container.dataset.worldTeleport = "active";
      let arrived = false;
      const ended = (event: Event) => { arrived = (event as CustomEvent).detail?.to === to; };
      container.addEventListener("tqa:teleport-end", ended);
      try {
        teleportTo(new CustomEvent(TELEPORT_TO_EVENT, { detail: { to } }));
        const deadline = performance.now() + 60_000;
        while (!disposed && container.dataset.worldTeleport !== "idle") {
          if (performance.now() >= deadline) throw new Error("Journey teleport timed out");
          await new Promise<void>(resolve => setTimeout(resolve, 16));
        }
        if (disposed || !arrived) throw new Error("Journey teleport cancelled");
        if (!zoneScenes!.ensure(to)) throw new Error(`Journey zone not built: ${to}`);
      } finally {
        container.removeEventListener("tqa:teleport-end", ended);
      }
    },
  }) : undefined;
  if (journey) journeyContainer.__tqaJourney = journey;
  function updateMascotHint(dt: number) {
    if (canSimulate(state)) mascotTime += dt;
    if (cinematicLocked()) { clearMascotHint(); return; }
    const zone = nearestZone();
    const zoneId = Math.hypot(physics.position.x - zone.position.x, physics.position.z - zone.position.z) <= zone.radius ? zone.id : null;
    const eligible = cameraEnabled();
    if (!mascotEnabled || !eligible || mascotHintZone !== zoneId) clearMascotHint();
    const hint = mascotHints.update({ zoneId, locale, now: mascotTime, enabled: mascotEnabled, eligible });
    if (!hint) return;
    mascotHintZone = hint.zoneId;
    mascotHint.textContent = hint.text;
    mascotHintTimer = setTimeout(clearMascotHint, 6000);
  }
  function setMascot(event: Event) {
    const enabled = (event as CustomEvent).detail?.enabled;
    if (typeof enabled !== "boolean") return;
    mascotEnabled = enabled;
    container.dataset.worldMascot = enabled ? "on" : "off";
    updateMascot(0, enabled);
    if (!enabled) clearMascotHint();
  }
  function publishAmbience(now: number) {
    if (!canSimulate(state) || now - lastAmbience < 250) return;
    lastAmbience = now;
    const { x, y, z } = physics.position;
    container.dispatchEvent(new CustomEvent("tqa:ambience", {
      bubbles: false,
      detail: ambienceMixAt({
        distanceToRiver: nearestRiver(x, z).distance,
        // Mean shoreline of shoreHeight; include elevation above the water surface.
        distanceToSea: Math.hypot(Math.max(0, z + 880), Math.max(0, y - HEIGHT - waterLevelAt(z))),
        zoneBiome: nearestZone().biome,
        timeOfDay: timeOfDayAt(nearestPath(x, z).t),
      }),
    }));
  }
  const feedback = document.createElement("p");
  feedback.dataset.worldStoryFeedback = "true";
  feedback.setAttribute("aria-live", "polite");
  feedback.setAttribute("aria-atomic", "true");
  // Layout lives in portfolio.css (poem card above the E hint); inline styles are the bare fallback.
  Object.assign(feedback.style, {
    position: "absolute", bottom: "4rem", left: "1rem", right: "1rem", fontSize: ".875rem", pointerEvents: "none",
    whiteSpace: "pre-line", fontStyle: "italic",
  });
  container.appendChild(feedback);
  // Q-32: Duy's poems show in English first; the button reveals the Vietnamese original (and back).
  let poemLanguage: WorldLocale = "en";
  const translate = document.createElement("button");
  translate.type = "button";
  translate.dataset.worldStoryTranslate = "true";
  translate.hidden = true;
  Object.assign(translate.style, { position: "absolute", bottom: "1.5rem", left: "1rem", fontSize: ".8rem", zIndex: "1" });
  container.appendChild(translate);
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  const POEM_SECONDS = 14_000;
  function renderPoem() {
    if (!story.lastFeedback) return;
    feedback.textContent = storyFeedbackText(story.lastFeedback, poemLanguage);
    feedback.setAttribute("lang", poemLanguage);
    translate.textContent = POEM_TOGGLE[poemLanguage === "en" ? "toVi" : "toEn"][locale];
  }
  function hidePoem() {
    feedback.textContent = "";
    translate.hidden = true;
    feedbackTimer = undefined;
  }
  function holdPoem() {
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(hidePoem, POEM_SECONDS);
  }
  function togglePoem() {
    poemLanguage = poemLanguage === "en" ? "vi" : "en";
    renderPoem();
    holdPoem();
  }
  translate.addEventListener("click", togglePoem);
  translate.addEventListener("pointerenter", holdPoem);
  translate.addEventListener("focus", holdPoem);
  function discover(id: string) {
    if (!cameraEnabled()) return false;
    const secret = nearestSecret({ x: physics.position.x, y: physics.position.y - HEIGHT, z: physics.position.z });
    if (!secret || secret.id !== id) return false;
    const previous = story;
    story = storyReducer(story, { type: "discover", id: secret.id });
    // Repeated visits still speak the appropriate line, without another discovery event.
    const response = secret.id === "unwritten-page" && !story.found.has(secret.id)
      ? { id: secret.id, feedback: "not-yet" as const } : { id: secret.id, feedback: "found" as const };
    story = { ...story, lastFeedback: response };
    poemLanguage = "en";
    translate.hidden = false;
    renderPoem();
    holdPoem();
    if (story.found.size > previous.found.size) {
      container.dispatchEvent(new CustomEvent("tqa:secret-found", { bubbles: false, detail: { id: secret.id, count: story.found.size } }));
    }
    if (secret.id === "unwritten-page" && story.endingState === "ready") startEnding();
    return true;
  }
  publishEnding("idle");
  let keys: ReadonlySet<string> = new Set();
  let accumulator = 0;
  let last = 0;
  let frame = 0;
  let disposed = false;
  const obstacleBounds = new WeakMap<Mesh, Map<number, Box3>>();
  function solidBounds(radius: number) {
    // Compose exposes terrain in both lists, and trunk collider meshes only in collisionMeshes.
    // Signs use their existing mesh too; both driving modes share this same sweep and controller.
    return [...composed.collisionMeshes.filter(mesh => !composed.visibleMeshes.includes(mesh)), ...props.map(prop => prop.mesh)].map(mesh => {
      let cache = obstacleBounds.get(mesh);
      if (!cache) { cache = new Map(); obstacleBounds.set(mesh, cache); }
      let bounds = cache.get(radius);
      if (!bounds) {
        bounds = new Box3().setFromObject(mesh);
        // Minkowski expansion for an upright body: sweep the feet along the ground.
        bounds.min.add(new Vector3(-radius, -HEIGHT * 2, -radius));
        bounds.max.add(new Vector3(radius, -0.1, radius));
        cache.set(radius, bounds);
      }
      return bounds;
    }).concat(secretSolids.map(solid => {
      const box = solid.clone();
      box.min.add(new Vector3(-radius, -HEIGHT * 2, -radius));
      box.max.add(new Vector3(radius, -0.1, radius));
      return box;
    }));
  }
  function groundPoint(point: { x: number; z: number }) {
    return new Vector3(point.x, surfaceHeight(point.x, point.z), point.z);
  }
  function clearance(from: Vector3, to: Vector3, obstacles: readonly Box3[]) {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    const ray = new Ray(from, direction.normalize());
    let nearest = Infinity;
    for (const box of obstacles) {
      if (box.containsPoint(from)) return 0;
      if (!distance) continue;
      const hit = ray.intersectBox(box, new Vector3());
      if (hit) nearest = Math.min(nearest, hit.distanceTo(from));
    }
    return nearest;
  }
  function safeDismountPosition() {
    const centre = vehiclePosition(vehicle, corridor);
    const tangent = corridor.tangentAt(vehicle.s);
    const obstacles = solidBounds(0.4);
    for (const side of [1, -1]) {
      const candidate = groundPoint({ x: centre.x + tangent.z * side * 1.5, z: centre.z - tangent.x * side * 1.5 });
      const dry = [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]].every(([dx, dz]) => {
        const x = candidate.x + dx!, z = candidate.z + dz!;
        const height = surfaceHeight(x, z);
        return height > waterLevelAt(z) + 0.08 && Math.abs(height - candidate.y) < 0.3;
      });
      const from = groundPoint(centre);
      if (dry && composed.contains(candidate) && clearance(from, candidate, obstacles) > from.distanceTo(candidate)
        && clearance(candidate, candidate, obstacles) > 0) return candidate.add(new Vector3(0, HEIGHT + 0.02, 0));
    }
    return undefined;
  }
  function getOffVehicle() {
    const safe = safeDismountPosition();
    const result = dismount(vehicle, !!safe);
    unsafeStop = !result.ok;
    if (result.ok && safe) {
      vehicle = result.state;
      physics.teleport(safe);
      updateMascot(0, true);
      state = sessionReducer({ ...state, position: { ...safe } }, { type: "safePosition", position: safe });
      clear();
    }
    publishVehicle();
    interaction.update();
  }
  function parkVehicle() {
    if (vehicle.mode !== "ride") return;
    // Travel/recovery owns the destination; release the rider before resetting the bike.
    vehicle = dismount({ ...vehicle, speed: 0 }, true).state;
    vehicle = parkedVehicle;
    unsafeStop = false;
    publishVehicle();
    updateMascot(0, true);
  }
  function driveVehicle(dt: number) {
    const obstacles = solidBounds(0.85);
    let obstacleAhead = Infinity;
    let from = groundPoint(vehiclePosition(vehicle, corridor));
    // Follow the curve, rather than a straight heading ray that can miss a bend's obstacle.
    if (vehicle.cruise) {
      for (let distance = 0.5; distance <= VEHICLE_LIMITS.obstacleSlowDistance; distance += 0.5) {
        const to = groundPoint(vehiclePosition({ ...vehicle, s: Math.min(corridor.length, vehicle.s + distance) }, corridor));
        const hit = clearance(from, to, obstacles);
        if (hit <= from.distanceTo(to)) { obstacleAhead = distance - 0.5 + hit; break; }
        from = to;
      }
    }
    const proposal = stepVehicle(vehicle, corridor, dt, {
      w: keys.has("KeyW"), s: keys.has("KeyS"), a: keys.has("KeyA"), d: keys.has("KeyD"), obstacleAhead,
    });
    const before = physics.position.clone();
    from = groundPoint(before);
    const to = groundPoint(vehiclePosition(proposal, corridor));
    const distance = from.distanceTo(to);
    if (distance > 0 && clearance(from, to, obstacles) <= distance) {
      vehicle = { ...vehicle, speed: 0 };
      physics.resetVelocity();
      return;
    }
    physics.step((to.x - before.x) / dt, (to.z - before.z) / dt, dt);
    if (Math.hypot(physics.position.x - to.x, physics.position.z - to.z) > 0.02) {
      // Reject any slide outside the proposal, keeping model, collider and view on the corridor.
      physics.teleport(before);
      vehicle = { ...vehicle, speed: 0 };
    } else {
      vehicle = proposal;
      if (distance > 0.001) unsafeStop = false;
    }
    state = { ...state, position: { ...physics.position } };
  }
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
    if (paused) {
      vehicle = cancelCruise(vehicle, reason === "windowBlur" ? "blur" : "ui-open");
      publishVehicle();
    }
    state = sessionReducer(state, { type: "pause", reason, paused });
    if (paused) clearMascotHint();
    metricStart = 0;
    metricFrames = 0;
    clear({ type: reason === "windowBlur" ? "blur" : "hidden" });
    publishState();
    interaction.update();
  }
  function cameraEnabled() {
    return canSimulate(state) && !cinematicLocked() && !teleport.inputLocked && !isInputTarget(document.activeElement);
  }
  function keydown(event: KeyboardEvent) {
    if ((intro?.inputLocked || ending?.inputLocked) && (event.code === "Escape" || (event.code === "Enter" && document.activeElement === cinematicUI?.skip))) {
      event.preventDefault();
      skipCinematic();
      return;
    }
    if (vehicle.mode === "ride" && cameraEnabled() && !isInputTarget(event.target)) {
      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        const secret = nearestSecret({ x: physics.position.x, y: physics.position.y - HEIGHT, z: physics.position.z });
        if (secret && discover(secret.id)) return;
        getOffVehicle();
        return;
      }
      if (event.code === "KeyC" && !event.repeat) {
        event.preventDefault();
        vehicle = toggleCruise(vehicle);
      }
      if (event.code === "Escape" || event.code === "KeyS") {
        vehicle = cancelCruise(vehicle, event.code === "Escape" ? "escape" : "brake");
      }
      publishVehicle();
    }
    if (vehicle.mode === "ride" && event.code === "KeyE") return;
    if (interaction.keydown(event)) return;
    if (cameraEnabled() && !isInputTarget(event.target)) {
      if (["Equal", "NumpadAdd"].includes(event.code)) zoom = clampZoom(zoom - 0.75);
      if (["Minus", "NumpadSubtract"].includes(event.code)) zoom = clampZoom(zoom + 0.75);
      if (["ArrowLeft", "ArrowRight", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(event.code)) event.preventDefault();
    }
    keys = inputReducer(keys, { type: "keydown", event, enabled: canSimulate(state) && !cinematicLocked() && !teleport.inputLocked });
  }
  function keyup(event: KeyboardEvent) {
    keys = inputReducer(keys, { type: "keyup", event });
  }
  function focusin(event: FocusEvent) {
    if (isInputTarget(event.target)) {
      vehicle = cancelCruise(vehicle, "ui-open");
      publishVehicle();
      clear({ type: "focusin", event });
    }
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
    if (cinematicLocked() || teleport.inputLocked) return;
    parkVehicle();
    const safe = nearestSafePath(physics.position);
    composed.update(safe, 0);
    state = sessionReducer(state, { type: "safePosition", position: safe });
    state = locomotion.recover(state);
    updateMascot(0, true);
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
    // The character is not clickable and must not shadow objects behind it (Lead, B2-100: Horizon click).
    const hit = raycaster.intersectObjects([...composed.visibleMeshes, ...zoneMeshes, bike.group, ...props.map(prop => prop.mesh), ...secretTargets.map(target => target.root)])[0];
    if (hit && (hit.object === bike.group || bike.group.getObjectById(hit.object.id))) {
      interaction.click(vehicleTarget.id);
      return;
    }
    const target = props.find(prop => prop.mesh === hit?.object || prop.mesh === hit?.object.parent);
    if (target) interaction.click(target.id);
    const content = contentTargets.find(target => hit && target.root.getObjectById(hit.object.id));
    if (content) interaction.click(content.id);
    const secret = secretTargets.find(target => hit && target.root.getObjectById(hit.object.id));
    if (secret) interaction.click(secret.id);
  }
  function pointerdown(event: PointerEvent) {
    if (event.button !== 0 || !cameraEnabled()) return;
    const rect = gpu.domElement.getBoundingClientRect();
    raycaster.far = Infinity;
    raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    // Terrain is empty space; visible character, trees and props retain click ownership.
    if (raycaster.intersectObjects([...composed.foliageMeshes, ...zoneMeshes, player, bike.group, ...props.map(prop => prop.mesh), ...secretTargets.map(target => target.root)]).length) return;
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
    gpu.domElement.setAttribute("aria-label", WORLD_COPY[locale].canvas);
    if (cinematicUI) cinematicUI.skip.textContent = WORLD_COPY[locale].skip;
    // Locale changes only relabel the toggle; the poem stays in the language the reader chose.
    if (feedback.textContent && story.lastFeedback) renderPoem();
    if (mascotHintZone) mascotHint.textContent = MASCOT_HINTS[mascotHintZone][locale];
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
    gameplayFar = GAMEPLAY_FAR[quality];
    if (!introPending() && !ending?.inputLocked) { camera.far = gameplayFar; camera.updateProjectionMatrix(); }
    composed.setQuality(quality);
    gpu.setPixelRatio(Math.min(window.devicePixelRatio, PRESETS[quality].dpr));
    paper.setQuality(quality);
    gpu.shadowMap.enabled = sun.castShadow;
    resize();
    publishState();
  }
  function teleportTo(event: Event) {
    if (cinematicLocked() || contextLost || teleport.state !== "choosing") return;
    const to = (event as CustomEvent).detail?.to;
    if (!ZONE_IDS.includes(to)) return;
    const start = teleport.choose(to);
    if (!start) return;
    parkVehicle();
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
    teleport = createTeleport({ reducedMotion });
    teleportFrom = undefined;
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
      zoneScenes!.ensure(destination);
      const arrival = arrivalPoint(destination);
      const position = new Vector3(arrival.position.x, surfaceHeight(arrival.position.x, arrival.position.z) + HEIGHT + 0.02, arrival.position.z);
      composed.update(position, 0);
      physics.teleport(position);
      state = sessionReducer({ ...state, position: { ...position } }, { type: "safePosition", position });
      yaw = arrival.yaw;
      arm = zoom;
      locomotion.reset();
      player.position.copy(physics.position);
      updateMascot(0, true);
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
    const distance = zoom * (vehicle.mode === "ride" ? 1.3 : 1);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(cameraObstacles())[0];
    arm = springArm(arm, distance, hit?.distance, dt);
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
  function removeCinematicUI() {
    if (!cinematicUI) return;
    cinematicUI.skip.removeEventListener("click", skipCinematic);
    cinematicUI.skip.remove();
    for (const bar of cinematicUI.bars) bar.remove();
    cinematicUI.fade.remove();
    cinematicUI = undefined;
  }
  function applyCinematicPose(pose: IntroFrame, playing: boolean) {
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.fov = pose.fov;
    // The river overview is hundreds of metres above the gameplay camera.
    camera.far = playing ? Math.max(gameplayFar, 2000) : gameplayFar;
    camera.updateProjectionMatrix();
    // Lead: boost on top of direction C's mist (B2-038), not the pass default.
    paper.setMist({ strength: Math.min(1, WORLD_DIRECTION.background.mist.strength + pose.mistBoost) });
    // Lead: world-scale fog (260 m) would dissolve the 460 m overview into blank paper; stretch it with
    // the camera-to-target distance during the flight and restore the directed distances at handoff.
    const { near, far } = WORLD_DIRECTION.background.fog;
    const reach = playing ? pose.position.distanceTo(pose.target) : 0;
    paper.setFog({ near: Math.max(near, reach * 0.6), far: Math.max(far, reach * 1.8) });
    if (intro?.state === "playing") {
      // Forest fog must clear the aerial view in both the post pass and Low's native fog.
      const atmosphere = introAtmosphere(pose.position, pose.mistBoost);
      paper.setFog(atmosphere.fog);
      if (scene.fog && "near" in scene.fog) Object.assign(scene.fog, atmosphere.fog);
      // setFog resets graded mist: apply the thin valley layer afterwards.
      paper.setMist(atmosphere.mist);
    }
    if (cinematicUI) {
      for (const bar of cinematicUI.bars) bar.style.height = `${pose.letterbox * 12}%`;
      cinematicUI.fade.style.opacity = String(pose.paperOpacity);
    }
  }
  function applyIntro(pose: IntroFrame) {
    const clearAir = WORLD_DIRECTION === STYLE_PRESETS.R;
    applyCinematicPose(clearAir ? { ...pose, paperOpacity: 0 } : pose, intro?.state !== "done");
    // Reduced motion keeps its short fixed-pose fade, using ink instead of a cream paper wash.
    if (clearAir && cinematicUI && pose.paperOpacity > 0) {
      cinematicUI.fade.style.background = PALETTE.ink;
      cinematicUI.fade.style.opacity = String(pose.paperOpacity);
    }
    if (intro?.state === "done") {
      composed.setPreload(0);
      paper.setCorridor(null);
      removeCinematicUI();
      clear();
      gpu.domElement.focus({ preventScroll: true });
      interaction.update();
      publishIntro("done");
      updateMascot(0, true);
    }
  }
  function skipCinematic() {
    if (contextLost || disposed) return;
    if (ending?.inputLocked) applyEnding(ending.skip());
    else if (intro?.inputLocked) applyIntro(intro.skip());
  }
  function createCinematicUI(kind: "intro" | "ending") {
    const cinematicColor = WORLD_DIRECTION === STYLE_PRESETS.R ? PALETTE.ink : PALETTE.paper;
    const bars = ["top", "bottom"].map(edge => {
      const bar = document.createElement("div");
      bar.setAttribute("aria-hidden", "true");
      bar.dataset.worldLetterbox = edge;
      Object.assign(bar.style, { position: "absolute", left: "0", right: "0", [edge]: "0", background: cinematicColor, pointerEvents: "none", zIndex: "2" });
      container.appendChild(bar);
      return bar;
    });
    const fade = document.createElement("div");
    fade.setAttribute("aria-hidden", "true");
    Object.assign(fade.style, { position: "absolute", inset: "0", background: cinematicColor, pointerEvents: "none", zIndex: "2" });
    container.appendChild(fade);
    const skip = document.createElement("button");
    skip.type = "button";
    if (kind === "intro") skip.dataset.worldIntroSkip = "true";
    else skip.dataset.worldEndingSkip = "true";
    skip.textContent = WORLD_COPY[locale].skip;
    Object.assign(skip.style, { position: "absolute", bottom: "5.5rem", right: "1rem", zIndex: "3", color: PALETTE.ink, background: PALETTE.paper, padding: ".5rem 1rem", cursor: "pointer" });
    skip.addEventListener("click", skipCinematic);
    container.appendChild(skip);
    cinematicUI = { skip, bars, fade };
    return skip;
  }
  function startIntro() {
    if (intro?.state !== "idle" || !canSimulate(state)) return;
    clear();
    const skip = createCinematicUI("intro");
    // The overview shows the first bends of the river: stream them before the first intro frame.
    composed.setPreload(INTRO_PRELOAD_M);
    composed.update(physics.position, 0);
    // Direction R shows the full forest and sky, without the legacy paper corridor.
    paper.setCorridor(WORLD_DIRECTION === STYLE_PRESETS.R ? null : introCorridor(physics.position), TERRAIN_RADIUS);
    applyIntro(intro.start());
    updateMascot(0);
    clearMascotHint();
    const active = document.activeElement;
    if (!active || active === document.body || active === gpu.domElement) skip.focus({ preventScroll: true });
    interaction.update();
    publishIntro("playing");
  }
  function publishEnding(next: "idle" | "playing" | "seen") {
    if (container.dataset.worldEnding === next) return;
    container.dataset.worldEnding = next;
    container.dispatchEvent(new CustomEvent("tqa:ending", { bubbles: false, detail: { state: next } }));
  }
  function startEnding() {
    if (ending || story.endingState !== "ready" || cinematicLocked() || teleport.inputLocked) return;
    parkVehicle();
    clear();
    const postcard = ZONES.find(zone => zone.id === "last-postcard")!;
    const landing = pathPointAt(postcard.t - 0.003);
    landing.y = surfaceHeight(landing.x, landing.z) + HEIGHT + 0.02;
    // Match the orbit camera at the dry final landing, facing Last Postcard.
    yaw = Math.atan2(landing.x - postcard.position.x, landing.z - postcard.position.z);
    zoom = arm = INITIAL_ZOOM;
    const endPosition = landing.clone().add(new Vector3(Math.sin(yaw) * Math.cos(CAMERA_PITCH), Math.sin(CAMERA_PITCH), Math.cos(yaw) * Math.cos(CAMERA_PITCH)).multiplyScalar(zoom));
    endPosition.y = Math.max(endPosition.y, surfaceHeight(endPosition.x, endPosition.z) + CAMERA_CLEARANCE);
    endingOptions = {
      bench: secretTargets.find(target => target.id === "unwritten-page")!.root.position,
      gameplayPose: { position: endPosition, target: landing, fov: 55 },
      reducedMotion,
    };
    ending = createEndingController(endingOptions);
    story = storyReducer(story, { type: "startEnding" });
    createCinematicUI("ending").focus({ preventScroll: true });
    composed.setPreload(INTRO_PRELOAD_M);
    publishEnding("playing");
    applyEnding(ending.start());
    updateMascot(0);
    clearMascotHint();
    interaction.update();
  }
  function applyEnding(pose: EndingFrame) {
    if (!ending) return;
    sunsetBoost = pose.sunsetBoost;
    applyCinematicPose(pose, ending.inputLocked);
    if (ending.state !== "done") return;
    const position = ending.finalPlayerPosition;
    position.y = surfaceHeight(position.x, position.z) + HEIGHT + 0.02;
    composed.setPreload(0);
    composed.update(position, 0);
    physics.teleport(position);
    state = sessionReducer({ ...state, position: { ...position } }, { type: "safePosition", position });
    player.position.copy(physics.position);
    updateMascot(0, true);
    story = storyReducer(story, { type: "finishEnding", valid: true });
    clear();
    removeCinematicUI();
    gpu.domElement.focus({ preventScroll: true });
    publishEnding("seen");
    interaction.update();
  }
  function updateEndingGrade() {
    if (!sunsetBoost) return;
    const pathT = nearestPath(physics.position.x, physics.position.z).t;
    const base = timeOfDayAt(pathT);
    const tod = base + (1 - base) * sunsetBoost;
    // B2-155: the ending happens on the coast; keep the same sunset atmosphere compose applies.
    const grade = applyCoastAtmosphere(directGrade(lightingAt(tod), tod), pathT);
    paper.setGrade(grade);
    scene.fog?.color.copy(grade.fogColor);
    sun.color.copy(grade.sunColor);
    sun.intensity = grade.sunIntensity;
    sun.position.copy(physics.position).addScaledVector(grade.sunDirection, 50);
    // Compose owns these scene resources; update their existing uniforms/lights.
    const sky = scene.getObjectByName("position-graded-sky") as Mesh | undefined;
    if (sky) {
      const uniforms = (sky.material as ShaderMaterial).uniforms;
      uniforms.skyTop!.value.copy(grade.skyTop);
      uniforms.skyHorizon!.value.copy(grade.skyHorizon);
      // B2-162: the sky dome draws the sun disc/glow; keep it on the ending's sun.
      uniforms.sunDirection?.value.copy(grade.sunDirection);
    }
    for (const light of scene.children) if (light instanceof HemisphereLight) {
      light.color.copy(grade.hemiSky);
      light.groundColor.copy(grade.hemiGround);
      light.intensity = grade.hemiIntensity;
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
    vehicle = cancelCruise(vehicle, "ui-open");
    publishVehicle();
    clear();
    clearMascotHint();
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
    if (canSimulate(state) && !cinematicLocked() && !teleport.inputLocked) {
      // Idle callbacks can be delayed by a busy tab. Never approach a zone without its colliders.
      const playerT = nearestPath(physics.position.x, physics.position.z).t;
      for (const zone of ZONES) if (Math.abs(zone.t - playerT) * pathLength() <= 60) zoneScenes!.ensure(zone.id);
      const plan = limitSteps(accumulator, last ? (now - last) / 1000 : 0);
      accumulator = plan.remainder;
      for (let i = 0; i < plan.steps; i++) {
        composed.update(physics.position, FIXED_DT);
        if (vehicle.mode === "ride") driveVehicle(FIXED_DT);
        else state = locomotion.step(state, keys, yaw, FIXED_DT);
        if (!composed.contains(physics.position)) returnToPath();
      }
    }
    // The chooser's overlay pause must not stall travel. Blur/hidden/error still suspend it.
    if (!cinematicLocked() && state.appMode === "world" && !state.pauseReasons.has("windowBlur") && !state.pauseReasons.has("error")) updateTeleport(dt);
    last = now;
    lastPlayer.copy(player.position);
    player.position.copy(physics.position);
    const moved = Math.hypot(player.position.x - lastPlayer.x, player.position.z - lastPlayer.z);
    // Teleports and intro hand-offs jump the controller: never read them as running.
    // A paused world is frozen (§6.1): no idle breathing either (e2e compares paused frames pixel for pixel).
    const animDt = canSimulate(state) ? dt : 0;
    animator.update(animDt, vehicle.mode === "ride" || animDt === 0 ? 0 : moved < 2 ? moved / animDt : 0, (physics as { grounded?: boolean }).grounded ?? true);
    publishVehicle(animDt);
    let introFrame: IntroFrame | undefined;
    if (intro?.inputLocked) {
      introFrame = intro.tick(canSimulate(state) && wasPlaying ? dt : 0);
    } else if (ending?.inputLocked) {
      if (canSimulate(state)) applyEnding(ending.tick(dt));
    } else updateCamera(animDt);
    interaction.update();
    composed.update(physics.position, 0);
    // Compose grades fog/mist every frame, including pauses; the intro owns the final camera air.
    if (introFrame) {
      // Finish the existing backdrop before the first flight render; skipped intros keep deferred dressing.
      if (intro?.state === "playing" && !reducedMotion && farLandscape && !farLandscape.mesh.visible) {
        while (!farLandscape.build.next().done) { /* No extra draw calls. */ }
      }
      applyIntro(introFrame);
    }
    updateMascot(canSimulate(state) ? dt : 0);
    updateMascotHint(canSimulate(state) ? dt : 0);
    for (const zone of zones) zone.update?.(animDt, reducedMotion);
    dressing?.update(animDt, reducedMotion);
    updateFoliageWind(composed.foliageMeshes, animDt, reducedMotion);
    for (const zoneId of trackZoneEntry(physics.position, canSimulate(state) && !cinematicLocked() && !teleport.inputLocked)) {
      container.dispatchEvent(new CustomEvent("tqa:zone-enter", { bubbles: false, detail: { zoneId } }));
    }
    publishAmbience(now);
    updateEndingGrade();
    if (canSimulate(state) && !reducedMotion) chimeTime += dt;
    chimes.rotation.z = reducedMotion ? 0 : Math.sin(chimeTime * 1.4) * 0.045;
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
  const trackZoneEntry = createZoneEntryTracker(id => zones.some(zone => zone.zoneId === id));
  const introOptions = {
    gameplayPose: { position: camera.position, target: physics.position, fov: camera.fov },
    reducedMotion,
  };
  let intro = createIntroController(introOptions);
  syncMotion = () => {
    animator.setReducedMotion(reducedMotion);
    const nextIntro = createIntroController({ ...introOptions, reducedMotion });
    if (intro.state === "done") nextIntro.skip();
    else if (intro.state === "playing") {
      nextIntro.start();
      const frame = nextIntro.tick(intro.elapsed / intro.duration * nextIntro.duration);
      intro = nextIntro;
      applyIntro(frame);
    }
    intro = nextIntro;
    if (ending && endingOptions) {
      const nextEnding = createEndingController({ ...endingOptions, reducedMotion });
      if (ending.state === "done") nextEnding.skip();
      else if (ending.state === "playing") {
        nextEnding.start();
        const frame = nextEnding.tick(ending.elapsed / ending.duration * nextEnding.duration);
        ending = nextEnding;
        applyEnding(frame);
      }
      ending = nextEnding;
    }
    if (teleportFrom && teleport.inputLocked) {
      const next = createTeleport({ reducedMotion });
      next.startChoosing(teleportFrom);
      if (destination) {
        next.choose(destination);
        const progress = teleport.state === "fadingIn" ? 2 - teleport.opacity : teleport.opacity;
        next.tick(progress * (reducedMotion ? REDUCED_MOTION_SECONDS : MIST_SECONDS));
      }
      teleport = next;
      if (teleportCover) teleportCover.dataset.worldTeleportCover = teleport.effect;
    }
    updateMascot(0, true);
  };
  if (window.__tqaSkipIntro === true) {
    intro.skip();
    publishIntro("done");
    updateMascot(0, true);
  }
  container.addEventListener("tqa:return-to-path", returnToPath);
  container.addEventListener("tqa:pause", externalPause);
  container.addEventListener("tqa:set-quality", setQuality);
  container.addEventListener("tqa:set-locale", setLocale);
  container.addEventListener("tqa:set-mascot", setMascot);
  container.addEventListener("tqa:set-motion", setMotion);
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
  dressing.defer(composed.buildGround);
  dressing.defer((function* () {
    const warmed = new Set<string>();
    while (!disposed) {
      let changed = false;
      scene.traverse(object => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (!warmed.has(material.uuid)) { warmed.add(material.uuid); changed = true; }
        }
      });
      // Includes off-camera meshes; never await compilation in the frame loop.
      if (changed && typeof renderer.compileAsync === "function") void renderer.compileAsync(scene, camera).catch(() => {
        // Context recovery is handled by the existing renderer lifecycle.
      });
      if (composed.groundReady && zones.length === ZONES.length) return;
      yield;
    }
  })());
  zoneScenes.startDeferred(() => container.dataset.worldIntro === "done" && !document.hidden && !contextLost);
  if (!document.hidden) frame = requestAnimationFrame(tick);
  return () => {
    if (disposed) return;
    disposed = true;
    if (journey && journeyContainer.__tqaJourney === journey) delete journeyContainer.__tqaJourney;
    removeCinematicUI();
    clearTimeout(feedbackTimer);
    feedback.remove();
    translate.removeEventListener("click", togglePoem);
    translate.removeEventListener("pointerenter", holdPoem);
    translate.removeEventListener("focus", holdPoem);
    translate.remove();
    clearMascotHint();
    mascotHint.remove();
    mascot.dispose();
    delete container.dataset.worldMascot;
    delete container.dataset.worldEnding;
    delete container.dataset.worldIntro;
    delete container.dataset.worldBuild;
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
    container.removeEventListener("tqa:set-mascot", setMascot);
    container.removeEventListener("tqa:set-motion", setMotion);
    delete container.dataset.worldMotion;
    delete container.dataset.worldLocale;
    gpu.domElement.removeEventListener("click", click);
    interaction.dispose();
    bike.dispose();
    delete container.dataset.worldVehicle;
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
    dressing?.dispose();
    composed.dispose();
    zoneScenes?.dispose();
    removeDressingTrimeshes?.();
    forestSun?.dispose();
    farLandscape?.dispose();
    physics.dispose();
    character.dispose();
    for (const { root } of secretTargets) {
      disposeLandmark(root);
      root.removeFromParent();
    }
    for (const { mesh } of props) {
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
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
