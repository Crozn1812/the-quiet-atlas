import { LessEqualDepth, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture, type WebGLRenderer } from "three";

/** Real depth preserves occlusion between connected ranges and foreground. */
export function createFarMaterial(firstLightView: { value: number }) {
  // Draw after the depth-writing sea; alpha is always opaque.
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, transparent: true });
  const rockPhoto = { value: null as Texture | null }, rockReady = { value: 0 };
  let disposed = false, loading: Promise<void> | undefined;
  material.addEventListener("dispose", () => {
    disposed = true; rockPhoto.value?.dispose(); rockPhoto.value = null; rockReady.value = 0;
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.firstLightView = firstLightView;
    Object.assign(shader.uniforms, { rockPhoto, rockReady });
    shader.vertexShader = "attribute vec3 farHorizon; varying vec3 ridgeHorizon; varying vec3 farWorld; varying vec3 farNormal;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
farWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
farNormal = normalize(mat3(modelMatrix) * normal);
ridgeHorizon = farHorizon;`);
    shader.fragmentShader = `varying vec3 farWorld; varying vec3 farNormal; varying vec3 ridgeHorizon;
uniform float firstLightView;
uniform sampler2D rockPhoto;
uniform float rockReady;
float farHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float farNoise(vec2 p) {
 vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(farHash(i),farHash(i+vec2(1,0)),f.x),mix(farHash(i+vec2(0,1)),farHash(i+1.0),f.x),f.y);
}
float farCrown(vec2 p) {
 // Overlapping, jittered crowns resolve a forest skin on the remote relief.
 // The slope still determines the silhouette; no billboards or repeated cones.
 vec2 q=(p+vec2(farNoise(p/39.0),farNoise(p/47.0+31.0))*9.0)/5.5;
 vec2 cell=floor(q), f=fract(q); float crown=0.0;
 for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++){
   vec2 site=cell+vec2(float(x),float(y));
   float seed=farHash(site), other=farHash(site+vec2(57.0,19.0));
   vec2 d=vec2(float(x),float(y))+vec2(0.18+seed*0.64,0.18+other*0.64)-f;
   d*=vec2(0.90+other*0.35,0.82+seed*0.42);
   float cap=max(0.0,1.0-dot(d,d)*(0.85+seed*0.45));
   crown=max(crown,cap*(0.65+other*0.35));
 }
 float stands=farNoise(p/105.0)*0.6+farNoise(p/37.0+11.0)*0.4;
 // Small foliage and stand variation interrupt each cap before it can read as
 // a repeated circular mound under derivative lighting.
 return crown*0.25+stands*0.20+farNoise(p*0.89+19.0)*0.55;
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
float firstLightDither = farHash(gl_FragCoord.xy);
if (firstLightDither < firstLightView) discard;
// Fixed-function depth preserves both foreground and inter-range occlusion.`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
float canopy=farCrown(farWorld.xz);
float mountain=smoothstep(95.0,165.0,-farWorld.x);
float slope=1.0-normalize(farNormal).y;
float soil=farNoise(farWorld.xz/15.0 + vec2(canopy*2.0));
float footprint=length(fwidth(farWorld.xz));
float grain=mix(0.5,farNoise(farWorld.xz*2.8),1.0-smoothstep(0.7,2.8,footprint));
float rock=smoothstep(0.38,0.68,slope + (soil-0.5)*0.10);
vec2 geology=farWorld.xz*0.18+vec2(farWorld.y*0.07,farWorld.y*0.13);
geology+=vec2(farNoise(farWorld.xz/17.0),farNoise(farWorld.xz/23.0+37.0))*2.4;
float strata=0.65*farNoise(geology)+0.35*farNoise(geology*3.7+51.2);
vec3 meadow=mix(vec3(0.075,0.115,0.035),vec3(0.14,0.19,0.065),soil)*(0.60+canopy*0.75);
// Remote slopes carry a continuous forest skin; no sparse tree cards at skyline.
vec3 forest=mix(vec3(0.012,0.040,0.020),vec3(0.048,0.125,0.046),soil);
forest*=0.30+smoothstep(0.22,0.72,canopy)*1.35+grain*0.16;
vec3 cliff=mix(vec3(0.065,0.075,0.078),vec3(0.22,0.23,0.22),strata);
if(rockReady>0.5){
 vec3 weights=pow(abs(normalize(farNormal)),vec3(4.0)); weights/=dot(weights,vec3(1.0));
 vec3 photo=texture2D(rockPhoto,farWorld.zy/4.0).rgb*weights.x
   +texture2D(rockPhoto,farWorld.xz/4.0).rgb*weights.y+texture2D(rockPhoto,farWorld.xy/4.0).rgb*weights.z;
 cliff=photo*0.32;
}
diffuseColor.rgb=mix(mix(meadow,forest,0.7),cliff,rock*0.92);
// Grey-green pigment at distance complements the shared blue-grey atmospheric air.
float range=distance(cameraPosition,farWorld);
float grey=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(grey*0.87,grey*1.03,grey*1.10),smoothstep(90.0,650.0,range)*0.26);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
// World-space fine grass/stone relief, filtered by pixel footprint at distance.
float relief = canopy * 0.32 + strata * rock * 0.3;
vec3 sx=dFdx(farWorld), sy=dFdy(farWorld);
vec3 rx=cross(sy,normalize(farNormal)), ry=cross(normalize(farNormal),sx);
float det=dot(sx,rx);
vec3 gradient=sign(det)*(dFdx(relief)*rx+dFdy(relief)*ry);
vec3 bumped=normalize(abs(det)*normalize(farNormal)-gradient*0.55);
normal=normalize(mat3(viewMatrix)*bumped);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
#if NUM_DIR_LIGHTS > 0
vec3 farSun=inverseTransformDirection(directionalLights[0].direction,viewMatrix);
// Reuse the footprint-filtered world relief normal rather than evaluating the
// whole canopy field twice more for every distant fragment.
float crownLight=clamp(dot(bumped,farSun),0.0,1.0);
outgoingLight*=mix(0.76,1.16,crownLight)*(0.88+0.20*canopy);
float horizon=mix(ridgeHorizon.y,farSun.x<0.0?ridgeHorizon.x:ridgeHorizon.z,clamp(abs(farSun.x)/0.8,0.0,1.0));
float elevation=farSun.y/max(0.01,length(farSun.xz));
float castShadow=smoothstep(horizon-0.025,horizon+0.05,elevation);
float facing=max(0.0,dot(normalize(farNormal),farSun));
float skyView=clamp(normalize(farNormal).y,0.0,1.0);
float shelter=clamp(1.0-dot(ridgeHorizon,vec3(0.28)),0.2,1.0);
// Broad sky and neighbouring forest illuminate shaded spurs as well as their
// tops. Keep occlusion in gullies, without turning an entire backlit flank into
// the same near-black input underneath the shared atmospheric scatter.
vec3 coolFill=vec3(0.70,1.20,1.15)*(0.45+0.55*skyView)*(0.60+0.40*shelter)*(0.65+0.35*canopy);
// Linear irradiance must retain a readable sun/shade ratio after the shared
// aerial composite; albedo alone must not carry the lighting of the mountain.
vec3 warmSun=vec3(3.8,3.35,2.6)*facing*castShadow;
vec3 reliefLight=diffuseColor.rgb*(coolFill+warmSun)*(0.60+0.40*crownLight);
outgoingLight=mix(outgoingLight,reliefLight,mountain);
#endif
#include <opaque_fragment>`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", `
#ifdef USE_FOG
// Range extinction complements the optically thin local aerial composite.
// Distance separates ranges; humidity collects under shoulders, not on summits.
float airRange=distance(cameraPosition,farWorld);
float farExtinction=1.0-exp(-max(0.0,airRange-130.0)*0.0011);
// Match the local ground mist at the foot, with an irregular height falloff.
// Keeping this separate from range extinction preserves dark green shoulders.
float mistTop=8.0+(farNoise(farWorld.xz/69.0)-0.5)*12.0;
float valleyAir=(1.0-smoothstep(mistTop-4.0,mistTop+32.0,farWorld.y))*smoothstep(130.0,300.0,airRange);
vec3 mountainAir=vec3(0.12,0.22,0.30);
vec3 target=mix(gl_FragColor.rgb,mountainAir,farExtinction);
target=mix(target,fogColor,valleyAir);
// A single height/range air field covers every connected slope, including the toe.
gl_FragColor.rgb=target;
#endif`);
  };
  material.customProgramCacheKey = () => "hr-far-depth-relief-v7";
  material.polygonOffset = true;
  material.polygonOffsetFactor = 2; material.polygonOffsetUnits = 4;
  return Object.assign(material, {
    prepareDepth(_renderer: WebGLRenderer, enabled: boolean) {
      material.depthFunc = LessEqualDepth; material.depthWrite = enabled;
    },
    /** Reuse the licensed 2K photograph after the playable hardware gate. */
    startDetail(renderer: WebGLRenderer) {
      if (disposed) return Promise.resolve();
      loading ??= (async () => {
        const { KTX2Loader } = await import("three/examples/jsm/loaders/KTX2Loader.js");
        const loader = new KTX2Loader().detectSupport(renderer);
        try {
          const photo = await loader.loadAsync("/world/cliff/cliff-color.ktx2");
          if (disposed) { photo.dispose(); return; }
          photo.wrapS = photo.wrapT = RepeatWrapping; photo.colorSpace = SRGBColorSpace;
          photo.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          photo.needsUpdate = true; rockPhoto.value = photo; rockReady.value = 1;
        } finally { loader.dispose(); }
      })().catch(() => { /* Analytic rock remains available offline. */ });
      return loading;
    },
  });
}
