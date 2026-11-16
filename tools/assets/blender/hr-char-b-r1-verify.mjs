// Hair-only revision: compare decoded non-hair surfaces to the saved review input.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createIO } from '../shared.mjs';

const io = await createIO();
const hash = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
for (const file of ['character-hr.glb', 'character-hr-lod1.glb']) {
  const before = (await io.read(`test-results/hr-char-b-r1/${file}`)).getRoot();
  const after = (await io.read(`public/world/character/${file}`)).getRoot();
  const surfaces = root => root.listMeshes().flatMap(mesh => mesh.listPrimitives())
    .filter(p => !p.getMaterial().getName().startsWith('hair_'));
  const saved = surfaces(before);
  const current = surfaces(after);
  assert.equal(current.length, saved.length);
  for (const primitive of current) {
    const name = primitive.getMaterial().getName();
    const reference = saved.find(p => p.getMaterial().getName() === name);
    assert.ok(reference, name);
    assert.equal(hash(primitive.getIndices().getArray()), hash(reference.getIndices().getArray()), `${name} indices`);
    for (const semantic of reference.listSemantics()) {
      assert.equal(hash(primitive.getAttribute(semantic).getArray()), hash(reference.getAttribute(semantic).getArray()), `${name} ${semantic}`);
    }
    for (const [i, target] of reference.listTargets().entries()) for (const semantic of target.listSemantics()) {
      assert.equal(hash(primitive.listTargets()[i].getAttribute(semantic).getArray()), hash(target.getAttribute(semantic).getArray()), `${name} morph ${semantic}`);
    }
    for (const getter of ['getBaseColorTexture', 'getNormalTexture', 'getMetallicRoughnessTexture', 'getOcclusionTexture']) {
      const texture = reference.getMaterial()[getter]();
      if (texture) assert.equal(hash(primitive.getMaterial()[getter]().getImage()), hash(texture.getImage()), `${name} ${getter}`);
    }
  }
  console.log(`${file}: PASS; ${current.length} non-hair surfaces, indices, attributes, grip morphs and textures unchanged`);
}
