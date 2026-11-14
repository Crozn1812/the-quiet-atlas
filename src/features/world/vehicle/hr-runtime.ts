import { Group, Mesh, SkinnedMesh, Vector3, type Object3D, type BufferGeometry, type Camera, type Material, type Texture, type WebGLRenderer } from "three";
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
