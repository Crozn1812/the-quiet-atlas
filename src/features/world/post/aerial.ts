import { Color, Matrix4, Vector2, Vector3, type DepthTexture, type PerspectiveCamera } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { LightingGrade } from "../sky/grade";

/** Closed-form integral of exponential height density along a finite eye ray. */
export function heightOpticalDepth(distance: number, eyeY: number, endY: number, base = 5): number {
  const slope = (endY - eyeY) * 0.12;
  const density = Math.exp(Math.max(-8, Math.min(8, (base - eyeY) * 0.12)));
  return Math.max(0, distance) * density * (Math.abs(slope) < 0.001 ? 1 : -Math.expm1(-slope) / slope);
}

export const AERIAL_FRAGMENT = /* glsl */ `
      uniform sampler2D tDiffuse,tDepth;
      uniform mat4 inverseProjection,cameraWorld;
      uniform vec3 eye,airColor,sunColor;
      uniform vec2 sunUV;
      uniform float sunVisibility,humidity,airEnabled;
      vec3 applyAerial(vec3 color,vec2 vUv){
        if(airEnabled<0.5) return color;
        float depth=texture2D(tDepth,vUv).r;
        vec4 view=inverseProjection*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);
        vec3 world=(cameraWorld*vec4(view.xyz/view.w,1.0)).xyz;
        float distanceToEye=min(length(world-eye),400.0);
        float surface=1.0-step(0.99999,depth);
        float slope=clamp((world.y-eye.y)*0.12,-8.0,8.0);
        float integral=abs(slope)<0.001?1.0:(1.0-exp(-slope))/(abs(slope)<0.001?0.001:slope);
        float density=exp(clamp((5.0-eye.y)*0.12,-8.0,8.0));
        float optical=max(0.0,distanceToEye-16.0)*density*integral;
        // Native far fog remains the background; this adds low-lying, local humidity.
        float valley=min(0.10,1.0-exp(-optical*0.0015*humidity));
        float farAir=1.0-exp(-max(0.0,distanceToEye-38.0)*0.0018*humidity);
        // Tree cutouts expose many adjacent depth layers. Dense, bright air
        // washed every shaded layer into the same white silhouette, amplifying
        // subpixel leaf holes. Keep a continuous, optically thinner valley veil.
        float fog=min(0.32,valley+farAir)*surface;
        color=mix(color,airColor,fog);
        // Skip the texture gather entirely when the sun is off screen.
        if(sunVisibility>0.001){
        vec2 delta=(sunUV-vUv)*0.65/float(LIGHT_TAPS);
        vec2 uv=vUv;
        float light=0.0,weight=1.0;
        for(int i=0;i<LIGHT_TAPS;i++){
          uv+=delta;
          float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
          // Only actual sky holes emit shafts. Opaque canopy/rocks never emit light.
          light+=step(0.99999,texture2D(tDepth,uv).r)*inside*weight;
          weight*=0.94;
        }
        float receiver=smoothstep(3.0,25.0,distanceToEye)*surface;
        float angular=exp(-dot(sunUV-vUv,sunUV-vUv)*2.0);
        color+=sunColor*light/float(LIGHT_TAPS)*sunVisibility*receiver*angular*0.12;
        }
        return max(color,vec3(0.0));
      }`;

/** One HDR composite, sharing the alpha-tested scene depth. No second scene draw. */
export function createAerialPass(depth: DepthTexture, camera: PerspectiveCamera, high: boolean) {
  const pass = new ShaderPass({
    defines: { LIGHT_TAPS: high ? 8 : 4 },
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: depth },
      inverseProjection: { value: new Matrix4() }, cameraWorld: { value: new Matrix4() },
      eye: { value: new Vector3() }, sunUV: { value: new Vector2() },
      airColor: { value: new Color() }, sunColor: { value: new Color() },
      sunVisibility: { value: 0 }, humidity: { value: 1 }, airEnabled: { value: 1 },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv;${AERIAL_FRAGMENT}\nvoid main(){gl_FragColor=vec4(applyAerial(texture2D(tDiffuse,vUv).rgb,vUv),1.0);}`,
  });
  // ShaderPass clones shader-definition uniforms, including texture objects.
  pass.uniforms.tDepth!.value = depth;
  const sun = new Vector3(), viewSun = new Vector3();
  return {
    pass,
    update(grade: LightingGrade) {
      camera.updateMatrixWorld();
      pass.uniforms.inverseProjection!.value.copy(camera.projectionMatrixInverse);
      pass.uniforms.cameraWorld!.value.copy(camera.matrixWorld);
      pass.uniforms.eye!.value.copy(camera.position);
      // Distant terrain loses warm ground pigment into blue-grey air.
      // This pass runs in linear HDR, before exposure and the output transfer.
      pass.uniforms.airColor!.value.setRGB(0.13, 0.19, 0.22).lerp(grade.fogColor, 0.08);
      pass.uniforms.sunColor!.value.copy(grade.sunColor);
      pass.uniforms.humidity!.value = 1 - (grade.coastWeight ?? 0) * 0.65;
      viewSun.copy(grade.sunDirection).transformDirection(camera.matrixWorldInverse);
      sun.copy(camera.position).addScaledVector(grade.sunDirection, 100).project(camera);
      pass.uniforms.sunUV!.value.set(sun.x * 0.5 + 0.5, sun.y * 0.5 + 0.5);
      const edge = Math.max(Math.abs(sun.x), Math.abs(sun.y));
      pass.uniforms.sunVisibility!.value = viewSun.z < 0 ? Math.max(0, Math.min(1, (1.3 - edge) / 0.3)) : 0;
    },
  };
}
