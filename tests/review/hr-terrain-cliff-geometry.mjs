// Verify the shipped GLB, including its quantized seam vertices, in world metres.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { createServer } from 'vite';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { writeFile } from 'node:fs/promises';
await MeshoptDecoder.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/world/cliff/cliff-high.glb');
const node = doc.getRoot().listNodes().find(n => n.getName() === 'first-light-sculpted-rock');
const primitive = node.getMesh().listPrimitives()[0];
const geometry = new BufferGeometry();
for (const [gltf, three] of [['POSITION', 'position'], ['NORMAL', 'normal']]) {
  const a = primitive.getAttribute(gltf), values = [];
  for (let i = 0; i < a.getCount(); i++) values.push(...a.getElement(i, []));
  geometry.setAttribute(three, new Float32BufferAttribute(values, 3));
}
geometry.setIndex(Array.from(primitive.getIndices().getArray()));
const mesh = new Mesh(geometry, new MeshStandardMaterial());
mesh.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix())); mesh.updateMatrixWorld(true);
const original = geometry.getAttribute('position').clone(), p = new Vector3();
const vite = await createServer({ configFile: false, server: { middlewareMode: true } });
try {
  const { sculptSpringCliff } = await vite.ssrLoadModule('/src/features/world/terrain/cliff-relief.ts');
  sculptSpringCliff(mesh);
  const moved = geometry.getAttribute('position'), positions = new Map(), normal = geometry.getAttribute('normal');
  let maxHorizontal = 0, maxDrop = 0, maxSeam = 0, duplicates = 0, maxEdgeGrowth = 0;
  for (let i = 0; i < moved.count; i++) {
    const a = p.fromBufferAttribute(original, i).applyMatrix4(mesh.matrixWorld).clone();
    const b = new Vector3().fromBufferAttribute(moved, i).applyMatrix4(mesh.matrixWorld);
    maxHorizontal = Math.max(maxHorizontal, Math.hypot(a.x - b.x, a.z - b.z)); maxDrop = Math.max(maxDrop, a.y - b.y);
    const key = a.toArray().map(n => Math.round(n * 1000)).join(':');
    if (positions.has(key)) { duplicates++; maxSeam = Math.max(maxSeam, positions.get(key).distanceTo(b)); } else positions.set(key, b);
    if (!Number.isFinite(normal.getX(i) + normal.getY(i) + normal.getZ(i))) throw new Error('Nonfinite normal');
  }
  const index = geometry.index;
  for (let i = 0; i < index.count; i += 3) for (let j = 0; j < 3; j++) {
    const a = index.getX(i + j), b = index.getX(i + (j + 1) % 3);
    const before = new Vector3().fromBufferAttribute(original, a).distanceTo(new Vector3().fromBufferAttribute(original, b));
    const after = new Vector3().fromBufferAttribute(moved, a).distanceTo(new Vector3().fromBufferAttribute(moved, b));
    maxEdgeGrowth = Math.max(maxEdgeGrowth, (after - before) * mesh.scale.x);
  }
  const report = { vertices: moved.count, triangles: index.count / 3, maxHorizontal, maxDrop, maxSeam, duplicates, maxEdgeGrowth };
  console.log(JSON.stringify(report, null, 2));
  await writeFile('test-results/hr-terrain-cliff/return1/geometry.json', JSON.stringify(report, null, 2));
  if (maxHorizontal > 2 || maxDrop > 2.21 || maxSeam > .01 || maxEdgeGrowth > 2) throw new Error('Relief envelope or seam regression');
} finally { await vite.close(); geometry.dispose(); mesh.material.dispose(); }
