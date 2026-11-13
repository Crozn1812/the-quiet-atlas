import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, MeshStandardMaterial,
  PMREMGenerator, RepeatWrapping, SRGBColorSpace, Vector2, type Texture, type WebGLRenderer,
} from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { PALETTE } from '../../../src/features/world/art/palette';
import { mix, SETTINGS, vector, type Selection } from './settings';

const assetUrls = import.meta.glob<string>('../../../public/world/lib/gfx01/*', { eager: true, query: '?url', import: 'default' });
function assetUrl(file: string) {
  const url = assetUrls[`../../../public/world/lib/gfx01/${file}`];
  if (!url) throw new Error(`Missing generated asset ${file}; run node tools/assets/textures/generate-aaa.mjs`);
  return url;
}

/** Original palette pigments; maps only modulate luminance. No glossy metal. */
export async function createMaterials(renderer: WebGLRenderer, selection: Selection) {
  const { variant, quality, scene } = selection;
  const textures: Texture[] = [], materials: MeshStandardMaterial[] = [];
  const settings = SETTINGS[scene];
  const maps = new Map<string, Texture>();
  let environment: ReturnType<PMREMGenerator['fromEquirectangular']> | undefined;
  if (variant !== 'A') {
    const size = variant === 'C' && quality === 'High' ? 2048 : 1024;
    const loader = new KTX2Loader().setWorkerLimit(1).detectSupport(renderer);
    const names = ['ground', 'ground-normal', 'rock', 'rock-normal', 'bark', 'bark-normal', ...(variant === 'C' ? ['leaves'] : [])];
    const results = await Promise.allSettled(names.map(async name => {
      const texture = await loader.loadAsync(assetUrl(`${name}-${size}.ktx2`));
      texture.colorSpace = name.endsWith('normal') ? '' : SRGBColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      textures.push(texture); maps.set(name, texture);
    }));
    loader.dispose();
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') { textures.forEach(texture => texture.dispose()); throw failed.reason; }
    try {
      const hdr = await new HDRLoader().loadAsync(assetUrl('sky.hdr'));
      const pmrem = new PMREMGenerator(renderer);
      try { environment = pmrem.fromEquirectangular(hdr); }
      finally { hdr.dispose(); pmrem.dispose(); }
    } catch (error) { textures.forEach(texture => texture.dispose()); throw error; }
  }
  function make(color: Color, kind?: string, vertexColors = false, leaf = false) {
    const material = new MeshStandardMaterial({
      color, vertexColors, roughness: leaf ? 0.88 : 0.96, metalness: 0,
      map: kind ? maps.get(kind) : undefined,
      normalMap: kind ? maps.get(`${kind}-normal`) : undefined,
      normalScale: new Vector2(kind === 'bark' ? 0.65 : 0.32, 0.32),
      envMapIntensity: scene === 'horizon' ? 0.6 : 0.4,
      side: leaf ? DoubleSide : undefined,
      alphaTest: leaf ? 0.48 : 0,
    });
    // A restrained sun-facing edge, plus thin-leaf back scatter in C.
    material.onBeforeCompile = shader => {
      shader.uniforms.studySun = { value: vector(settings.sun).normalize() };
      shader.uniforms.studyGlow = { value: settings.light.clone().multiplyScalar(leaf ? 0.26 : 0.045) };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 studyNormal;');
      shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nstudyNormal = inverseTransformDirection(transformedNormal, viewMatrix);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 studySun; uniform vec3 studyGlow; varying vec3 studyNormal;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float edge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
        float back = max(0.0, dot(-normalize(studyNormal), studySun));
        totalEmissiveRadiance += studyGlow * (edge * max(0.0, dot(normalize(studyNormal), studySun)) ${leaf ? '+ back * 0.65' : ''});`);
    };
    material.customProgramCacheKey = () => `gfx01-${leaf ? 'thin' : 'opaque'}`;
    materials.push(material);
    return material;
  }
  return {
    environment: environment?.texture,
    ground: make(new Color(PALETTE.cloud), 'ground', true),
    rock: make(mix('rock', 'rockDark', 0.12), 'rock'),
    bark: make(mix('rock', 'rockDark', 0.45), 'bark'),
    crown: make(mix('forestLight', 'grass', 0.18), undefined, true),
    grass: make(mix('grass', 'forestLight', 0.3), undefined, true),
    leaves: variant === 'C' ? make(mix('forestLight', 'grass', 0.25), 'leaves', false, true) : undefined,
    road: make(mix('asphalt', 'rock', 0.13)),
    stripe: make(mix('laneWhite', 'rock', 0.14)),
    wood: make(mix('rock', 'rockDark', 0.35), 'bark'),
    dispose() { materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); environment?.dispose(); },
  };
}

export function uvFor(geometry: BufferGeometry, kind: 'ground' | 'bark' | 'rock') {
  const p = geometry.getAttribute('position'), uv = [];
  for (let i = 0; i < p.count; i++) uv.push(kind === 'bark' ? p.getX(i) * 0.8 : p.getX(i) * 0.16, kind === 'bark' ? p.getY(i) * 0.2 : (p.getZ(i) + p.getY(i) * 0.6) * 0.16);
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geometry;
}
