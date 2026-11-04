import { Color, OrthographicCamera, ShaderMaterial, type WebGLRenderer } from "three";
import { PALETTE } from "../art/palette";
import { createPaperPass } from "../post/paper";
import type { Quality } from "../terrain";
import type { LightingGrade } from "../sky/grade";

/** Adapt the existing paper pass at its screen draw, keeping paperColor immutable.
 * All renderer calls retain the real receiver; no second post pass or render target. */
export function createGradedPaperPass(renderer: WebGLRenderer, quality: Quality) {
  const fogColor = new Color(PALETTE.paper);
  const proxy = new Proxy(renderer, {
    get(target, key) {
      if (key === "render") return ((scene, camera) => {
        if (camera instanceof OrthographicCamera) scene.traverse(object => {
          const material = (object as { material?: ShaderMaterial }).material;
          if (!(material instanceof ShaderMaterial) || !material.uniforms.paperColor) return;
          if (!material.uniforms.gradeFogColor) {
            material.uniforms.gradeFogColor = { value: fogColor };
            material.fragmentShader = "uniform vec3 gradeFogColor;\n" + material.fragmentShader;
            material.fragmentShader = material.fragmentShader
              .replace("mix(mistColor, paperColor, bands.z * 0.75)", "mix(mistColor, gradeFogColor, bands.z * 0.75)")
              .replace("mix(color.rgb, paperColor, smoothstep(fogNear, fogFar, viewDepth)", "mix(color.rgb, gradeFogColor, smoothstep(fogNear, fogFar, viewDepth)")
              // Sky writes no depth. Keep its gradient instead of fogging the whole dome away.
              .replace("layeredMist * mistStrength * nearVisibility", "layeredMist * mistStrength * nearVisibility * step(depth, 0.999999)")
              .replace("smoothstep(fogNear, fogFar, viewDepth) * nearVisibility", "smoothstep(fogNear, fogFar, viewDepth) * nearVisibility * step(depth, 0.999999)");
            material.needsUpdate = true;
          }
          material.uniforms.mistColor!.value.copy(fogColor);
        });
        target.render(scene, camera);
      }) satisfies WebGLRenderer["render"];
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const paper = createPaperPass(proxy, { quality });
  return { ...paper, setGrade(grade: LightingGrade) { fogColor.copy(grade.fogColor); } };
}
