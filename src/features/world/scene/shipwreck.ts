import { Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3, type Material, type Texture, type WebGLRenderer } from "three";
import type { Quality } from "../terrain";
import { createShipwreckSmoke, SHIPWRECK_CLIP } from "./shipwreck-smoke";

export const SHIPWRECK = Object.freeze({ position: [0, -1.5, -970] as const, length: 72, pitch: Math.PI / 9, yaw: -.25,
  asset: "/world/props/prop-shipwreck.glb" });

/** Visual-only landmark: no collider, interaction target or persistent state. */
export function createShipwreck(renderer: WebGLRenderer) {
  const group = new Group(); group.name = "offshore-shipwreck"; group.visible = false;
  const boat = new Group(); boat.position.fromArray(SHIPWRECK.position); boat.rotation.set(0, SHIPWRECK.yaw, SHIPWRECK.pitch, "YXZ");
  group.add(boat);
  const smoke = createShipwreckSmoke(new Vector3(-8, 15.4, 0).applyEuler(boat.rotation).add(boat.position));
  const foamGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const foamMaterial = new MeshBasicMaterial({ color: "#dedbc5", transparent: true, opacity: .32, depthWrite: false });
  foamMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>\n${SHIPWRECK_CLIP}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 foamUv;")
      .replace("#include <opaque_fragment>", "diffuseColor.a *= (1.0 - smoothstep(.12, .5, abs(foamUv.y - .5))) * (0.5 + 0.5 * sin(foamUv.x * 25.0));\n#include <opaque_fragment>");
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 foamUv;").replace("#include <uv_vertex>", "#include <uv_vertex>\nfoamUv = uv;");
  };
  const foam = new InstancedMesh(foamGeometry, foamMaterial, 12), pose = new Object3D();
  foam.name = "shipwreck-waterline-foam"; foam.frustumCulled = false;
  for (let i = 0; i < 12; i++) {
    // Only the bow half intersects the sea; the stern is fully submerged.
    const x = -4 + (i % 6) * 6, z = (i < 6 ? -1 : 1) * (6.5 - Math.max(0, x - 18) * .15);
    pose.position.set(x, .16, z).applyAxisAngle(new Vector3(0, 1, 0), SHIPWRECK.yaw);
    pose.position.x += boat.position.x; pose.position.z += boat.position.z;
    pose.rotation.y = SHIPWRECK.yaw; pose.scale.set(6.5, 1, 1.4); pose.updateMatrix(); foam.setMatrixAt(i, pose.matrix);
  }
  group.add(foam, smoke.mesh);
  let disposed = false, started = false, ready = false;
  let decoder: import("three/addons/loaders/KTX2Loader.js").KTX2Loader | undefined;
  const geometries = new Set<import("three").BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  function release() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); geometries.clear(); materials.clear(); textures.clear(); }
  async function load() {
    const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/KTX2Loader.js"), import("three/addons/libs/meshopt_decoder.module.js"),
    ]);
    if (disposed) return;
    decoder = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
    try {
      const asset = await new GLTFLoader().setKTX2Loader(decoder).setMeshoptDecoder(MeshoptDecoder).loadAsync(SHIPWRECK.asset);
      asset.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.frustumCulled = false; geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value && typeof value === "object" && "isTexture" in value) textures.add(value as Texture);
          material.onBeforeCompile = (shader: Parameters<Material["onBeforeCompile"]>[0]) => {
            shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float wreckHeight;")
              .replace("#include <project_vertex>", `#include <project_vertex>\n${SHIPWRECK_CLIP}\nwreckHeight = (modelMatrix * vec4(transformed, 1.0)).y;`);
            shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float wreckHeight;")
              .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (wreckHeight < 0.05) discard;");
          };
        }
      });
      if (disposed) release(); else { boat.add(asset.scene); ready = true; }
    } finally { decoder?.dispose(); decoder = undefined; }
  }
  return { group, *build() {
    if (!started && !disposed) { started = true; void load().catch(error => { release(); group.visible = false; if (!disposed) console.warn("Shipwreck unavailable", error); }); }
    yield;
  }, update(dt: number, reducedMotion: boolean, player: { z: number }, quality: Quality) {
    group.visible = ready && player.z < -440;
    // High's paper pass supplies scenic fog already; avoid applying it twice to steel.
    for (const material of materials) {
      const steel = material as import("three").MeshStandardMaterial;
      if (steel.fog !== (quality === "Low")) { steel.fog = quality === "Low"; steel.needsUpdate = true; }
    }
    smoke.update(dt, reducedMotion, quality);
  }, dispose() { disposed = true; group.removeFromParent(); smoke.dispose(); foamGeometry.dispose(); foamMaterial.dispose(); release(); } };
}
