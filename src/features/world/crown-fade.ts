import { InstancedBufferAttribute, type InstancedMesh, type Material } from "three";

export function createCrownFade(crowns: InstancedMesh, capacity: number) {
  const alpha = new InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
  crowns.geometry.setAttribute("crownAlpha", alpha);
  const material = crowns.material as Material;
  material.alphaHash = true;
  // Chain any existing hook (e.g. the painted toon ramp) and extend its program key,
  // so the crown variant never shares a cached program with unfaded materials.
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.vertexShader = "attribute float crownAlpha; varying float vCrownAlpha;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvCrownAlpha = crownAlpha;");
    shader.fragmentShader = "varying float vCrownAlpha;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphahash_fragment>", "diffuseColor.a *= vCrownAlpha;\n#include <alphahash_fragment>");
  };
  material.customProgramCacheKey = () => previousKey() + "|crown-fade-v1";
  return (blocked: ReadonlySet<number>, dt: number) => {
    for (let i = 0; i < crowns.count; i++) {
      const target = blocked.has(i) ? 0.12 : 1;
      alpha.setX(i, alpha.getX(i) + (target - alpha.getX(i)) * (1 - Math.exp(-10 * dt)));
    }
    alpha.needsUpdate = true;
  };
}
