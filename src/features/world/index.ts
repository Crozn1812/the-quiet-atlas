import { inputReducer, isInputTarget, type InputAction } from "../interaction/input";
import { CapsuleGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { canSimulate, initialSession, sessionReducer } from "../../state/session";
import { createObstacles, HALF_HEIGHT, RADIUS } from "./scene";
import { FIXED_DT, limitSteps } from "./timestep";
export const WORLD_CHUNK_MARKER = "__TQA_WORLD_CHUNK__";
export interface WorldOptions { collision?: "rapier" | "raycast" }
export async function mountWorld(container: HTMLElement, opts: WorldOptions = {}): Promise<() => void> {
  const obstacles = createObstacles();
  let controller;
  let renderer: WebGLRenderer | undefined;
  try {
    controller = opts.collision === "raycast"
      ? await (await import("./raycast")).createController(obstacles)
      : await (await import("./rapier")).createController();
    renderer = new WebGLRenderer({ antialias: true });
  } catch (error) {
    controller?.dispose();
    for (const mesh of obstacles) { mesh.geometry.dispose(); mesh.material.dispose(); }
    throw error;
  }
  const gpu = renderer;
  const physics = controller;
  const scene = new Scene();
  scene.background = new Color(0xc9dad8);
  scene.add(...obstacles);
  const player = new Mesh(new CapsuleGeometry(RADIUS, HALF_HEIGHT * 2), new MeshBasicMaterial({ color: 0xcc754e }));
  scene.add(player);
  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  gpu.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  gpu.domElement.setAttribute("aria-label", "Physics spike: capsule, ramp and obstacles. WASD to move.");
  container.appendChild(gpu.domElement);
  const previousMarker = container.dataset.worldChunk;
  container.dataset.worldChunk = WORLD_CHUNK_MARKER;
  let state = sessionReducer(initialSession(), { type: "mode", mode: "world" });
  let keys: ReadonlySet<string> = new Set();
  let accumulator = 0;
  let last = 0;
  let frame = 0;
  let disposed = false;
  function clear(action: InputAction = { type: "clear" }) { keys = inputReducer(keys, action); physics.resetVelocity(); accumulator = 0; last = 0; }
  function pause(reason: "hiddenTab" | "windowBlur", paused: boolean) {
    state = sessionReducer(state, { type: "pause", reason, paused });
    clear({ type: reason === "windowBlur" ? "blur" : "hidden" });
  }
  function keydown(event: KeyboardEvent) {
    keys = inputReducer(keys, { type: "keydown", event, enabled: canSimulate(state) });
  }
  function keyup(event: KeyboardEvent) { keys = inputReducer(keys, { type: "keyup", event }); }
  function focusin(event: FocusEvent) { if (isInputTarget(event.target)) clear({ type: "focusin", event }); }
  function blur() { pause("windowBlur", true); }
  function focus() { pause("windowBlur", false); }
  function visibility() {
    pause("hiddenTab", document.hidden);
    if (document.hidden) cancelAnimationFrame(frame);
    else if (!disposed) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    gpu.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function tick(now: number) {
    if (disposed || document.hidden) return;
    if (canSimulate(state)) {
      const plan = limitSteps(accumulator, last ? (now - last) / 1000 : 0);
      accumulator = plan.remainder;
      const direction = new Vector3(Number(keys.has("KeyD")) - Number(keys.has("KeyA")), 0, Number(keys.has("KeyS")) - Number(keys.has("KeyW")));
      if (direction.lengthSq()) direction.normalize().multiplyScalar(3);
      for (let i = 0; i < plan.steps; i++) physics.step(direction.x, direction.z, FIXED_DT);
    }
    last = now;
    player.position.copy(physics.position);
    camera.position.copy(physics.position).add(new Vector3(7, 6, 9));
    camera.lookAt(physics.position);
    gpu.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
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
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", focus);
    document.removeEventListener("visibilitychange", visibility);
    document.removeEventListener("focusin", focusin);
    clear();
    physics.dispose();
    for (const mesh of [...obstacles, player]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    gpu.dispose();
    gpu.forceContextLoss();
    gpu.domElement.remove();
    if (previousMarker === undefined) delete container.dataset.worldChunk;
    else container.dataset.worldChunk = previousMarker;
  };
}
