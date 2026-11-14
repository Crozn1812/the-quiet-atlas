import { Color, DepthTexture, HalfFloatType, Vector2, WebGLRenderTarget, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BokehShader } from "three/examples/jsm/shaders/BokehShader.js";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { PALETTE } from "../art/palette";
import type { Quality } from "../terrain";
import { cinematicLook, type CinematicPresentation } from "../cinematic/presentation";
import { AERIAL_FRAGMENT, createAerialPass } from "./aerial";
import { lightingAt, type LightingGrade } from "../sky/grade";

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: Exclude<Quality, "Low">) {
  const composer = new EffectComposer(renderer);
  const source = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  source.depthTexture = new DepthTexture(1, 1);
  // Keep the real scene depth separate from the ping-pong post buffers. Alpha test,
  // mist and foliage shader discard are preserved, without normal/depth override draws.
  const copy = new ShaderPass(CopyShader);
  const color = new RenderPass(scene, camera);
  const renderColor = color.render.bind(color);
  color.render = (gpu, write, read, delta, mask) => {
    renderColor(gpu, write, source, delta, mask);
    copy.render(gpu, read, source, delta, mask);
  };
  composer.addPass(color);
  const ao = new GTAOPass(scene, camera, 1, 1, { depthTexture: source.depthTexture });
  ao.blendIntensity = quality === "High" ? 0.5 : 0.34;
  ao.updateGtaoMaterial({ radius: 1.2, thickness: 1, distanceFallOff: 0.8, samples: quality === "High" ? 8 : 4 });
  ao.updatePdMaterial({ radius: 5, samples: quality === "High" ? 8 : 4 });
  composer.addPass(ao);
  const aerial = createAerialPass(source.depthTexture, camera, quality === "High");
  let atmosphereGrade = lightingAt(0);
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), quality === "High" ? 0.13 : 0.08, 0.5, 1.25));
  // Balanced allocates this pass too, but only cinematic playback may enable it.
  const dof = new ShaderPass({ ...BokehShader, defines: { ...BokehShader.defines, DEPTH_PACKING: 0 } }, "tColor");
  if (dof) {
    dof.enabled = false;
    dof.uniforms.tDepth!.value = source.depthTexture;
    dof.uniforms.aperture!.value = 0.000025; dof.uniforms.maxblur!.value = 0.003;
    composer.addPass(dof);
  }
  const grade = new ShaderPass({
    defines: aerial.pass.material.defines,
    uniforms: {
      ...aerial.pass.uniforms,
      tDiffuse: { value: null },
      shadowTint: { value: new Color(PALETTE.indigo).lerp(new Color(PALETTE.skyLow), 0.6) },
      highlightTint: { value: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.13) },
      saturation: { value: 0.94 },
    },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `varying vec2 vUv; ${AERIAL_FRAGMENT} uniform vec3 shadowTint,highlightTint; uniform float saturation;
      void main(){vec3 c=applyAerial(texture2D(tDiffuse,vUv).rgb,vUv);float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(l),c,saturation);c=mix(c,c*shadowTint*1.5,.055*(1.0-smoothstep(.02,.45,l)));
      c=mix(c,c*highlightTint*1.05,.06*smoothstep(.4,1.3,l));gl_FragColor=vec4(max(c,vec3(0.0)),1.0);}`,
  });
  composer.addPass(grade);
  // RenderPass writes linear HDR into half-float buffers; only OutputPass tone maps/transfers to sRGB.
  composer.addPass(new OutputPass());
  // ShaderPass clones uniforms: both effects must share the live camera/depth uniforms.
  Object.assign(grade.uniforms, aerial.pass.uniforms);
  const baseShadow = grade.uniforms.shadowTint!.value.clone() as Color;
  const baseHighlight = grade.uniforms.highlightTint!.value.clone() as Color;
  const looks = { intro: cinematicLook("intro"), ending: cinematicLook("ending") };
  let cinematic: CinematicPresentation | null = null;
  return {
    render() {
      aerial.update(atmosphereGrade);
      if (dof) { dof.uniforms.nearClip!.value = camera.near; dof.uniforms.farClip!.value = camera.far; }
      const destination = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      try { composer.render(0); }
      finally { renderer.setRenderTarget(destination); renderer.autoClear = autoClear; }
    },
    setGrade(value: LightingGrade) { atmosphereGrade = value; },
    setAtmosphereEnabled(enabled: boolean) {
      aerial.pass.uniforms.airEnabled!.value = enabled ? 1 : 0;
      ao.blendIntensity = quality === "High" ? (enabled ? 0.5 : 0.42) : (enabled ? 0.34 : 0.28);
    },
    resize(width: number, height: number) {
      const dpr = renderer.getPixelRatio();
      composer.setPixelRatio(dpr); composer.setSize(width, height);
      source.setSize(Math.max(1, Math.floor(width * dpr)), Math.max(1, Math.floor(height * dpr)));
      if (dof) dof.uniforms.aspect!.value = width / Math.max(1, height);
      ao.setSize(Math.max(1, Math.ceil(width * dpr / 2)), Math.max(1, Math.ceil(height * dpr / 2)));
    },
    setFocus(enabled: boolean, focus: number) {
      dof.enabled = enabled && (quality === "High" || cinematic !== null);
      dof.uniforms.focus!.value = Math.max(camera.near, Math.min(camera.far, focus));
    },
    setCinematic(value: CinematicPresentation | null) {
      cinematic = value;
      const strength = value ? Math.max(0, Math.min(1, value.strength)) : 0;
      const look = looks[value?.kind ?? "intro"];
      grade.uniforms.shadowTint!.value.copy(baseShadow).lerp(look.shadowTint, strength);
      grade.uniforms.highlightTint!.value.copy(baseHighlight).lerp(look.highlightTint, strength);
      grade.uniforms.saturation!.value = 0.94 + (look.saturation - 0.94) * strength;
      dof.uniforms.aperture!.value = 0.000025 + (look.aperture - 0.000025) * strength;
      dof.uniforms.maxblur!.value = value ? look.maxblur * strength : 0.003;
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose();
      // GTAOPass r187 does not release these two owned materials in dispose().
      ao.gtaoMaterial.dispose(); ao.blendMaterial.dispose();
      aerial.pass.dispose(); copy.dispose(); source.depthTexture?.dispose(); source.dispose(); composer.dispose();
    },
  };
}
