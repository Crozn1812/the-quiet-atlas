// HR-CHAR packaging: Blender export (tmp/hr-char) -> meshopt + KTX2 GLBs in public/world/character.
// Run after: blender -b --factory-startup -t 4 -P tools/assets/blender/hr-char-b.py -- tmp/hr-char-src tmp/hr-char
// No downloads here. PNGs come from hr-char.py + hr-char-b.py (procedural or remapped CC0 MakeHuman).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { reorder, quantize, prune, dedup } from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { Matrix3, Matrix4, Vector3 } from 'three';
import { createIO, statistics } from '../shared.mjs';

const source = 'tmp/hr-char';
const output = 'public/world/character';
const TOKTX = 'C:/Program Files/KTX-Software/bin/toktx.exe';

const FRAME = [0.80, 0.70, 0.48];
/** material -> textures (PNG basenames) and factors. `size` caps the texture edge per LOD. */
const MATERIALS = {
  skin: { color: 'skin_albedo', normal: 'skin_normal', orm: 'skin_orm', normalScale: 0.35, rough: 1 },
  // MakeHuman eyes carry their own clear cornea shell (alpha 0 corner of the texture).
  eye: { color: 'eye', rough: 0.25, alpha: 'MASK', cutoff: 0.5 },
  cornea: { factor: [1, 1, 1, 0.06], rough: 0.03, alpha: 'BLEND' },
  brow: { color: 'brow', rough: 0.7, alpha: 'MASK', cutoff: 0.4, double: true },
  lash: { color: 'lash', rough: 0.7, alpha: 'MASK', cutoff: 0.4, double: true },
  hair_cap: { color: 'hair_cap', normal: 'hair_normal', normalScale: 0.28, rough: 0.92, alpha: 'MASK', cutoff: 0.08, double: true },
  hair_card: { color: 'hair_card', normal: 'hair_card_normal', normalScale: 0.4, rough: 0.62, alpha: 'MASK', cutoff: 0.08, double: true },
  cloth: { color: 'cloth_albedo', normal: 'cloth_normal', orm: 'cloth_orm', rough: 1, double: true },
  canvas: { color: 'canvas_albedo', normal: 'canvas_normal', normalScale: 0.8, rough: 0.9 },
  rubber: { color: 'rubber_albedo', normal: 'rubber_normal', normalScale: 0.5, rough: 0.75 },
  sock: { color: 'sock_albedo', normal: 'sock_normal', normalScale: 0.7, rough: 0.95 },
  tote: { color: 'tote_albedo', normal: 'canvas_normal', normalScale: 0.6, rough: 0.9, double: true },
  frame: { factor: [...FRAME, 1], rough: 0.22, metal: 1 },
  lens: { factor: [0.95, 0.97, 1, 0.1], rough: 0.02, alpha: 'BLEND', double: true },
};
const LODS = [
  { file: 'character-hr.glb', from: 'character-hr.glb', max: 2048, small: 1024 },
  { file: 'character-hr-lod1.glb', from: 'character-hr-lod1.glb', max: 1024, small: 512 },
];
const BIG = new Set(['skin_albedo', 'skin_orm', 'cloth_albedo', 'cloth_normal', 'cloth_orm']);
/** Tiled micro-detail maps: small is plenty. */
const TILE = new Set(['rubber_normal', 'rubber_albedo', 'sock_normal', 'sock_albedo']);

await mkdir(output, { recursive: true });
await mkdir(`${source}/ktx`, { recursive: true });
const io = await createIO();

function encode(name, kind, edge) {
  const target = `${source}/ktx/${name}-${edge}.ktx2`;
  const common = ['--t2', '--genmipmap', '--resize', `${edge}x${edge}`];
  const args = kind === 'normal'
    ? [...common, '--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '3.0', '--zcmp', '18', '--assign_oetf', 'linear']
    : kind === 'orm'
      ? [...common, '--encode', 'etc1s', '--qlevel', '200', '--assign_oetf', 'linear']
      : [...common, '--encode', 'etc1s', '--qlevel', '220', '--assign_oetf', 'srgb'];
  const stamp = createHash('sha256').update(readFileSync(`${source}/${name}.png`)).update(JSON.stringify(args)).digest('hex');
  const cacheStamp = `${target}.sha256`;
  if (!process.env.HR_REENCODE && existsSync(target)
    && (existsSync(cacheStamp) ? readFileSync(cacheStamp, 'utf8') === stamp
      : statSync(target).mtimeMs >= statSync(`${source}/${name}.png`).mtimeMs)) {
    writeFileSync(cacheStamp, stamp);
    return target;
  }
  const result = spawnSync(TOKTX, [...args, target, `${source}/${name}.png`], { windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${name}: ${result.error?.message ?? result.stderr}`);
  writeFileSync(cacheStamp, stamp);
  return target;
}

/** The close-up skin reuses the shipped rig: same joint names, order and inverse binds. */
async function referenceRig() {
  const reference = await io.read('public/world/start/character-duy.glb');
  const skin = reference.getRoot().listSkins()[0];
  return { names: skin.listJoints().map(j => j.getName()), ibm: Array.from(skin.getInverseBindMatrices().getArray()) };
}

const reference = await referenceRig();
const report = [];
for (const lod of LODS) {
  const document = await io.read(`${source}/${lod.from}`);
  const root = document.getRoot();
  const skin = root.listSkins()[0];
  const names = skin.listJoints().map(j => j.getName());
  if (names.join() !== reference.names.join()) throw new Error(`${lod.file}: joint order differs from start/character-duy.glb`);
  // The shipped rig stores a constant authoring transform M in every inverse bind
  // (IBM_ref = IBM_new * M). Runtime swaps geometry under the shipped skeleton, so
  // vertices are re-expressed as M^-1 * v and the reference inverse binds are reused.
  const ibm = Array.from(skin.getInverseBindMatrices().getArray());
  const toRef = names.map((_, j) => new Matrix4().fromArray(ibm, j * 16).invert()
    .multiply(new Matrix4().fromArray(reference.ibm, j * 16)));
  const M = toRef[0];
  const drift = Math.max(...toRef.map(m => Math.max(...m.elements.map((v, i) => Math.abs(v - M.elements[i])))));
  if (drift > 1e-4) throw new Error(`${lod.file}: rig differs from start/character-duy.glb beyond a constant transform (${drift})`);
  const inverse = M.clone().invert();
  const deltaTransform = new Matrix3().setFromMatrix4(inverse);
  const seen = new Set();
  const point = new Vector3();
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    if (seen.has(position)) continue;
    seen.add(position);
    const array = position.getArray();
    for (let i = 0; i < array.length; i += 3) point.fromArray(array, i).applyMatrix4(inverse).toArray(array, i);
    position.setArray(array);
    for (const target of primitive.listTargets()) {
      const delta = target.getAttribute('POSITION');
      if (!delta || seen.has(delta)) continue;
      seen.add(delta);
      const values = delta.getArray();
      for (let i = 0; i < values.length; i += 3) point.fromArray(values, i).applyMatrix3(deltaTransform).toArray(values, i);
      delta.setArray(values);
    }
  }
  skin.getInverseBindMatrices().setArray(new Float32Array(reference.ibm));
  // Blender omits UVs on untextured primitives (cornea, lens, frame); runtime merges all
  // primitives into one grouped geometry, which needs identical attribute sets.
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    if (primitive.getAttribute('TEXCOORD_0')) continue;
    const count = primitive.getAttribute('POSITION').getCount();
    primitive.setAttribute('TEXCOORD_0', document.createAccessor().setType('VEC2')
      .setArray(new Float32Array(count * 2)).setBuffer(root.listBuffers()[0]));
  }
  const cache = new Map();
  const texture = (name, kind) => {
    const edge = BIG.has(name) ? lod.max : TILE.has(name) ? lod.small / 2 : lod.small;
    const key = `${name}-${edge}`;
    if (!cache.has(key)) {
      const path = encode(name, kind, edge);
      cache.set(key, readFile(path).then(bytes => document.createTexture(key).setImage(bytes).setMimeType('image/ktx2')));
    }
    return cache.get(key);
  };
  for (const material of root.listMaterials()) {
    const spec = MATERIALS[material.getName()];
    if (!spec) throw new Error(`Unknown material ${material.getName()}`);
    material.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    material.setBaseColorFactor(spec.factor ?? [1, 1, 1, 1]);
    material.setRoughnessFactor(spec.rough ?? 1).setMetallicFactor(spec.metal ?? 0);
    material.setAlphaMode(spec.alpha ?? 'OPAQUE').setDoubleSided(!!spec.double);
    if (spec.alpha === 'MASK') material.setAlphaCutoff(spec.cutoff);
    if (spec.color) material.setBaseColorTexture(await texture(spec.color, 'color'));
    if (spec.normal) material.setNormalTexture(await texture(spec.normal, 'normal')).setNormalScale(spec.normalScale ?? 1);
    if (spec.orm) {
      const orm = await texture(spec.orm, 'orm');
      material.setMetallicRoughnessTexture(orm).setOcclusionTexture(orm).setOcclusionStrength(0.8);
    }
  }
  for (const texture of root.listTextures()) if (texture.getMimeType() !== 'image/ktx2') texture.dispose();
  document.createExtension(KHRTextureBasisu).setRequired(true);
  root.getAsset().generator = 'The Quiet Atlas HR-CHAR (tools/assets/blender/hr-char.py + hr-char-package.mjs)';
  // POSITION must remain in the shipped rig's bind space. Quantizing positions
  // rewrites IBMs, invalidating an in-place skin swap, and crushes 0.1mm fibres.
  // Meshopt still compresses Float32 positions and relative morph deltas.
  await document.transform(prune({ keepAttributes: true }), dedup(), reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ pattern: /^(?!POSITION$).*/, patternTargets: /^(?!POSITION$).*/ }));
  document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const file = `${output}/${lod.file}`;
  await io.write(file, document);
  const bytes = (await stat(file)).size;
  report.push({ file, bytes, sha256: createHash('sha256').update(await readFile(file)).digest('hex'), ...statistics(document) });
}

const authoring = JSON.parse(await readFile(`${source}/manifest.json`, 'utf8'));
const manifest = {
  id: 'hr-char-b',
  delivery: 'deferred after playable frame; High near = LOD0, Balanced near = LOD1; distant + Low + software keep start/character-duy.glb',
  rig: 'public/world/start/character-duy.glb skeleton (19 joints, same order and inverse binds; checked at package time)',
  height: authoring.height, lods: report, parts: authoring.parts,
  sources: [
    'MPFB2 base mesh + macro targets (CC0): https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.ASSETS.md',
    'MakeHuman system assets (CC0): https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html',
  ],
  derived: 'HR-CHAR CC0 generic MakeHuman face geometry unchanged; natural forehead diffuse. HR-CHAR-B R1: three layers of surface-following short alpha strand cards, measured <=6mm lift, feathered scalp roots and strand normals; runtime anisotropic highlights and object-space alpha hash with opaque depth writes (no transparent sorting). Plain procedural cotton weave, relaxed shirt and HandlebarGrip morph unchanged. Positions/morph deltas stay Float32 in meshopt to preserve exact shipped inverse binds. shoes06 geometry only. hr-char.py + hr-char-b.py.',
};
await writeFile(`${output}/hr-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

const licensePath = 'assets/LICENSES.csv';
let licenses = await readFile(licensePath, 'utf8');
const proof = 'https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.ASSETS.md ; https://static.makehumancommunity.org/assets/assetpacks.html ; https://creativecommons.org/publicdomain/zero/1.0/ ; tools/assets/blender/hr-char.py + hr-char-b.py + hr-char-package.mjs';
const rows = [
  [`${output}/character-hr.glb`, '2048/1024 KTX2', '14', 'LOD0'],
  [`${output}/character-hr-lod1.glb`, '1024/512 KTX2', '14', 'LOD1'],
  [`${output}/hr-manifest.json`, '-', '-', '-'],
];
for (const [file, size, materials, level] of rows) {
  licenses = licenses.split('\n').filter(line => !line.startsWith(`${file},`)).join('\n');
  licenses += (licenses.endsWith('\n') ? '' : '\n') +
    `${file},MakeHuman/MPFB2 community (CC0 base mesh/targets/proxies/textures) + The Quiet Atlas (fitting/tailoring/procedural maps),CC0-1.0,yes,yes,yes,none,${proof},${size},${materials},${level},-\n`;
}
await writeFile(licensePath, licenses);
console.log(JSON.stringify(manifest, null, 2));
