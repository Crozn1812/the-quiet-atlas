// Project-original CC0 banyan geometry. Offline, deterministic, no network.
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
  const tips = [];
  const radial = (a, r, y) => v(Math.cos(a) * r + .8, y, Math.sin(a) * r);
  function tube(points, radius, endRadius, steps, sides, fluted = false, moss = false) {
    const curve = new CatmullRomCurve3(points);
    const g = new TubeGeometry(curve, Math.max(5, Math.round(steps / (level ? 1.8 : 1))), radius, Math.max(6, Math.round(sides / (level ? 1.5 : 1))), false);
    const p = g.getAttribute('position'), uv = g.getAttribute('uv');
    const rings = g.parameters.tubularSegments, around = g.parameters.radialSegments;
    const colors = [];
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings, center = curve.getPoint(t);
      const taper = (1 - t) ** .9 + endRadius / radius * t;
      for (let j = 0; j <= around; j++) {
        const i = ring * (around + 1) + j, angle = j / around * Math.PI * 2;
        const flute = fluted ? 1 + Math.sin(angle * 7 + t * 3) * .14 + Math.sin(angle * 13 - t * 5) * .045 : 1;
        const relief = 1 + Math.sin(angle * 19 + center.y * 4) * .014 + Math.sin(center.y * 21 + angle * 9) * .008;
        const point = new Vector3().fromBufferAttribute(p, i).sub(center).multiplyScalar(taper * flute * relief).add(center);
        // Surface AO is baked into vertices at flutes, branch joins and damp feet.
        const ao = (.83 + Math.sin(angle * 7 + t * 3) * .12) * (.69 + Math.min(1, Math.max(0, point.y) / 3) * .31);
        colors.push(ao * .94, ao * .89, ao * .79);
        p.setXYZ(i, point.x, point.y, point.z);
        uv.setXY(i, j / around * Math.max(.5, radius * Math.PI), t * curve.getLength() / 2.2);
      }
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3)); g.computeVertexNormals();
    batches[0].push(g);
    // Discontinuous, raised patches follow the exact bark surface; no green ribbons.
    if (moss) {
      const pos = [], tex = [], tint = [], index = g.index;
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const c = ids.reduce((a, k) => a.add(new Vector3().fromBufferAttribute(p, k)), v(0, 0, 0)).multiplyScalar(1 / 3);
        const normal = ids.reduce((a, k) => a.add(new Vector3().fromBufferAttribute(g.getAttribute('normal'), k)), v(0, 0, 0)).normalize();
        if (normal.y < .28 || Math.sin(c.x * 3.1 + c.z * 2.3) + Math.sin(c.z * 5.7 - c.x) < .15) continue;
        for (const k of ids) {
          const q = new Vector3().fromBufferAttribute(p, k).addScaledVector(normal, .022);
          pos.push(...q.toArray()); tex.push(uv.getX(k) * 3, uv.getY(k) * 3); tint.push(.32, .47, .18);
        }
      }
      if (pos.length) { const patch = new BufferGeometry(); patch.setAttribute('position', new Float32BufferAttribute(pos, 3)); patch.setAttribute('uv', new Float32BufferAttribute(tex, 2)); patch.setAttribute('color', new Float32BufferAttribute(tint, 3)); patch.computeVertexNormals(); batches[2].push(patch); }
    }
  }
  // Fused columns leave deep grooves down the root collar, rather than a cylinder.
  tube([v(.8, -.08, 0), v(.2, 7, .2), v(1.3, 14, -.5), v(0, 23, .4), v(.4, 32, 0)], 2.05, .06, 96, 64, true);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + .25;
    // The fused columns merge back into the bole. Keeping eight giant outward
    // forks here would recreate the old fantasy tree's regular horn silhouette.
    tube([radial(a, 1.6, -.04), radial(a + .14, 1.42, 3.8), radial(a + .28, 1.35, 7.2), radial(a + .36, 1.05, 10), radial(a + .42, .7, 13)], .91, .12, 65, 28, true);
  }
  // Four orders of branching support an irregular, broad evergreen canopy.
  for (let tier = 0; tier < 3; tier++) for (let i = 0; i < 9; i++) {
    const a = i * Math.PI * 2 / 9 + tier * .51 + Math.sin(i * 4.7 + tier) * .17;
    const y = 7.2 + tier * 6.9 + Math.sin(i * 2.3 + tier) * 1.15;
    const reach = (12.8 - tier * 2.2) * (.92 + Math.sin(i * 1.7 + tier) * .12);
    const fork = radial(a + .18, reach * .69, y + 3.8), tip = radial(a + .4, reach, y + 6.5);
    tube([radial(a, .3, y), radial(a -.08, reach * .36, y + .8), fork, tip], .88 - tier * .17, .035, 45, 22, true);
    for (let j = 0; j < 4; j++) {
      const end = radial(a -.38 + j * .29, reach * (.75 + (j % 2) * .29), y + 6.3 + random() * 2.8);
      tube([fork, fork.clone().lerp(end, .55).add(v(0, .5, 0)), end], .22, .015, 18, 10);
      tips.push(end);
      for (let k = 0; k < 3; k++) {
        const twig = end.clone().add(v((random() - .5) * 3, random() * 1.8, (random() - .5) * 3));
        tube([end, end.clone().lerp(twig, .5).add(v(0, .15, 0)), twig], .055, .008, 7, 6);
        tips.push(twig);
      }
    }
    // Air roots start on the branch, behind the sign's 3.4 m wide clear prism.
    if (tier === 0 || i % 3 === 0) {
      const start = radial(a + .13, reach * .62, y + 3.2);
      for (let j = 0; j < (level ? 3 : 6); j++) {
        const top = start.clone().add(v((random() - .5) * .6, 0, (random() - .5) * .6));
        const end = top.clone().add(v(.25 + random() * .4, -top.y + .05, random() * .45));
        if (end.x < -2.5 || (end.z < -3.7 && end.x < .7)) continue;
        tube([top, top.clone().lerp(end, .37).add(v(.22, 0, -.12)), top.clone().lerp(end, .78).add(v(-.12, 0, .13)), end], .045 + random() * .07, .018, 34, 8);
      }
    }
  }
  // Buttress feet follow the legacy seven S paths and their two cross links.
  const ends = [[-.65, -8.5], [-.7, 8.6], [3, 10], [9.2, 7.6], [12, .6], [8.8, -7.4], [2, -10.2]];
  for (let i = 0; i < ends.length; i++) {
    const [x, z] = ends[i], end = v(x, -.055, z), start = end.clone().setY(0).normalize().multiplyScalar(1.25).setY(1.4);
    const normal = v(-z, 0, x).normalize(), bend = 1.45 * (i % 2 ? -1 : 1);
    tube([start, start.clone().lerp(end, .3).addScaledVector(normal, bend).setY(.33), start.clone().lerp(end, .7).addScaledVector(normal, -bend * .72).setY(.08), end], .69, .025, 60, 24, true, true);
  }
  // Narrow climbing vines spiral against columns. Ferns attach to shaded forks.
  for (let i = 0; i < 5; i++) {
    const points = Array.from({ length: 18 }, (_, j) => { const y = 2 + j * .62, a = i * 1.25 + y * .65; return radial(a, 1.8 - y * .035, y); });
    tube(points, .035, .02, 48, 7);
  }
  const leafPos = [], leafUV = [], leafColors = [], leafIndices = [];
  function sprig(center, size, yaw, pitch, tile, fern = false) {
    const right = v(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(size);
    const up = v(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)).multiplyScalar(size * (fern ? 1.4 : .76));
    const ridge = v(0, size * .16, 0), first = leafPos.length / 3;
    const coords = [[-1,-1], [0,-1], [1,-1], [-1,1], [0,1], [1,1]];
    const shade = .74 + random() * .25;
    for (const [x, y] of coords) {
      leafPos.push(...center.clone().addScaledVector(right, x * .5).addScaledVector(up, y * .5).addScaledVector(ridge, x === 0 ? 1 : 0).toArray());
      leafUV.push((tile % 2 + (x + 1) / 2) / 2, (Math.floor(tile / 2) + (y + 1) / 2) / 2);
      leafColors.push(shade * .77, shade * .92, shade * .65);
    }
    leafIndices.push(...[0,1,4,0,4,3,1,2,5,1,5,4].map(i => i + first));
  }
  for (const tip of tips) for (let i = 0; i < (level ? 10 : 24); i++) {
    const a = random() * Math.PI * 2, radius = Math.sqrt(random()) * 2.4;
    sprig(tip.clone().add(v(Math.cos(a) * radius, (random() - .5) * 2.2, Math.sin(a) * radius)), 1.15 + random() * 1.15, random() * Math.PI * 2, .5 + random() * 1.6, i % 4);
  }
  for (let i = 0; i < 18; i++) {
    const a = i * 2.399, y = 2.8 + i % 5 * 1.32;
    const at = radial(a, 1.8, y);
    for (let j = 0; j < 5; j++) sprig(at.clone().add(v(Math.cos(a) * j * .16, -.035 * j * j, Math.sin(a) * j * .16)), .65 + j * .035, a + j * .5, .9 + j * .1, j % 4, true);
  }
  const leaves = new BufferGeometry(); leaves.setAttribute('position', new Float32BufferAttribute(leafPos, 3)); leaves.setAttribute('uv', new Float32BufferAttribute(leafUV, 2)); leaves.setAttribute('color', new Float32BufferAttribute(leafColors, 3)); leaves.setIndex(leafIndices); leaves.computeVertexNormals(); batches[1].push(leaves);

  const doc = await io.read('public/world/lib/hr-tree-buttress-fluted-lod0.glb');
  const materials = doc.getRoot().listMaterials();
  const bark = materials.find(m => m.getName() === 'hr-photographic-bark');
  const leaf = materials.find(m => m.getName().includes('leaf-cutout'));
  const moss = materials.find(m => m.getName() === 'hr-root-moss');
  bark.setName('roots-tree-bark').setDoubleSided(false).setNormalScale(1.25).setRoughnessFactor(.96);
  leaf.setName('roots-tree-leaves').setRoughnessFactor(.92);
  moss.setName('roots-tree-moss').setBaseColorFactor([.7, .8, .6, 1]).setNormalTexture(bark.getNormalTexture()).setNormalScale(.8);
  for (const scene of doc.getRoot().listScenes()) scene.dispose();
  for (const node of doc.getRoot().listNodes()) node.dispose();
  for (const mesh of doc.getRoot().listMeshes()) mesh.dispose();
  const buffer = doc.getRoot().listBuffers()[0], scene = doc.createScene('Roots banyan');
  const mesh = doc.createMesh('roots-ancient-banyan');
  for (let batch = 0; batch < 3; batch++) {
    const geometry = mergeGeometries(batches[batch]);
    const primitive = doc.createPrimitive().setMaterial([bark, leaf, moss][batch]);
    for (const [name, semantic, type] of [['position', 'POSITION', 'VEC3'], ['normal', 'NORMAL', 'VEC3'], ['uv', 'TEXCOORD_0', 'VEC2'], ['color', 'COLOR_0', 'VEC3']]) primitive.setAttribute(semantic, doc.createAccessor().setType(type).setArray(new Float32Array(geometry.getAttribute(name).array)).setBuffer(buffer));
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
    image.uri = `../lib/hr-shared-${hash}.ktx2`;
    const existing = await readFile(`public/world/lib/hr-shared-${hash}.ktx2`);
    if (!Buffer.from(bytes).equals(existing)) throw Error('Texture cache mismatch');
    textures.push({ uri: image.uri, bytes: bytes.length });
  }
  const binary = json.resources[json.json.buffers[0].uri]; delete json.json.buffers[0].uri;
  const j = Buffer.from(JSON.stringify(json.json)), jp = Buffer.alloc(Math.ceil(j.length / 4) * 4, 32); j.copy(jp);
  const bp = Buffer.alloc(Math.ceil(binary.length / 4) * 4); Buffer.from(binary).copy(bp);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jp.length + bp.length, 8); header.writeUInt32LE(jp.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bp.length); bh.writeUInt32LE(0x004e4942, 4);
  const data = Buffer.concat([header, jp, bh, bp]), file = `roots-tree-lod${level}.glb`;
  await writeFile(`${output}/${file}`, data);
  inventory.push({ file, level, ...statistics(doc), drawCalls: 3, bytes: data.length, textures, ao: 'baked vertex occlusion in trunk flutes and damp root feet', source: 'tools/assets/blender/roots-tree-generate.mjs' });
}
await writeFile(`${output}/roots-tree.json`, JSON.stringify({ license: 'CC0-1.0', delivery: 'after playable paint; Low uses procedural fallback; LOD0 within 26m / LOD1 beyond 32m', assets: inventory }, null, 2) + '\n');
const licenses = await readFile('assets/LICENSES.csv', 'utf8');
const additions = [...inventory.map(e => `${output}/${e.file},The Quiet Atlas original geometry / Poly Haven,CC0-1.0,yes,yes,yes,none,https://polyhaven.com/a/pine_bark ; https://polyhaven.com/a/forest_floor ; https://polyhaven.com/license ; tools/assets/blender/roots-tree-generate.mjs,shared 2048 KTX2,3,LOD${e.level},existing Roots colliders`), `${output}/roots-tree.json,The Quiet Atlas,CC0-1.0,yes,yes,yes,none,https://creativecommons.org/publicdomain/zero/1.0/ ; tools/assets/blender/roots-tree-generate.mjs,-,-,manifest,none`].filter(line => !licenses.includes(line.split(',')[0] + ','));
if (additions.length) await appendFile('assets/LICENSES.csv', (licenses.endsWith('\n') ? '' : '\n') + additions.join('\n') + '\n');
console.log(JSON.stringify(inventory, null, 2));
