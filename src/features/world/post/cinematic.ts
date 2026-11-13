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
  ao.blendIntensity = quality === "High" ? 0.42 : 0.28;
  ao.updateGtaoMaterial({ radius: 1.2, thickness: 1, distanceFallOff: 0.8, samples: quality === "High" ? 8 : 4 });
  ao.updatePdMaterial({ radius: 5, samples: quality === "High" ? 8 : 4 });
  composer.addPass(ao);
  composer.addPass(new UnrealBloomPass(new Vector2(1, 1), quality === "High" ? 0.13 : 0.08, 0.5, 1.25));
  const dof = quality === "High" ? new ShaderPass({ ...BokehShader, defines: { ...BokehShader.defines, DEPTH_PACKING: 0 } }, "tColor") : undefined;
  if (dof) {
    dof.enabled = false;
    dof.uniforms.tDepth!.value = source.depthTexture;
    dof.uniforms.aperture!.value = 0.000025; dof.uniforms.maxblur!.value = 0.003;
    composer.addPass(dof);
  }
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      shadowTint: { value: new Color(PALETTE.indigo).lerp(new Color(PALETTE.skyLow), 0.6) },
      highlightTint: { value: new Color(PALETTE.cloud).lerp(new Color(PALETTE.sunGold), 0.13) },
    },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec3 shadowTint,highlightTint;
      void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(l),c,.94);c=mix(c,c*shadowTint*1.5,.055*(1.0-smoothstep(.02,.45,l)));
      c=mix(c,c*highlightTint*1.05,.06*smoothstep(.4,1.3,l));gl_FragColor=vec4(max(c,vec3(0.0)),1.0);}`,
  });
  composer.addPass(grade);
  // RenderPass writes linear HDR into half-float buffers; only OutputPass tone maps/transfers to sRGB.
  composer.addPass(new OutputPass());
  return {
    render() {
      if (dof) { dof.uniforms.nearClip!.value = camera.near; dof.uniforms.farClip!.value = camera.far; }
      const destination = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      try { composer.render(0); }
      finally { renderer.setRenderTarget(destination); renderer.autoClear = autoClear; }
    },
    resize(width: number, height: number) {
      const dpr = renderer.getPixelRatio();
      composer.setPixelRatio(dpr); composer.setSize(width, height);
      source.setSize(Math.max(1, Math.floor(width * dpr)), Math.max(1, Math.floor(height * dpr)));
      if (dof) dof.uniforms.aspect!.value = width / Math.max(1, height);
      ao.setSize(Math.max(1, Math.ceil(width * dpr / 2)), Math.max(1, Math.ceil(height * dpr / 2)));
    },
    setFocus(enabled: boolean, focus: number) {
      if (!dof) return;
      dof.enabled = enabled;
      dof.uniforms.focus!.value = Math.max(camera.near, focus);
    },
    dispose() {
      for (const pass of composer.passes) pass.dispose();
      // GTAOPass r187 does not release these two owned materials in dispose().
      ao.gtaoMaterial.dispose(); ao.blendMaterial.dispose();
      copy.dispose(); source.depthTexture?.dispose(); source.dispose(); composer.dispose();
    },
  };
}
