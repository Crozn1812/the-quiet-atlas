import { Group, Mesh, MeshStandardMaterial, ShaderChunk, Texture, type Object3D, type WebGLRenderer } from "three";
import type { Quality } from "../terrain";
import { partitionCliffMesh } from "./first-light-cliff-cull";

export type CliffLoader = (quality: Exclude<Quality, "Low">) => Promise<Group>;

/** World projection avoids UV seams and blends photo scales across adjacent plates. */
export function prepareCliffMaterial(material: MeshStandardMaterial) {
  // Broad Low pigments are sampled too sparsely for a close PBR face. Evaluate
  // dampness and ledge moss per fragment instead, keeping transitions continuous.
  material.vertexColors = false;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying vec3 cliffP; varying vec3 cliffN;`)
      .replace("#include <project_vertex>", `#include <project_vertex>
        cliffP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        cliffN = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 cliffP; varying vec3 cliffN;
      vec3 cliffWeights() { vec3 w = pow(abs(cliffN), vec3(4.0)); return w / max(dot(w, vec3(1.0)), 0.0001); }
      // Keep a metre-based mineral grain instead of stretching a soft baked bed.
      vec3 cliffRead(sampler2D photo, vec3 p) {
        p *= 4.5;
        vec3 w = cliffWeights();
        return texture2D(photo, p.zy).rgb * w.x + texture2D(photo, p.xz).rgb * w.y + texture2D(photo, p.xy).rgb * w.z;
      }`)
      .replace("#include <map_fragment>", `
        vec3 cliffColor = mix(cliffRead(map, cliffP / 3.5), cliffRead(map, cliffP / 13.7 + vec3(0.37)), 0.27);
        float cliffRunoff = pow(max(0.0, sin(cliffP.x * 1.9 + cliffP.z * 0.83 + sin(cliffP.y * 0.23) * 0.17)), 16.0);
        float cliffBed = sin(cliffP.y * 3.7 + cliffP.x * 0.17 + sin(cliffP.z * 0.63) * 0.35);
        float cliffMoss = smoothstep(0.62, 0.95, cliffBed) * (0.3 + 0.7 * max(0.0, cliffN.y));
        cliffColor = mix(cliffColor, cliffColor * vec3(0.42, 0.62, 0.24), cliffMoss * 0.7);
        diffuseColor.rgb *= cliffColor * (1.0 - cliffRunoff * 0.46);`)
      .replace("#include <roughnessmap_fragment>", `
        vec3 cliffSurface = cliffRead(roughnessMap, cliffP / 3.5);
        float roughnessFactor = clamp(cliffSurface.g, 0.72, 1.0);`)
      .replace("#include <normal_fragment_maps>", `
        vec3 cliffW = cliffWeights();
        vec2 cliffNX = texture2D(normalMap, cliffP.zy / 0.78).rg * 2.0 - 1.0;
        vec2 cliffNY = texture2D(normalMap, cliffP.xz / 0.78).rg * 2.0 - 1.0;
        vec2 cliffNZ = texture2D(normalMap, cliffP.xy / 0.78).rg * 2.0 - 1.0;
        vec3 cliffBump = vec3(0.0, cliffNX.y, cliffNX.x) * cliffW.x
          + vec3(cliffNY.x, 0.0, cliffNY.y) * cliffW.y + vec3(cliffNZ.x, cliffNZ.y, 0.0) * cliffW.z;
        normal = normalize(normal + mat3(viewMatrix) * cliffBump * 0.35 * faceDirection);`)
      .replace("#include <aomap_fragment>", ShaderChunk.aomap_fragment
        .replace("texture2D( aoMap, vAoMapUv ).r", "cliffSurface.r"));
  };
  material.customProgramCacheKey = () => "first-light-cliff-mineral-v3";
  material.needsUpdate = true;
}

function release(root: Object3D) {
  const textures = new Set<Texture>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      material.dispose();
    }
  });
  textures.forEach(texture => texture.dispose());
  root.removeFromParent();
}

/** Called only by the existing terrain playable-frame gate. Low never imports a decoder. */
export function createFirstLightCliffDetail(root: Object3D, renderer: WebGLRenderer, loader?: CliffLoader) {
  const source = root.getObjectByName("spring-mossy-cliff");
  const resident = new Map<Quality, Group>();
  const pending = new Map<Quality, Promise<void>>();
  let quality: Quality = "Low", disposed = false;
  const load: CliffLoader = loader ?? (async next => {
    const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/loaders/KTX2Loader.js"),
      import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    ]);
    const ktx = new KTX2Loader().detectSupport(renderer);
    try {
      const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx)
        .loadAsync(`/world/cliff/cliff-${next.toLowerCase()}.glb`);
      scene.name = `first-light-cliff-${next.toLowerCase()}`;
      scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if (object.material instanceof MeshStandardMaterial && object.material.map) {
          for (const texture of [object.material.map, object.material.normalMap, object.material.roughnessMap]) {
            if (texture) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          }
          prepareCliffMaterial(object.material);
        }
        object.castShadow = object.receiveShadow = true;
        object.raycast = () => {}; // Camera and movement keep the inexpensive authored proxies.
      });
      const meshes: Mesh[] = [];
      scene.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
      meshes.forEach(partitionCliffMesh);
      return scene;
    } finally { ktx.dispose(); }
  });
  const refresh = () => {
    if (!source) return;
    const active = resident.get(quality);
    source.visible = !active;
    for (const [key, detail] of resident) detail.visible = key === quality;
  };
  return {
    async setQuality(next: Quality) {
      if (disposed || !source?.parent) return;
      quality = next; refresh();
      if (next === "Low" || resident.has(next)) return;
      if (pending.has(next)) return pending.get(next);
      const task = load(next).then(detail => {
        if (disposed || !source.parent) { release(detail); return; }
        resident.set(next, detail); source.parent.add(detail); refresh();
      }).catch(error => {
        // Optional visual detail: failed streaming leaves the sculpted fallback playable.
        source.userData.cliffDetailError = String(error);
      }).finally(() => pending.delete(next));
      pending.set(next, task);
      return task;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (source) source.visible = true;
      resident.forEach(release); resident.clear();
    },
  };
}
