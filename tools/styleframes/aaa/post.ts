import { Vector2, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { mix, type Selection } from './settings';

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, selection: Selection, focus: number) {
  const composer = new EffectComposer(renderer);
  // Override depth/normal materials turn mist and alpha cards into solid rectangles.
  // Use the opaque R1 crowns for their depth; leaf detail remains in the color pass.
  function opaqueDepth<T extends Pass>(pass: T): T {
    const render = pass.render.bind(pass);
    pass.render = (...args) => {
      const mask = camera.layers.mask, shadows = renderer.shadowMap.autoUpdate;
      camera.layers.disable(1); renderer.shadowMap.autoUpdate = false;
      try { render(...args); }
      finally { camera.layers.mask = mask; renderer.shadowMap.autoUpdate = shadows; }
    };
    return pass;
  }
  composer.addPass(new RenderPass(scene, camera));
  let ao: GTAOPass | undefined;
  if (selection.quality === 'High') {
    ao = new GTAOPass(scene, camera, 800, 450);
    ao.blendIntensity = 0.42;
    ao.updateGtaoMaterial({ radius: 1.2, thickness: 1, distanceFallOff: 0.8, samples: 8 });
    ao.updatePdMaterial({ radius: 5, samples: 8 });
    composer.addPass(opaqueDepth(ao));
    composer.addPass(new UnrealBloomPass(new Vector2(800, 450), 0.13, 0.5, 1.25));
    if (selection.variant === 'C') composer.addPass(opaqueDepth(new BokehPass(scene, camera, { focus, aperture: 0.000025, maxblur: 0.003 })));
  }
  // Very small cool shadow / warm highlight split in linear light; no paper or loud vignette.
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, shadowTint: { value: mix('indigo', 'skyLow', 0.6) }, highlightTint: { value: mix('cloud', 'sunGold', 0.13) } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec3 shadowTint,highlightTint;
      void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(l),c,.94); c=mix(c,c*shadowTint*1.5,.055*(1.0-smoothstep(.02,.45,l)));
      c=mix(c,c*highlightTint*1.05,.06*smoothstep(.4,1.3,l));gl_FragColor=vec4(max(c,vec3(0.0)),1.0);}`,
  });
  composer.addPass(grade); composer.addPass(new OutputPass());
  return {
    render: () => composer.render(0),
    resize(width: number, height: number) {
      composer.setPixelRatio(1); composer.setSize(width, height);
      // GTAO's geometry buffer + filtering at half res, rather than silently full res.
      ao?.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
    },
    dispose() { for (const pass of composer.passes) pass.dispose(); composer.dispose(); },
  };
}
