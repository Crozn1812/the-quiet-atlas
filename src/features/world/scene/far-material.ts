import { AlwaysDepth, LessEqualDepth, MeshStandardMaterial, Vector2, WebGLRenderTarget, type WebGLRenderer } from "three";

/** A backdrop shades its own distance/height air. Keeping it out of the local
 * depth buffer prevents the gameplay aerial pass from fogging it a second time. */
export function createFarMaterial(firstLightView: { value: number }) {
  // Alpha stays 1. The transparent queue lets this depth-tested backdrop draw
  // after the sea, whose transparent material writes depth, without giving the
  // shared aerial pass a second mountain depth to fog.
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, transparent: true });
  material.depthWrite = false;
  let depthCopy: WebGLRenderTarget | undefined;
  const farDepthActive = { value: 0 }, farDepth = { value: null as WebGLRenderTarget["depthTexture"] };
  const farDepthSize = { value: new Vector2(1, 1) };
  material.addEventListener("dispose", () => {
    depthCopy?.depthTexture?.dispose(); depthCopy?.dispose(); depthCopy = undefined;
    farDepth.value = null; farDepthActive.value = 0;
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.firstLightView = firstLightView;
    Object.assign(shader.uniforms, { farDepthActive, farDepth, farDepthSize });
    shader.vertexShader = "attribute vec3 farHorizon; varying vec3 ridgeHorizon; varying vec3 farWorld; varying vec3 farNormal;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
farWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
farNormal = normalize(mat3(modelMatrix) * normal);
ridgeHorizon = farHorizon;`);
    shader.fragmentShader = `varying vec3 farWorld; varying vec3 farNormal; varying vec3 ridgeHorizon;
uniform float firstLightView;
uniform float farDepthActive;
uniform sampler2D farDepth;
uniform vec2 farDepthSize;
float farHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float farNoise(vec2 p) {
 vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(farHash(i),farHash(i+vec2(1,0)),f.x),mix(farHash(i+vec2(0,1)),farHash(i+1.0),f.x),f.y);
}
float farCrown(vec2 p) {
 // Rotated, warped frequencies: broad stands, interlocking canopy shadows and
 // fine foliage. No repeated radial crown primitive or regular cell outline.
 vec2 warp=vec2(farNoise(p/39.0),farNoise(p/47.0+31.0));
 vec2 q=p+warp*13.0;
 vec2 r=vec2(q.x*0.8-q.y*0.6,q.x*0.6+q.y*0.8);
 float stands=farNoise(q/105.0)*0.65+farNoise(r/37.0+11.0)*0.35;
 float crowns=farNoise(vec2(r.x*0.12,r.y*0.19))*0.66+farNoise(q*0.34+53.0)*0.34;
 float twigs=farNoise(q*0.89+19.0);
 return stands*0.48+crowns*0.38+twigs*0.14;
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
float firstLightDither = farHash(gl_FragCoord.xy);
if (firstLightDither < firstLightView) discard;
// Preserve foreground occlusion using the depth captured after the sea. Only
// visible backdrop pixels reset their depth to sky, avoiding double aerial fog
// from transparent sea fragments whose colour/coverage can be zero inland.
if(farDepthActive>0.5 && gl_FragCoord.z>texture2D(farDepth,gl_FragCoord.xy/farDepthSize).r) discard;
gl_FragDepth=farDepthActive>0.5?1.0:gl_FragCoord.z;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
float canopy=farCrown(farWorld.xz);
float mountain=smoothstep(95.0,165.0,-farWorld.x);
float slope=1.0-normalize(farNormal).y;
float soil=farNoise(farWorld.xz/15.0 + vec2(canopy*2.0));
float footprint=length(fwidth(farWorld.xz));
float grain=mix(0.5,farNoise(farWorld.xz*2.8),1.0-smoothstep(0.7,2.8,footprint));
float rock=smoothstep(0.22,0.48,slope + (soil-0.5)*0.17);
vec2 geology=farWorld.xz*0.18+vec2(farWorld.y*0.07,farWorld.y*0.13);
geology+=vec2(farNoise(farWorld.xz/17.0),farNoise(farWorld.xz/23.0+37.0))*2.4;
float strata=0.65*farNoise(geology)+0.35*farNoise(geology*3.7+51.2);
vec3 stone=mix(vec3(0.085,0.10,0.095),vec3(0.25,0.235,0.19),strata);
vec3 earth=mix(vec3(0.13,0.105,0.065),vec3(0.24,0.22,0.13),grain);
vec3 meadow=diffuseColor.rgb*(0.68+canopy*0.54+grain*0.12);
meadow=mix(meadow,earth,smoothstep(0.50,0.75,soil)*smoothstep(0.025,0.24,slope)*0.65);
diffuseColor.rgb=mix(meadow,stone,rock*0.9);
// Remote slopes carry a continuous forest skin; no sparse tree cards at skyline.
vec3 forest=mix(vec3(0.012,0.040,0.020),vec3(0.048,0.125,0.046),soil);
forest*=0.48+canopy*0.95+grain*0.10;
vec3 cliff=mix(vec3(0.065,0.075,0.078),vec3(0.22,0.23,0.22),strata);
diffuseColor.rgb=mix(diffuseColor.rgb,mix(forest,cliff,rock*0.92),mountain);
// Grey-green pigment at distance complements the shared blue-grey atmospheric air.
float range=distance(cameraPosition,farWorld);
float grey=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(grey*0.87,grey*1.03,grey*1.10),smoothstep(90.0,650.0,range)*0.26);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
// World-space fine grass/stone relief, filtered by pixel footprint at distance.
float relief = canopy * 0.75 + strata * rock * 0.3;
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
// Backdrop depth stays at sky: this is its only atmospheric extinction.
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
float groundFog=smoothstep(fogNear,fogFar,vFogDepth);
float exposedRange=mountain*smoothstep(4.0,30.0,farWorld.y);
gl_FragColor.rgb=mix(mix(gl_FragColor.rgb,fogColor,groundFog),target,exposedRange);
#endif`);
  };
  material.customProgramCacheKey = () => "hr-far-eroded-ranges-v6";
  material.polygonOffset = true;
  material.polygonOffsetFactor = 2; material.polygonOffsetUnits = 4;
  return Object.assign(material, {
    /** One GPU depth blit, no readback or scene redraw. The copy is distinct
     * from the live attachment; sampling it while writing that attachment is safe.
     * Low and startup/direct renders allocate nothing. */
    prepareDepth(renderer: WebGLRenderer, enabled: boolean) {
      const source = enabled ? renderer.getRenderTarget?.() : null;
      const active = !!source?.depthTexture;
      farDepthActive.value = active ? 1 : 0;
      // A disabled depth test also disables writes in WebGL. ALWAYS keeps the
      // sky-depth write enabled after the shader's explicit foreground test.
      material.depthFunc = active ? AlwaysDepth : LessEqualDepth;
      material.depthWrite = active;
      if (!active) return;
      if (!depthCopy) depthCopy = new WebGLRenderTarget(source.width, source.height, {
        depthTexture: source.depthTexture!.clone(), depthBuffer: true, generateMipmaps: false,
      });
      depthCopy.setSize(source.width, source.height);
      try {
        renderer.initRenderTarget(depthCopy);
        renderer.copyTextureToTexture(source.depthTexture!, depthCopy.depthTexture!);
      } finally {
        // Three's depth blit unbinds READ/DRAW framebuffers; restore the source
        // through its public API before this mesh submits its colour/depth draw.
        renderer.setRenderTarget(source);
      }
      farDepth.value = depthCopy.depthTexture;
      farDepthSize.value.set(source.width, source.height);
    },
  });
}
