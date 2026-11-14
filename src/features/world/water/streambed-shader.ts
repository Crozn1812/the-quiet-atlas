import { Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial, type Texture } from "three";
import { createPhotoMaterial } from "../materials/cc0";

/** Mineral colours are shared by High and Low, with rare pale quartz. */
export function bedStoneColor(seed: number, target = new Color()) {
  const mineral = (seed * 73.31) % 1;
  target.setHex(mineral < 0.38 ? 0xb09a75 : mineral < 0.79 ? 0x96988f : mineral < 0.95 ? 0xa87760 : 0xdfdcd0);
  return target.multiplyScalar(0.88 + ((seed * 37.13) % 1) * 0.24);
}

export function createBedStoneFallback() {
  const material = new MeshBasicMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute vec2 bedWet; varying float vWetStone;`).replace("#include <begin_vertex>", `#include <begin_vertex>
      float stoneY = (modelMatrix * instanceMatrix * vec4(position, 1.0)).y;
      vWetStone = 1.0 - smoothstep(bedWet.x - 0.06, bedWet.x + 0.13, stoneY);`);
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `varying float vWetStone;
      void main() {`).replace("#include <color_fragment>", `#include <color_fragment>
      diffuseColor.rgb *= mix(1.0, 0.76, vWetStone);`);
  };
  material.customProgramCacheKey = () => "streambed-low-v2";
  return material;
}

export function createBedStoneMaterial(textures: readonly Texture[], size: number, boulder: boolean) {
  const original = new MeshStandardMaterial({ color: 0xffffff });
  const material = createPhotoMaterial("rock", original, textures, size);
  original.dispose();
  const compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute vec2 bedWet; varying vec2 vBedWet;`).replace("#include <begin_vertex>", `#include <begin_vertex>
      vBedWet = bedWet;`);
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `varying vec2 vBedWet;
      void main() {`).replace("float baseTile = 4.0;", `float baseTile = ${boulder ? "4.0" : "2.0"};`)
      .replace("float overlayTile = baseTile; float overlay = 0.0;", `
        float overlayTile = 5.0;
        float bedPatch = sin(photoWorld.x * 12.3 + sin(photoWorld.z * 8.1))
          * sin(photoWorld.z * 15.7 + photoWorld.y * 11.0 + vBedWet.y * 6.28);
        float damp = 1.0 - smoothstep(0.10, 0.32, abs(photoWorld.y - vBedWet.x));
        float shadedTop = smoothstep(0.35, 0.85, photoN.y) * (0.65 + 0.35 * sin(photoWorld.x * 2.1 + photoWorld.z));
        float overlay = ${boulder ? "0.94" : "0.08"} * smoothstep(-0.5, 0.25, bedPatch)
          * max(damp, shadedTop);`)
      .replace("float region =", `photoAlbedo = mix(photoAlbedo, photoAlbedo * vec3(0.32, 0.69, 0.16), overlay);
        float bedWetness = 1.0 - smoothstep(vBedWet.x - 0.06, vBedWet.x + 0.13, photoWorld.y);
        diffuseColor.rgb *= mix(1.0, 0.64, bedWetness);
        float region =`)
      .replace("roughnessFactor = clamp(photoRelief.b, 0.72, 1.0);", `roughnessFactor = mix(clamp(photoRelief.b, 0.72, 1.0), 0.38, bedWetness * (1.0 - overlay));`);
  };
  material.customProgramCacheKey = () => `streambed-photo-v2:${boulder}:${size}`;
  return material;
}

/** Rooted tapered blades. Only the free tip moves; no per-frame instance uploads. */
export function createBedPlantMaterial(leaf: boolean) {
  const material = new MeshStandardMaterial({ color: leaf ? 0x67553a : 0x568634,
    emissive: leaf ? 0 : 0x182d08, emissiveIntensity: 0.22, roughness: 0.82, metalness: 0, side: DoubleSide });
  const time = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.bedTime = time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute vec2 bedWet; uniform float bedTime; varying vec2 vBedUv; varying float vBedSeed;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vBedUv = uv; vBedSeed = bedWet.y;
        float tip = uv.y;
        transformed.x *= pow(max(0.0, sin(tip * 3.14159265)), 0.65);
        ${leaf ? `transformed.z += sin(tip * 3.14159265) * 0.012;
          transformed.x += sin(bedTime * 0.25 + bedWet.y * 6.28) * 0.7;
          transformed.y += mod(bedTime * 0.08 + bedWet.y, 1.0) * 1.4 - 0.7;` : `
          transformed.y += 0.5;
          transformed.x += tip * tip * (0.9 + sin(bedTime * 1.6 + bedWet.y * 6.28 + tip * 2.0) * 0.55);
          transformed.z += tip * tip * sin(bedTime * 1.1 + bedWet.y * 9.0) * 0.08;`}`);
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", `varying vec2 vBedUv; varying float vBedSeed;
      void main() {`).replace("#include <color_fragment>", `#include <color_fragment>
        float vein = 1.0 - smoothstep(0.01, 0.045, abs(vBedUv.x - 0.5));
        float ribs = pow(0.5 + 0.5 * sin(vBedUv.y * 95.0 + abs(vBedUv.x - 0.5) * 23.0), 6.0);
        diffuseColor.rgb *= 0.68 + vBedUv.y * 0.28 + vBedSeed * 0.25 + vein * 0.18 - ribs * 0.13;`);
  };
  material.customProgramCacheKey = () => `streambed-plant-v1:${leaf}`;
  return { material, time };
}

export function createBedFoamMaterial() {
  return new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { bedTime: { value: 0 }, foamColor: { value: new Color(0xcbd9cb) } },
    vertexShader: `attribute vec2 bedWet; varying vec2 vUv; varying float vSeed;
      void main() { vUv = uv; vSeed = bedWet.y;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float bedTime; uniform vec3 foamColor; varying vec2 vUv; varying float vSeed;
      vec2 foamHash(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }
      void main() {
        // UV.y runs downstream. Broken side eddies open into a fading wake;
        // there is no radial mask or closed ring around the rock.
        vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
        float bend = sin(p.y * 11.0 + vSeed * 9.0 - bedTime * 0.45) * 0.10;
        float spread = mix(0.33, 0.66, p.y);
        float side = exp(-pow((abs(p.x + bend) - spread) / (0.10 + p.y * 0.16), 2.0));
        float trail = exp(-pow((p.x + bend) / 0.39, 2.0)) * smoothstep(0.35, 0.60, p.y);
        float fade = smoothstep(0.03, 0.20, p.y) * (1.0 - smoothstep(0.62, 1.0, p.y));
        float breakup = smoothstep(-0.45, 0.55, sin(p.y * 28.0 - bedTime * 1.3 + vSeed * 17.0)
          + sin(p.x * 21.0 + p.y * 13.0 + vSeed * 31.0));
        vec2 cells = p * vec2(17.0, 37.0) + vec2(vSeed * 31.0, -bedTime * 1.8);
        vec2 cell = floor(cells), within = fract(cells);
        float bubble = 10.0;
        for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
          vec2 neighbour = vec2(float(x), float(y));
          vec2 jitter = foamHash(cell + neighbour);
          float radius = 0.10 + jitter.x * 0.20;
          bubble = min(bubble, abs(length(neighbour + jitter - within) - radius));
        }
        float aa = max(fwidth(bubble), 0.025);
        float bubbles = 1.0 - smoothstep(0.035, 0.035 + aa, bubble);
        float alpha = min(1.0, side + trail * 0.6) * fade * breakup * bubbles * 0.53;
        if (alpha < 0.025) discard;
        gl_FragColor = vec4(foamColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}
