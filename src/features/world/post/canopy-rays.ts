import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, Points, ShaderMaterial, Vector3, type PerspectiveCamera } from "three";
import { pathPointAt } from "../layout/path";
import { FOREST_SUN_SHAFT_PROGRESS } from "../layout/sun-shafts";
import { createSurfaceSampler } from "../terrain/height";
import type { LightingGrade } from "../sky/grade";
import type { Quality } from "../terrain";

/** World-space light ribbons: the sun need not be in the camera frustum.
 * No shadow/depth writes, no scene redraw, two draws for every forest clearing. */
export function createCanopyRays() {
  const group = new Group(); group.name = "hr-canopy-rays";
  const time = { value: 0 }, direction = { value: new Vector3() }, tint = { value: new Color() };
  const strength = { value: 1 };
  const uniforms = { rayTime: time, rayDirection: direction, rayTint: tint, rayStrength: strength };
  const geometry = new PlaneGeometry(1, 1);
  const seeds: number[] = [], dust: number[] = [];
  const anchors = [0.012, ...FOREST_SUN_SHAFT_PROGRESS, 0.19];
  const anchorPoints = anchors.map(pathPointAt);
  const surface = createSurfaceSampler(), transform = new Object3D();
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform vec3 rayDirection; attribute float raySeed;
      varying vec2 vRayUV; varying vec3 vRayWorld; varying float vRaySeed;
      void main(){
        vec3 base=instanceMatrix[3].xyz;
        vec3 axis=normalize(rayDirection);
        vec3 across=normalize(cross(axis,normalize(cameraPosition-base)));
        float along=uv.y;
        vec3 world=base+axis*along*(25.0+raySeed*14.0)
          +across*position.x*(0.7+raySeed*0.8)*(1.0-along*0.55);
        vRayUV=uv;vRayWorld=world;vRaySeed=raySeed;
        gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float rayTime,rayStrength;uniform vec3 rayTint;
      varying vec2 vRayUV; varying vec3 vRayWorld; varying float vRaySeed;
      void main(){
        float edge=pow(max(0.0,1.0-abs(vRayUV.x*2.0-1.0)),1.7);
        float ends=smoothstep(0.0,0.13,vRayUV.y)*(1.0-smoothstep(0.72,1.0,vRayUV.y));
        float distanceFade=smoothstep(1.5,5.0,distance(cameraPosition,vRayWorld))
          *(1.0-smoothstep(45.0,85.0,distance(cameraPosition,vRayWorld)));
        float noise=0.76+0.14*sin(dot(vRayWorld,vec3(1.3,2.1,0.7))+rayTime*0.19)
          +0.1*sin(vRayUV.y*58.0+vRaySeed*71.0);
        gl_FragColor=vec4(rayTint,edge*ends*distanceFade*noise*rayStrength*0.19);
      }`,
  });
  const rays = new InstancedMesh(geometry, material, anchors.length * 7);
  rays.name = "hr-light-ribbons"; rays.frustumCulled = false; rays.renderOrder = 4;
  let index = 0;
  for (const t of anchors) {
    const anchor = pathPointAt(t);
    for (let n = 0; n < 7; n++) {
      const seed = ((n * 0.618034 + t * 7) % 1);
      const x = anchor.x + (n - 3) * 1.8, z = anchor.z + Math.sin(n * 2.4) * 6;
      const y = surface(x, z) + 0.14;
      transform.position.set(x, y, z); transform.updateMatrix(); rays.setMatrixAt(index++, transform.matrix);
      seeds.push(seed);
      for (let d = 0; d < 22; d++) dust.push(x, y, z, seed, (d * 0.754877 + seed) % 1, (d * 0.56984 + seed) % 1);
    }
  }
  geometry.setAttribute("raySeed", new InstancedBufferAttribute(new Float32Array(seeds), 1));
  const dustGeometry = new BufferGeometry(), positions: number[] = [], phases: number[] = [];
  for (let i = 0; i < dust.length; i += 6) { positions.push(...dust.slice(i, i + 3)); phases.push(...dust.slice(i + 3, i + 6)); }
  dustGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  dustGeometry.setAttribute("phase", new Float32BufferAttribute(phases, 3));
  const dustMaterial = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform vec3 rayDirection;uniform float rayTime;attribute vec3 phase;
      varying float vDust;
      void main(){
        float t=fract(phase.y+rayTime*0.007);
        vec3 across=normalize(cross(rayDirection,vec3(0.0,1.0,0.0)));
        vec3 world=position+rayDirection*t*(25.0+phase.x*14.0)
          +across*sin(phase.z*62.8+rayTime*0.13)*0.36;
        vec4 view=viewMatrix*vec4(world,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(22.0/max(1.0,-view.z),1.0,3.0);
        vDust=smoothstep(0.0,0.15,t)*(1.0-smoothstep(0.7,1.0,t))
          *(1.0-smoothstep(28.0,65.0,length(world-cameraPosition)));
      }`,
    fragmentShader: `uniform vec3 rayTint;uniform float rayStrength;varying float vDust;
      void main(){float dotMask=1.0-smoothstep(0.1,0.5,length(gl_PointCoord-0.5));
      gl_FragColor=vec4(rayTint,dotMask*vDust*rayStrength*0.65);}`,
  });
  const motes = new Points(dustGeometry, dustMaterial); motes.frustumCulled = false; motes.name = "hr-lit-dust"; motes.renderOrder = 5;
  group.add(rays, motes);
  let disposed = false;
  return {
    group,
    update(camera: PerspectiveCamera, grade: LightingGrade, quality: Quality, dt: number, reducedMotion = false) {
      group.visible = quality !== "Low" && anchorPoints.some(p => camera.position.distanceToSquared(p) < 110 ** 2);
      if (!group.visible || disposed) return;
      direction.value.copy(grade.sunDirection);
      tint.value.copy(grade.sunColor);
      strength.value = quality === "High" ? 1 : 0.68;
      if (!reducedMotion) time.value += dt;
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent(); group.clear();
      geometry.dispose(); material.dispose(); rays.dispose(); dustGeometry.dispose(); dustMaterial.dispose();
    },
  };
}
