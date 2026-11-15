import { Group, Mesh, SkinnedMesh, Vector3, type Object3D, type BufferGeometry, type Camera, type Material, type MeshPhysicalMaterial, type Texture, type WebGLRenderer } from "three";
import { disposeBakedAppearance } from "../character/baked-appearance";

type Target = "chassis" | "steering" | "front_wheel" | "rear_wheel";
export interface HrVehiclePart { target: Target; mesh: Object3D }
export interface HrVehicleAsset { lods: HrVehiclePart[][]; dispose(): void }
export type HrVehicleLoader = (renderer: WebGLRenderer) => Promise<HrVehicleAsset>;

/** Hysteresis keeps the loaded silhouette stable around the distance boundary. */
export function hrVehicleLod(distance: number, previous = 0): number {
  return distance > (previous === 0 ? 18 : 15) ? 1 : 0;
}

export async function loadHrVehicle(renderer: WebGLRenderer): Promise<HrVehicleAsset> {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
  ]);
  const ktx = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
  let release: (() => void) | undefined;
  try {
    const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx)
      .loadAsync("/world/vehicle/vehicle-gd110.glb");
    const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
    scene.traverse(node => {
      if (!(node instanceof Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
        }
      }
    });
    materials.forEach(material => weatherVehicleMaterial(material));
    let disposed = false;
    release = () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    };
    const lods = [0, 1].map(level => {
      const root = scene.children.find(node => node.userData.lod === level);
      if (!root) throw new Error(`Missing GD110 LOD${level}`);
      const parts: HrVehiclePart[] = [];
      root.traverse(node => {
        const target: unknown = node.userData.runtimeTarget;
        if (target === undefined) return;
        if (!["chassis", "steering", "front_wheel", "rear_wheel"].includes(String(target))) throw new Error("Invalid GD110 pivot");
        node.traverse(child => { if (child instanceof Mesh) child.castShadow = child.receiveShadow = true; });
        parts.push({ target: target as Target, mesh: node });
      });
      if (parts.length !== 4 || new Set(parts.map(p => p.target)).size !== 4) throw new Error("Incomplete GD110 LOD");
      return parts;
    });
    return { lods, dispose: release };
  } catch (error) { release?.(); throw error; }
  finally { ktx.dispose(); }
}

/** HR-FIX-SETPIECE A24. The world's image-based light is deliberately dim (0.3), which left the
 * mirror glass and chrome as black discs: metals now receive the full reflection, so the glass
 * mirrors sky and trees. Enamel keeps its clearcoat under a thin film of road dust that settles
 * on upward faces and low on the machine. Shader-only: no extra draw, texture or uniform.
 */
export function weatherVehicleMaterial(material: Material) {
  const paint = material as MeshPhysicalMaterial;
  if (!paint.isMeshStandardMaterial || paint.userData.hrWeathered) return;
  paint.userData.hrWeathered = true;
  const enamel = paint.isMeshPhysicalMaterial === true && paint.clearcoat > 0;
  if (enamel) { paint.clearcoat = 1; paint.clearcoatRoughness = 0.07; }
  const compile = paint.onBeforeCompile, key = paint.customProgramCacheKey.bind(paint);
  paint.onBeforeCompile = (shader, renderer) => {
    compile.call(paint, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec4 vHrDust;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHrDust = vec4(position, normal.y);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec4 vHrDust;
float hrDustHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hrDustNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hrDustHash(i), hrDustHash(i + vec3(1, 0, 0)), f.x), mix(hrDustHash(i + vec3(0, 1, 0)), hrDustHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hrDustHash(i + vec3(0, 0, 1)), hrDustHash(i + vec3(1, 0, 1)), f.x), mix(hrDustHash(i + vec3(0, 1, 1)), hrDustHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float hrDust = 0.0;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
hrDust = hrDustNoise(vHrDust.xyz * 23.0) * 0.6 + hrDustNoise(vHrDust.xyz * 71.0) * 0.4;
hrDust = smoothstep(0.34, 0.86, hrDust) * (0.16 + 0.34 * max(vHrDust.w, 0.0) + 0.3 * (1.0 - smoothstep(0.2, 0.7, vHrDust.y)));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.31, 0.24), hrDust * 0.5);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, hrDust * 0.75);")
      .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - hrDust * 0.85;
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.6, hrDust);
#endif`)
      .replace("#include <aomap_fragment>", "reflectedLight.indirectSpecular *= 1.0 + 3.2 * metalnessFactor * (1.0 - hrDust);\n#include <aomap_fragment>");
  };
  paint.customProgramCacheKey = () => key() + "|hr-vehicle-weathered-v1";
  paint.needsUpdate = true;
}

/** Installs on the view, never on the Low factory. Existing bones, rider frame,
 * lean and simulation/collider ownership remain unchanged. The first rendered
 * playable frame schedules decoding; no renderer/loader work during module load.
 */
export function installHrVehicle(bike: Group, transitioning: () => boolean, load: HrVehicleLoader = loadHrVehicle) {
  const fallback = bike.getObjectByName("chassis") as SkinnedMesh;
  disposeBakedAppearance(fallback);
  const originalAfter = fallback.onAfterRender;
  const hosts = { chassis: bike, steering: bike.getObjectByName("steering")!,
    front_wheel: bike.getObjectByName("front_wheel")!, rear_wheel: bike.getObjectByName("rear_wheel")! };
  let renderer: WebGLRenderer | undefined, camera: Camera | undefined;
  let software: boolean | undefined, disposed = false, pending = false, failed = false;
  let asset: HrVehicleAsset | undefined, attached = false, lod = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let explicitQuality: "low" | "balanced" | "high" | undefined;
  const origin = new Vector3(), view = new Vector3();
  const status = { state: "fallback", lod: -1 };
  bike.userData.hrVehicle = status;

  function cancelScheduled() {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; pending = false; }
  }
  function refresh() {
    if (disposed || !renderer || !camera) return;
    if (software === undefined) {
      const gl = renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)));
    }
    const container = renderer.domElement?.closest?.("[data-world-quality]");
    const quality = explicitQuality ?? container?.getAttribute("data-world-quality") ?? "low";
    const allowed = !software && quality !== "low" && (renderer.capabilities?.maxTextureSize ?? 0) >= 4096;
    const playable = container?.getAttribute("data-world-build") !== "pending"
      && (!container?.hasAttribute("data-world-intro") || container.getAttribute("data-world-intro") === "done");
    if (!allowed || !playable) cancelScheduled();
    if (allowed && playable && !transitioning()) {
      bike.getWorldPosition(origin); camera.getWorldPosition(view);
      lod = hrVehicleLod(origin.distanceTo(view), lod);
      if (asset && !attached) {
        for (const [level, parts] of asset.lods.entries()) for (const { mesh, target } of parts) {
          // Geometry is authored relative to the same axle/stem, at scale .81.
          // Move only the mesh; the existing Bone hierarchy owns all animation.
          hosts[target].add(mesh);
          mesh.name = `hr_lod${level}_${target}`;
          mesh.traverse(child => { if (child instanceof Mesh) child.onAfterRender = afterRender; });
        }
        attached = true;
      }
      if (!asset && !pending && !failed) {
        pending = true;
        timer = setTimeout(() => {
          timer = undefined;
          const current = renderer?.domElement?.closest?.("[data-world-quality]");
          if (disposed || transitioning() || (explicitQuality ?? current?.getAttribute("data-world-quality") ?? "low") === "low"
            || current?.getAttribute("data-world-build") === "pending"
            || (current?.hasAttribute("data-world-intro") && current.getAttribute("data-world-intro") !== "done")) {
            pending = false; return;
          }
          void load(renderer!).then(result => {
            pending = false;
            if (disposed) { result.dispose(); return; }
            asset = result;
          }).catch(() => { pending = false; failed = true; });
        }, 0);
      }
    } else if (transitioning() && !attached) cancelScheduled();
    // A transition may keep an already displayed model, but cannot introduce
    // a first upload/swap. Low always restores the cheap original immediately.
    const useHr = allowed && playable && attached;
    fallback.visible = !useHr;
    if (asset && attached) for (const [level, parts] of asset.lods.entries()) {
      for (const { mesh } of parts) mesh.visible = useHr && level === lod;
    }
    status.state = useHr ? "ready" : failed ? "failed" : pending ? "loading" : "fallback";
    status.lod = useHr ? lod : -1;
  }
  const afterRender: Mesh["onAfterRender"] = function (this: Mesh, nextRenderer, scene, nextCamera, geometry, material, group) {
    if (this === fallback) originalAfter.call(this, nextRenderer, scene, nextCamera, geometry, material, group);
    renderer = nextRenderer; camera = nextCamera;
    refresh();
  };
  fallback.onAfterRender = afterRender;
  return {
    update: refresh,
    setQuality(quality: "low" | "balanced" | "high") { explicitQuality = quality; refresh(); },
    dispose() {
      if (disposed) return;
      disposed = true; cancelScheduled();
      fallback.visible = true; fallback.onAfterRender = originalAfter;
      if (asset) for (const parts of asset.lods) for (const { mesh } of parts) mesh.removeFromParent();
      asset?.dispose(); asset = undefined;
      delete bike.userData.hrVehicle;
    },
  };
}
