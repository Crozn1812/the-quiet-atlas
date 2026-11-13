import { BackSide, BufferGeometry, Color, Mesh, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { PALETTE } from '../../../src/features/world/art/palette';
import { mix, SETTINGS, vector, type SceneId } from './settings';

export function createSky(id: SceneId) {
  const settings = SETTINGS[id];
  const material = new ShaderMaterial({
    side: BackSide, depthWrite: false,
    uniforms: { top: { value: settings.sky }, horizon: { value: settings.horizon }, sunColor: { value: settings.light }, sunDirection: { value: vector(settings.sun).normalize() } },
    vertexShader: 'varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, horizon, sunColor, sunDirection; varying vec3 direction;
      float noise(vec2 p) { return sin(p.x * 1.7 + sin(p.y * 2.3)) * sin(p.y * 1.1 + sin(p.x * 2.1)); }
      void main() {
        vec3 d = normalize(direction); float up = max(d.y, 0.0);
        vec3 sky = mix(horizon, top, pow(up, 0.48));
        float facing = max(0.0, dot(d, sunDirection));
        sky += sunColor * pow(facing, 22.0) * 0.16;
        sky += sunColor * smoothstep(0.99955, 0.99985, facing) * 2.5;
        vec2 p = d.xz / max(0.05, d.y) * 3.0;
        float wisps = noise(p * vec2(0.3, 1.4)) * 0.55 + noise(p * 0.74) * 0.25 + noise(p * 1.9) * 0.12;
        float cloud = smoothstep(0.32, 0.61, wisps) * smoothstep(0.025, 0.1, up) * (1.0 - smoothstep(0.4, 0.85, up));
        sky = mix(sky, mix(sunColor, vec3(0.93), 0.55), cloud * 0.65);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(700, 32, 16), material);
  mesh.name = 'study-sky'; mesh.frustumCulled = false; mesh.layers.set(1);
  return mesh;
}

/** Sparse camera-facing layers: dawn low mist and narrow sun shafts, no full-screen milk. */
export function createMist(id: SceneId, cameraPosition: Vector3, low: boolean) {
  const meshes: Mesh[] = [], settings = SETTINGS[id];
  const count = low ? 3 : 6;
  for (let i = 0; i < count; i++) {
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tint: { value: mix('mist', 'cloud', 0.25).lerp(settings.horizon, 0.22) }, strength: { value: id === 'first-light' ? 0.08 : 0.025 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform vec3 tint; uniform float strength;
        void main(){ vec2 p=vUv*2.0-1.0; float edge=max(0.0,1.0-dot(p,p)); float ripple=0.72+0.28*sin(p.x*9.0+p.y*4.0); gl_FragColor=vec4(tint, edge*edge*strength*ripple); }`,
    });
    const mesh = new Mesh(new PlaneGeometry(85, 7), material);
    mesh.position.set((i % 2 - 0.5) * 16, id === 'first-light' ? 1.4 + i * 0.35 : -1 + i * 0.4, -15 - i * 24);
    mesh.lookAt(cameraPosition.x, mesh.position.y + 0.7, cameraPosition.z); mesh.name = 'height-mist';
    mesh.layers.set(1); meshes.push(mesh);
  }
  if (id === 'first-light') for (let i = 0; i < (low ? 2 : 5); i++) {
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tint: { value: new Color(PALETTE.sunGold).lerp(new Color(PALETTE.cloud), 0.45) } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv;uniform vec3 tint;void main(){float x=abs(vUv.x-0.5)*2.0;float a=pow(1.0-x,3.0)*sin(vUv.y*3.14159)*0.045;gl_FragColor=vec4(tint,a);}',
    });
    const ray = new Mesh(new PlaneGeometry(2.2, 30), material);
    ray.position.set(-18 + i * 7, 9, -22 - i * 8); ray.rotation.z = -0.53; ray.name = 'dawn-shaft'; ray.layers.set(1); meshes.push(ray);
  }
  return meshes;
}

/** Reflected sky gradient, Fresnel, broad ripple normals and a broken warm sun trail. */
export function createWater(id: SceneId, enhanced: boolean) {
  const settings = SETTINGS[id];
  const material = new ShaderMaterial({
    uniforms: { deep: { value: mix('seaDeep', 'indigo', id === 'last-postcard' ? 0.4 : 0.1) }, skyTop: { value: settings.sky }, skyHorizon: { value: settings.horizon }, sunColor: { value: settings.light }, sunDir: { value: vector(settings.sun).normalize() }, detail: { value: enhanced ? 1 : 0 } },
    vertexShader: 'varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}',
    fragmentShader: `varying vec3 world; uniform vec3 deep,skyTop,skyHorizon,sunColor,sunDir; uniform float detail;
      void main(){
        vec3 view=normalize(cameraPosition-world); vec2 p=world.xz;
        vec3 n=normalize(vec3(sin(p.x*1.8+p.y*.7)*.035+sin(p.x*6.1-p.y*2.4)*.012,1.0,cos(p.y*2.2+p.x*.8)*.045));
        float f=.025+.975*pow(1.0-max(0.0,dot(view,n)),5.0);
        vec3 reflected=reflect(-view,n); vec3 sky=mix(skyHorizon,skyTop,pow(max(reflected.y,0.0),.55));
        float glint=pow(max(0.0,dot(reflected,sunDir)),120.0)*(0.35+0.65*sin(p.y*2.5)*sin(p.y*2.5));
        vec3 water=mix(deep*.5,sky,mix(.16,f,detail)); water+=sunColor*glint*.75;
        gl_FragColor=vec4(water,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh: Mesh<BufferGeometry, ShaderMaterial> = new Mesh(new PlaneGeometry(1300, 1300), material);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, -0.35, -350); mesh.name = 'sky-fresnel-water';
  return mesh;
}
