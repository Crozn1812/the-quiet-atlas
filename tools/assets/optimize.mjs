import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune, weld, simplify, meshopt, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { createIO, statistics } from './shared.mjs';

function compressTextures(mode) {
  return async (document) => {
    const probe = spawnSync('toktx', ['--version'], { encoding: 'utf8', windowsHide: true });
    if (probe.error?.code === 'ENOENT') {
      console.error('WARNING: toktx is not in PATH; skipping KTX2 texture compression.');
      return;
    }
    if (probe.error || probe.status !== 0) throw new Error(`toktx unavailable: ${probe.error?.message ?? probe.stderr}`);
    const directory = await mkdtemp(path.join(tmpdir(), 'tqa-ktx-'));
    try {
      for (const [index, texture] of document.getRoot().listTextures().entries()) {
        const mime = texture.getMimeType();
        if (mime === 'image/ktx2') continue;
        if (!['image/png', 'image/jpeg'].includes(mime) || !texture.getImage()) {
          throw new Error(`Cannot compress texture ${texture.getName() || index}: expected PNG or JPEG.`);
        }
        const input = path.join(directory, `${index}.${mime === 'image/png' ? 'png' : 'jpg'}`);
        const output = path.join(directory, `${index}.ktx2`);
        await writeFile(input, texture.getImage());
        const colorSpace = getTextureColorSpace(texture) ?? 'linear';
        const result = spawnSync('toktx', [
          '--t2', '--encode', mode, '--genmipmap', '--assign_oetf', colorSpace,
          ...(mode === 'uastc' ? ['--zcmp', '18'] : []), output, input,
        ], { encoding: 'utf8', windowsHide: true });
        if (result.error || result.status !== 0) {
          throw new Error(`toktx failed for texture ${index}: ${result.error?.message ?? result.stderr}`);
        }
        texture.setImage(await readFile(output)).setMimeType('image/ktx2').setURI('');
        document.createExtension(KHRTextureBasisu).setRequired(true);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}

export async function optimize(input, output, { texture = 'etc1s', ratio } = {}) {
  if (!['etc1s', 'uastc', 'none'].includes(texture)) throw new Error('Invalid --texture: use etc1s, uastc, or none.');
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1)) {
    throw new Error('Invalid --ratio: expected a number in (0, 1].');
  }
  if (path.extname(input).toLowerCase() !== '.glb' || path.extname(output).toLowerCase() !== '.glb') {
    throw new Error('Input and output must be .glb files.');
  }
  if (path.resolve(input) === path.resolve(output)) throw new Error('Input and output must be different paths.');
  const io = await createIO();
  const bytesBefore = (await stat(input)).size;
  const document = await io.read(input);
  await document.transform(dedup(), prune(), weld());
  if (ratio !== undefined) {
    await MeshoptSimplifier.ready;
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }));
  }
  if (texture !== 'none') await document.transform(compressTextures(texture));
  await document.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder }));
  await io.write(output, document);
  return { ...statistics(document), bytesBefore, bytesAfter: (await stat(output)).size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [input, output, ...flags] = process.argv.slice(2);
    if (!input || !output) throw new Error('Usage: optimize.mjs <in.glb> <out.glb> [--texture=etc1s|uastc|none] [--ratio=0.75]');
    const options = {};
    for (const flag of flags) {
      if (flag.startsWith('--texture=') && options.texture === undefined) options.texture = flag.slice(10);
      else if (flag.startsWith('--ratio=') && options.ratio === undefined) options.ratio = Number(flag.slice(8));
      else throw new Error(`Unknown or duplicate option: ${flag}`);
    }
    console.log(JSON.stringify(await optimize(input, output, options)));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
