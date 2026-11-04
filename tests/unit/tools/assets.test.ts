import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'tqa-assets-'));
  directories.push(directory);
  return directory;
}
function cli(script: string, args: string[], env = process.env) {
  return spawnSync(process.execPath, [path.join(root, 'tools/assets', script), ...args], {
    encoding: 'utf8', windowsHide: true, env,
  });
}
async function fixture(file: string, triangles = 2, padding = 0) {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document.createAccessor().setType('VEC3').setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const indices = document.createAccessor().setType('SCALAR').setBuffer(buffer)
    .setArray(new Uint16Array(Array.from({ length: triangles * 3 }, (_, i) => i % 3)));
  const material = document.createMaterial().setBaseColorFactor([0.2, 0.5, 0.3, 1]);
  const primitive = document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices).setMaterial(material);
  const mesh = document.createMesh().addPrimitive(primitive);
  document.createScene().addChild(document.createNode().setMesh(mesh));
  if (padding) document.getRoot().setExtras({ padding: 'x'.repeat(padding) });
  await writeFile(file, await new NodeIO().writeBinary(document));
}

describe('asset pipeline CLIs', () => {
  it('optimizes an in-memory fixture and reports a decodable meshopt GLB', async () => {
    const directory = await temporary();
    const input = path.join(directory, 'source.glb');
    const output = path.join(directory, 'tree-pine.glb');
    await fixture(input);
    const result = cli('optimize.mjs', [input, output, '--texture=none']);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      triangles: 2, materials: 1, textures: 0,
      bytesBefore: (await stat(input)).size, bytesAfter: (await stat(output)).size,
    });
    const json = await new NodeIO().readAsJSON(output);
    expect(json.json.extensionsRequired).toContain('EXT_meshopt_compression');
    const check = cli('check-budgets.mjs', [directory]);
    // The untyped source is deliberately rejected; optimized output is decoded and counted.
    expect(JSON.parse(check.stdout).assets).toEqual([
      expect.objectContaining({ file: 'tree-pine.glb', triangles: 2 }),
    ]);
  });

  it('warns and succeeds when toktx is absent from PATH', async () => {
    const directory = await temporary();
    const input = path.join(directory, 'in.glb');
    await fixture(input);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
    env.PATH = directory;
    const result = cli('optimize.mjs', [input, path.join(directory, 'out.glb')], env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('WARNING: toktx is not in PATH');
    expect(JSON.parse(result.stdout).triangles).toBe(2);
  });

  it('supports simplification and rejects invalid options before writing', async () => {
    const directory = await temporary();
    const input = path.join(directory, 'in.glb');
    const output = path.join(directory, 'out.glb');
    await fixture(input);
    const result = cli('optimize.mjs', [input, output, '--texture=none', '--ratio=1']);
    expect(result.status, result.stderr).toBe(0);
    for (const option of ['--ratio=0', '--ratio=NaN', '--ratio=1.1', '--texture=webp', '--unknown']) {
      const invalid = cli('optimize.mjs', [input, output, option]);
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toMatch(/ERROR:/);
    }
  });

  it('passes recursive assets exactly at the triangle budget', async () => {
    const directory = await temporary();
    await mkdir(path.join(directory, 'start', 'forest'), { recursive: true });
    await fixture(path.join(directory, 'start', 'forest', 'tree-pine.glb'), 1500);
    const result = cli('check-budgets.mjs', [directory]);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('PASS');
    expect(report.assets[0].triangles).toBe(1500);
    expect(report.startBytes).toBe(report.worldBytes);
  });

  it('fails triangle and byte limits with actionable file errors', async () => {
    const directory = await temporary();
    await fixture(path.join(directory, 'rock-large.glb'), 401);
    await fixture(path.join(directory, 'tree-heavy.glb'), 1, 60000);
    const result = cli('check-budgets.mjs', [directory]);
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('FAIL');
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/rock-large.glb: 401 triangles > 400/),
      expect.stringMatching(/tree-heavy.glb: \d+ bytes > 60000/),
    ]));
  });

  it('checks world and start totals, including non-GLB payloads', async () => {
    const directory = await temporary();
    await mkdir(path.join(directory, 'start'));
    await writeFile(path.join(directory, 'start', 'texture.ktx2'), new Uint8Array(8000000));
    await writeFile(path.join(directory, 'audio.bin'), new Uint8Array(22000000));
    expect(cli('check-budgets.mjs', [directory]).status).toBe(0);
    await writeFile(path.join(directory, 'start', 'extra.bin'), new Uint8Array(1));
    const result = cli('check-budgets.mjs', [directory]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors).toEqual([
      'World: 30000001 bytes > 30000000.', 'Start: 8000001 bytes > 8000000.',
    ]);
  });

  it('passes empty and missing directories with notes', async () => {
    const directory = await temporary();
    for (const target of [directory, path.join(directory, 'missing')]) {
      const result = cli('check-budgets.mjs', [target]);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.status).toBe('PASS');
      expect(report.note).toMatch(/no assets to check/);
    }
  });

  it('rejects invalid filenames and corrupt GLBs clearly', async () => {
    const directory = await temporary();
    await fixture(path.join(directory, 'pine.glb'));
    await writeFile(path.join(directory, 'prop-broken.glb'), 'invalid');
    const result = cli('check-budgets.mjs', [directory]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors).toEqual([
      expect.stringContaining('pine.glb: expected <type>-<name>.glb'),
      expect.stringContaining('prop-broken.glb: cannot read GLB'),
    ]);
  });
});
