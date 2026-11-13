import { Color, DirectionalLight, HemisphereLight, PCFShadowMap, Quaternion, Vector2, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import type { DirectedFog } from "../art/direction";
import type { LightingGrade } from "../sky/grade";
import { createEnvironment } from "../sky/environment";
import type { Quality } from "../terrain";
import { createPost } from "./cinematic";
import { cinematicLook, type CinematicPresentation } from "../cinematic/presentation";

/** Direction C runtime. Retains the cinematic/compose API while replacing paper with native fog and HDR post. */
export function createGradedPaperPass(renderer: WebGLRenderer, initialQuality: Quality) {
  let quality = initialQuality, disposed = false, timeOfDay = 0;
  let post: ReturnType<typeof createPost> | undefined;
  let boundScene: Scene | undefined, boundCamera: PerspectiveCamera | undefined;
  let environment: ReturnType<typeof createEnvironment> | undefined;
  let firstFrameDrawn = false;
  let deferredScene: Scene | undefined;
  let nextStartupDraw = 0;
  const size = renderer.getSize(new Vector2());
  const fogColor = new Color();
  let hasGrade = false, override: Color | null = null;
  let fog: DirectedFog | undefined;
  let moving = true, idle = 0, dt = 0, focus = 12;
  let cinematic: CinematicPresentation | null = null;
  const looks = { intro: cinematicLook("intro"), ending: cinematicLook("ending") };
  const cameraPosition = new Vector3(Infinity, Infinity, Infinity), cameraRotation = new Quaternion();
  renderer.shadowMap.type = PCFShadowMap;
  const visibility = () => { environment?.setActive(!document.hidden); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibility);
  return {
    render(scene: Scene, camera: PerspectiveCamera) {
      if (disposed) return;
      if (scene !== boundScene || camera !== boundCamera) {
        post?.dispose(); post = undefined;
        environment?.dispose(); environment = undefined;
        boundScene = scene; boundCamera = camera;
        firstFrameDrawn = false;
      }
      // Dressing must finish before any C shader, shadow or HDRI work competes
      // with the world's idle build queue. A second frame alone is not readiness.
      const active = firstFrameDrawn && deferredScene === scene && quality !== "Low"
        && (typeof document === "undefined" || !document.hidden);
      renderer.shadowMap.enabled = active;
      const building = deferredScene !== scene;
      const drawStart = building ? performance.now() : 0;
      // On an overloaded renderer, leave task time for the bounded construction
      // queue instead of spending every available turn submitting another draw.
      // Paused redraws and the first frame are immediate; completed worlds never wait.
      if (building && !cinematic && firstFrameDrawn && dt > 0 && drawStart < nextStartupDraw) return;
      // Intro can use post immediately after the first draw; HDRI and shadows still
      // require startDeferred. Neither the camera timeline nor worldBuild awaits C.
      const usePost = (active || (firstFrameDrawn && cinematic !== null)) && quality !== "Low";
      if (usePost && quality !== "Low" && !post) { post = createPost(renderer, scene, camera, quality); post.resize(size.x, size.y); }
      if (active && !environment) {
        environment = createEnvironment(renderer, scene);
        environment.setQuality(quality);
        environment.setTimeOfDay(timeOfDay);
      }
      const cameraMoving = camera.position.distanceToSquared(cameraPosition) > 0.000001
        || 1 - Math.abs(camera.quaternion.dot(cameraRotation)) > 0.000001;
      cameraPosition.copy(camera.position); cameraRotation.copy(camera.quaternion);
      idle = moving || cameraMoving ? 0 : idle + dt;
      post?.setCinematic(cinematic);
      post?.setFocus(cinematic !== null || (!moving && !cameraMoving && idle >= 0.3), cinematic?.focus ?? focus);
      if (active) {
        environment?.setTimeOfDay(cinematic ? (cinematic.kind === "intro" ? 0 : 1) : timeOfDay);
        environment?.setActive(true); environment?.update();
      }
      const restoredLights: (() => void)[] = [];
      const native = scene.fog;
      const previous = native?.color.clone();
      const distances = native && "near" in native ? [native.near, native.far] : undefined;
      try {
        if (cinematic) {
          const look = looks[cinematic.kind], strength = cinematic.strength;
          // Apply to existing lights for Low as well; restore even on a failed draw.
          for (const light of scene.children) {
            if (light instanceof DirectionalLight) {
              const color = light.color.clone(), intensity = light.intensity;
              restoredLights.push(() => { light.color.copy(color); light.intensity = intensity; });
              light.color.lerp(look.sunTint, 0.12 * strength);
              light.intensity *= 1 + (look.sunGain - 1) * strength;
            } else if (light instanceof HemisphereLight) {
              const intensity = light.intensity;
              restoredLights.push(() => { light.intensity = intensity; });
              light.intensity *= 1 + (look.fillGain - 1) * strength;
            }
          }
        }
        if (native && (override || hasGrade)) native.color.copy(override ?? fogColor);
        if (native && "near" in native && fog) { native.near = fog.near; native.far = fog.far; }
        if (!usePost || !post) {
          renderer.render(scene, camera);
          if (building) {
            const end = performance.now();
            nextStartupDraw = end + (Math.max(end - drawStart, dt * 1000) > 1000 / 30 ? 150 : 0);
          }
        }
        else post.render();
        firstFrameDrawn = true;
      } finally {
        for (const restore of restoredLights) restore();
        if (native && previous) native.color.copy(previous);
        if (native && "near" in native && distances) { native.near = distances[0]!; native.far = distances[1]!; }
      }
    },
    /** Called only after worldBuild=done, from the gameplay render branch. */
    startDeferred(scene: Scene) {
      if (!disposed) deferredScene = scene;
    },
    setMotion(isMoving: boolean, delta: number, focusDistance = 12) {
      moving = isMoving; dt = Math.max(0, Math.min(0.1, delta)); focus = focusDistance;
    },
    /** Call from applyCinematicPose; null on skip, completion and reduced motion. */
    setCinematic(value: CinematicPresentation | null) {
      cinematic = value ? { ...value, strength: Math.max(0, Math.min(1, value.strength)) } : null;
      idle = 0;
    },
    setSize(width: number, height: number) { size.set(width, height); post?.resize(width, height); },
    setQuality(next: Quality) {
      if (disposed || quality === next) return;
      quality = next; idle = 0;
      post?.dispose(); post = undefined;
      environment?.setQuality(next);
      if (next === "Low") renderer.shadowMap.enabled = false;
    },
    setGrade(grade: LightingGrade) { fogColor.copy(grade.fogColor); hasGrade = true; },
    setTimeOfDay(value: number) { timeOfDay = value; environment?.setTimeOfDay(value); },
    setFog(options: DirectedFog) { fog = { ...options }; },
    setFogColorOverride(color: Readonly<Color> | null) { override = color ? new Color().copy(color) : null; },
    // These legacy cinematic knobs have no paper/mist screen overlay in direction C.
    setMist(options: { height?: number; strength?: number; bands?: number[] }) { void options; },
    setCorridor(points: readonly { x: number; z: number }[] | null, radius?: number) { void points; void radius; },
    dispose() {
      if (disposed) return;
      disposed = true; post?.dispose(); environment?.dispose(); post = undefined;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility);
    },
  };
}
