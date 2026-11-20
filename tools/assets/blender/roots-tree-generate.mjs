// Project-original CC0 live oak geometry. Offline, deterministic, no network.
// node tools/assets/blender/roots-tree-generate.mjs
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { createIO, statistics } from '../shared.mjs';

const output = 'public/world/roots';
await mkdir(output, { recursive: true });
const io = await createIO();
const v = (x, y, z) => new Vector3(x, y, z);
const inventory = [];
for (const level of [0, 1]) {
  let seed = 77139;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const batches = [[], [], []];
  const tips = [], branches = [];
  const radial = (a, r, y) => v(Math.cos(a) * r + .8, y, Math.sin(a) * r);
  function tube(points, radius, endRadius, steps, sides, fluted = false, moss = false, hangingMoss = false, bole = false) {
    const curve = new CatmullRomCurve3(points);
    const g = new TubeGeometry(curve, Math.max(5, Math.round(steps / (level ? 1.8 : 1))), radius, Math.max(6, Math.round(sides / (level ? 1.5 : 1))), false);
    const p = g.getAttribute('position'), uv = g.getAttribute('uv');
    const rings = g.parameters.tubularSegments, around = g.parameters.radialSegments;
    const colors = [], centers = [];
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings, center = curve.getPointAt(t);
      const taper = bole ? 1 - t * (1 - endRadius / radius) : (1 - t) ** .85 + endRadius / radius * t;
      for (let j = 0; j <= around; j++) {
        const i = ring * (around + 1) + j, angle = j / around * Math.PI * 2;
        const flute = fluted ? 1 + Math.sin(angle * 7 + t * 3) * .14 + Math.sin(angle * 13 - t * 5) * .045 : 1;
        const relief = 1 + Math.sin(angle * 19 + center.y * 4) * .045 + Math.sin(center.y * 21 + angle * 9) * .008;
        const point = new Vector3().fromBufferAttribute(p, i).sub(center).multiplyScalar(taper * flute * relief).add(center);
        // Surface AO is baked into vertices at flutes, branch joins and damp feet.
        const ao = (.83 + Math.sin(angle * 7 + t * 3) * .12) * (.69 + Math.min(1, Math.max(0, point.y) / 3) * .31);
        colors.push(...(hangingMoss ? [ao * .58, ao * .72, ao * .23] : [ao * .94, ao * .89, ao * .79]));
        centers.push(...center.toArray());
        p.setXYZ(i, point.x, point.y, point.z);
        uv.setXY(i, j / around * Math.max(.5, radius * Math.PI), t * curve.getLength() / 4.4);
      }
    }
    if (bole) {
      const indices = Array.from(g.index.array), base = rings * (around + 1);
      const a = new Vector3().fromBufferAttribute(p, base), b = new Vector3().fromBufferAttribute(p, base + 1), c = new Vector3().fromBufferAttribute(p, base + 2);
      const forward = b.sub(a).cross(c.sub(a)).dot(curve.getTangent(1)) > 0;
      for (let j = 1; j < around - 1; j++) indices.push(base, base + j + (forward ? 0 : 1), base + j + (forward ? 1 : 0));
      g.setIndex(indices);
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3)); g.setAttribute('oakCenter', new Float32BufferAttribute(centers, 3)); g.computeVertexNormals();
    batches[hangingMoss ? 2 : 0].push(hangingMoss ? g.toNonIndexed() : g);
    // Discontinuous, raised patches follow the exact bark surface; no green ribbons.
    if (moss) {
      const pos = [], tex = [], tint = [], anchors = [], index = g.index;
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const c = ids.reduce((a, k) => a.add(new Vector3().fromBufferAttribute(p, k)), v(0, 0, 0)).multiplyScalar(1 / 3);
        const normal = ids.reduce((a, k) => a.add(new Vector3().fromBufferAttribute(g.getAttribute('normal'), k)), v(0, 0, 0)).normalize();
        if (normal.y < .6 || Math.sin(c.x * 3.1 + c.z * 2.3) + Math.sin(c.z * 5.7 - c.x) < .15) continue;
        for (const k of ids) {
          const q = new Vector3().fromBufferAttribute(p, k).addScaledVector(normal, .022);
          pos.push(...q.toArray()); tex.push(uv.getX(k) * 3, uv.getY(k) * 3); tint.push(.58, .64, .22);
          anchors.push(...new Vector3().fromBufferAttribute(g.getAttribute('oakCenter'), k).toArray());
        }
      }
      if (pos.length) { const patch = new BufferGeometry(); patch.setAttribute('position', new Float32BufferAttribute(pos, 3)); patch.setAttribute('uv', new Float32BufferAttribute(tex, 2)); patch.setAttribute('color', new Float32BufferAttribute(tint, 3)); patch.setAttribute('oakCenter', new Float32BufferAttribute(anchors, 3)); patch.computeVertexNormals(); batches[2].push(patch); }
    }
    if (hangingMoss) g.dispose();
    return g;
  }
  // One short bole, with separate root toes rather than an eight-column cage.
  tube([v(.8, -.35, 0), v(.7, .45, .05), v(.85, 1.35, -.1), v(.8, 3.1, 0)], 1.45, 1.18, 26, 48, true, true, false, true);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7 + .3;
    tube([radial(a, .65, 1.1), radial(a + .06, 1.6, .35), radial(a + .12, 2.8, -.15)], .65, .045, 16, 14, true, true);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + .16 + Math.sin(i * 2.7) * .12;
    const reach = 15.2 + Math.sin(i * 1.9) * 1.6;
    const contact = 10 + (i % 3) * 1.25;
    const tip = radial(a + .08 * Math.sin(i), reach + 1, 4.8 + Math.sin(i * 1.4) * .6);
    const points = [radial(a, .7, 2.6 + i % 3 * .12), radial(a - .06, 3.6, 2.6 + Math.sin(i * 1.7) * .65),
      radial(a + .04, 6.5, 1.8 + Math.cos(i * 2.1) * .7), radial(a + .1, contact, .14),
      radial(a - .03, reach * .93, 2.5 + i % 2), tip];
    branches.push(tube(points, .55 + i % 3 * .025, .09, 72, 26, true, true));
    tips.push(tip);
    for (let j = 0; j < 3; j++) {
      const start = new CatmullRomCurve3(points).getPoint(.91 + j * .035);
      const sign = j % 2 ? 1 : -1;
      const end = radial(a + sign * (.28 + j * .06), 12 + j * 1.7, 6.8 + Math.sin(i * 2.1 + j) * 1.1 + j * .5);
      const bend = start.clone().lerp(end, .44).add(v(sign * .8, -.4 + random(), .65));
      const secondary = [start, bend, bend.clone().lerp(end, .6).add(v(-.45, 1.2, -.3)), end];
      tube(secondary, .23 - j * .035, .024, 28, 12, true, true);
      tips.push(end);
      for (let k = 0; k < 5; k++) {
        const origin = new CatmullRomCurve3(secondary).getPoint(.55 + k * .09);
        const twig = origin.clone().add(v((random() - .5) * 5.8, .7 + random() * 2.4, (random() - .5) * 5.8));
        const elbow = origin.clone().lerp(twig, .48).add(v(sign * .4, -.2, -.45));
        tube([origin, elbow, elbow.clone().lerp(twig, .6).add(v(-.3, .45, .3)), twig], .065, .006, 14, 7);
        tips.push(twig);
      }
    }
    // Short moss beards end above head height; never banyan aerial roots.
    if (i % 3 === 0) for (let j = 0; j < 3; j++) {
      const start = new CatmullRomCurve3(points).getPoint(.94 + j * .015);
      tube([start, start.clone().add(v(.12, -.5, .08)), start.clone().add(v(-.1, -1.2 - j * .14, .15))], .035, .01, 10, 6, false, true, true);
    }
  }
  const leafPos = [], leafUV = [], leafColors = [], leafIndices = [], leafCenters = [];
  function sprig(center, size, yaw, pitch, tile, fern = false, anchor = center) {
    // Keep both mirrored board approaches free of leaf/fern cards, including their extent.
    if (center.x > -5 && center.x < 1.5 && Math.abs(center.z) > 3.5 && Math.abs(center.z) < 13 && center.y < 6.8) return;
    const right = v(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(size);
    const up = v(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)).multiplyScalar(size * (fern ? 1.4 : .76));
    const ridge = v(0, size * .16, 0), first = leafPos.length / 3;
    const coords = [[-1,-1], [0,-1], [1,-1], [-1,1], [0,1], [1,1]];
    const shade = .74 + random() * .25;
    for (const [x, y] of coords) {
      leafPos.push(...center.clone().addScaledVector(right, x * .5).addScaledVector(up, y * .5).addScaledVector(ridge, x === 0 ? 1 : 0).toArray());
      leafUV.push((tile % 2 + (x + 1) / 2) / 2, (Math.floor(tile / 2) + (y + 1) / 2) / 2);
      leafColors.push(shade * .92, shade, shade * .64);
      leafCenters.push(...anchor.toArray());
    }
    leafIndices.push(...[0,1,4,0,4,3,1,2,5,1,5,4].map(i => i + first));
  }
  for (const tip of tips) for (let i = 0; i < (level ? 48 : 140); i++) {
    const a = random() * Math.PI * 2, radius = Math.sqrt(random()) * 1.15;
    sprig(tip.clone().add(v(Math.cos(a) * radius, (random() - .5) * 1.9, Math.sin(a) * radius)), .55 + random() * .3, random() * Math.PI * 2, .5 + random() * 1.6, i % 4);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i % 8) * Math.PI / 4 + .26;
    // Attach to an actual upper bark vertex, including taper/flutes on each LOD.
    const limb = branches[i % 8], p = limb.getAttribute('position'), n = limb.getAttribute('normal');
    const around = limb.parameters.radialSegments;
    const base = Math.round((.3 + Math.floor(i / 8) * .18) * limb.parameters.tubularSegments) * (around + 1);
    let top = base;
    for (let k = base + 1; k <= base + around; k++) if (p.getY(k) > p.getY(top)) top = k;
    const at = v(p.getX(top), p.getY(top), p.getZ(top)).addScaledVector(v(n.getX(top), n.getY(top), n.getZ(top)), .035);
    const anchor = new Vector3().fromBufferAttribute(limb.getAttribute('oakCenter'), top);
    for (let j = 0; j < 7; j++) sprig(at.clone().add(v(Math.cos(a) * j * .11, -.024 * j * j, Math.sin(a) * j * .11)), .48 + j * .045, a + j * .5, .9 + j * .1, j % 4, true, anchor);
  }
  const leaves = new BufferGeometry(); leaves.setAttribute('position', new Float32BufferAttribute(leafPos, 3)); leaves.setAttribute('uv', new Float32BufferAttribute(leafUV, 2)); leaves.setAttribute('color', new Float32BufferAttribute(leafColors, 3)); leaves.setAttribute('oakCenter', new Float32BufferAttribute(leafCenters, 3)); leaves.setIndex(leafIndices); leaves.computeVertexNormals(); batches[1].push(leaves);

  const doc = await io.read('public/world/lib/hr-tree-buttress-fluted-lod0.glb');
  const materials = doc.getRoot().listMaterials();
  const bark = materials.find(m => m.getName() === 'hr-photographic-bark');
  const leaf = materials.find(m => m.getName().includes('leaf-cutout'));
  const moss = materials.find(m => m.getName() === 'hr-root-moss');
  // Reuse the existing CC0 photographic roughness atlas; no new texture payload.
  const prop = await io.read('public/world/lib/hr-prop-log-moss-lod0.glb');
  const sourceRoughness = prop.getRoot().listMaterials()[0].getMetallicRoughnessTexture();
  const roughness = doc.createTexture('roots-reused-CC0-roughness').setImage(sourceRoughness.getImage()).setMimeType(sourceRoughness.getMimeType());
  bark.setName('roots-tree-bark').setDoubleSided(false).setBaseColorFactor([.42, .39, .35, 1]).setNormalScale(1.6).setRoughnessFactor(1).setMetallicFactor(0).setMetallicRoughnessTexture(roughness);
  leaf.setName('roots-tree-leaves').setBaseColorFactor([.3, .42, .2, 1]).setRoughnessFactor(.8);
  moss.setName('roots-tree-moss').setBaseColorTexture(null).setBaseColorFactor([.16, .24, .08, 1]).setRoughnessFactor(1).setNormalTexture(bark.getNormalTexture()).setNormalScale(.8);
  for (const scene of doc.getRoot().listScenes()) scene.dispose();
  for (const node of doc.getRoot().listNodes()) node.dispose();
  for (const mesh of doc.getRoot().listMeshes()) mesh.dispose();
  const buffer = doc.getRoot().listBuffers()[0], scene = doc.createScene('Roots live oak');
  const mesh = doc.createMesh('roots-ancient-live-oak');
  for (let batch = 0; batch < 3; batch++) {
    const geometry = mergeGeometries(batches[batch]);
    const primitive = doc.createPrimitive().setMaterial([bark, leaf, moss][batch]);
    for (const [name, semantic, type] of [['position', 'POSITION', 'VEC3'], ['normal', 'NORMAL', 'VEC3'], ['uv', 'TEXCOORD_0', 'VEC2'], ['color', 'COLOR_0', 'VEC3'], ['oakCenter', '_ROOTS_CENTER', 'VEC3']]) primitive.setAttribute(semantic, doc.createAccessor().setType(type).setArray(new Float32Array(geometry.getAttribute(name).array)).setBuffer(buffer));
    const indices = geometry.index ? new Uint32Array(geometry.index.array) : Uint32Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i);
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer)); mesh.addPrimitive(primitive);
    geometry.dispose(); batches[batch].forEach(g => g.dispose());
  }
  scene.addChild(doc.createNode('roots-tree').setMesh(mesh));
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder }));
  const json = await io.writeJSON(doc, { format: 'GLTF' });
  const textures = [];
  for (const image of json.json.images) {
    const bytes = json.resources[image.uri];
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const shared = Buffer.from(bytes).equals(Buffer.from(sourceRoughness.getImage())) ? sourceRoughness.getURI() : `hr-shared-${hash}.ktx2`;
    image.uri = `../lib/${shared}`;
    const existing = await readFile(`public/world/lib/${shared}`);
    if (!Buffer.from(bytes).equals(existing)) throw Error('Texture cache mismatch');
    textures.push({ uri: image.uri, bytes: bytes.length });
  }
  const binary = json.resources[json.json.buffers[0].uri]; delete json.json.buffers[0].uri;
  const j = Buffer.from(JSON.stringify(json.json)), jp = Buffer.alloc(Math.ceil(j.length / 4) * 4, 32); j.copy(jp);
  const bp = Buffer.alloc(Math.ceil(binary.length / 4) * 4); Buffer.from(binary).copy(bp);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jp.length + bp.length, 8); header.writeUInt32LE(jp.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bp.length); bh.writeUInt32LE(0x004e4942, 4);
  const data = Buffer.concat([header, jp, bh, bp]), file = `roots-tree-lod${level}.glb`;
  if (data.length > (level ? 1500000 : 6000000)) throw Error('QF-04 payload budget exceeded');
  await writeFile(`${output}/${file}`, data);
  inventory.push({ file, level, ...statistics(doc), drawCalls: 3, bytes: data.length, textures, ao: 'baked vertex occlusion in trunk flutes and damp root feet', source: 'tools/assets/blender/roots-tree-generate.mjs' });
}
await writeFile(`${output}/roots-tree.json`, JSON.stringify({ license: 'CC0-1.0', species: 'project-original ancient live oak', primaryLimbs: 8, aerialRoots: 0, delivery: 'after playable paint; Low uses matching procedural oak; LOD0 within 26m / LOD1 beyond 32m', assets: inventory }, null, 2) + '\n');
const licenses = await readFile('assets/LICENSES.csv', 'utf8');
const additions = [...inventory.map(e => `${output}/${e.file},The Quiet Atlas original live oak geometry / Poly Haven,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/pine_bark ; https://polyhaven.com/a/forest_floor ; https://polyhaven.com/license ; tools/assets/blender/roots-tree-generate.mjs,shared 2048 KTX2,3,LOD${e.level},trunk and ground-contact limbs only`), `${output}/roots-tree.json,The Quiet Atlas,CC0-1.0,yes,yes,yes,none,https://creativecommons.org/publicdomain/zero/1.0/ ; tools/assets/blender/roots-tree-generate.mjs,-,-,manifest,none`].filter(line => !licenses.includes(line.split(',')[0] + ','));
if (additions.length) await appendFile('assets/LICENSES.csv', (licenses.endsWith('\n') ? '' : '\n') + additions.join('\n') + '\n');
console.log(JSON.stringify(inventory, null, 2));
