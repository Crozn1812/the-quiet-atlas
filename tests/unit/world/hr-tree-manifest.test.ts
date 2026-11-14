import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

it('ships twelve distinct licensed HR trees with decodable LODs and baked four-view impostors', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const manifest = JSON.parse(await readFile('public/world/lib/manifest.json', 'utf8'));
  const entries = manifest.assets.filter((e: { id: string }) => e.id.startsWith('hr-tree-'));
  const licenses = await readFile('assets/LICENSES.csv', 'utf8');
  expect(entries).toHaveLength(12);
  expect(new Set(entries.map((e: { seed: number }) => e.seed)).size).toBe(12);
  expect(entries.filter((e: { ivy: boolean }) => e.ivy).length).toBeGreaterThanOrEqual(5);
  const shapes = entries.map((e: { architecture: string }) => e.architecture);
  for (const shape of ['buttress', 'spreading', 'slender', 'bamboo', 'fallen', 'dead']) expect(shapes).toContain(shape);
  const hashes = new Set<string>();
  for (const entry of entries) {
    expect(entry.license).toBe('CC0-1.0');
    expect(entry.delivery).toBe('deferred-after-play');
    expect(entry.lods.map((l: { level: number }) => l.level)).toEqual([0, 1]);
    expect(entry.lods[1].triangles).toBeLessThan(entry.lods[0].triangles);
    expect(entry.impostor.views).toBe(4);
    expect(entry.impostor.uvRects).toHaveLength(4);
    expect(entry.impostor.tileBorderOpaquePixels).toBe(0);
    expect(entry.impostor.tileOpaquePixels).toHaveLength(4);
    for (const count of entry.impostor.tileOpaquePixels) expect(count).toBeGreaterThan(1000);
    expect(entry.bounds.max[1]).toBeGreaterThan(entry.bounds.min[1]);
    for (const lod of [...entry.lods, entry.impostor]) {
      const file = `public${lod.path}`;
      const bytes = await readFile(file);
      expect((await stat(file)).size).toBe(lod.bytes);
      const hash = createHash('sha256').update(bytes).digest('hex');
      expect(hash).toBe(lod.sha256); expect(hashes.has(hash)).toBe(false); hashes.add(hash);
      expect(licenses.split('\n').filter(row => row.startsWith(`${file},`))).toHaveLength(1);
      const doc = await io.read(file);
      const extensions = doc.getRoot().listExtensionsRequired().map(e => e.extensionName);
      expect(extensions).toContain('EXT_meshopt_compression');
      expect(extensions).toContain('KHR_texture_basisu');
      let triangles = 0, draws = 0;
      for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        draws++; triangles += primitive.getIndices()!.getCount() / 3;
        const pos = primitive.getAttribute('POSITION')!;
        expect(pos.getCount()).toBeGreaterThan(0);
        expect(Array.from(pos.getArray()!).every(Number.isFinite)).toBe(true);
      }
      expect(triangles).toBe(lod.triangles); expect(draws).toBe(lod.drawCalls);
      for (const tex of doc.getRoot().listTextures()) {
        expect(tex.getMimeType()).toBe('image/ktx2');
        const image = tex.getImage()!;
        const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
        expect(view.getUint32(20, true)).toBe(2048);
        expect(view.getUint32(24, true)).toBe(2048);
      }
      for (const texture of lod.sharedTextures ?? []) {
        const image = await readFile(`public${texture.path}`);
        expect(image.byteLength).toBe(texture.bytes);
        expect(createHash('sha256').update(image).digest('hex')).toBe(texture.sha256);
        expect(licenses.split('\n').filter(row => row.startsWith(`public${texture.path},`))).toHaveLength(1);
      }
      if (!entry.id.includes('dead-') && lod !== entry.impostor) {
        const leaf = doc.getRoot().listMaterials().find(m => m.getName().includes('leaf-cutout'))!;
        expect(leaf.getAlphaMode()).toBe('MASK'); expect(leaf.getDoubleSided()).toBe(true);
        expect(leaf.getBaseColorTexture()).not.toBeNull();
        expect(leaf.getExtension('KHR_materials_diffuse_transmission')).not.toBeNull();
        const sprigs = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).find(p => p.getMaterial() === leaf)!;
        expect(new Set(Array.from(sprigs.getAttribute('TEXCOORD_0')!.getArray()!)).size).toBeGreaterThanOrEqual(6);
      }
    }
  }
}, 60_000);
