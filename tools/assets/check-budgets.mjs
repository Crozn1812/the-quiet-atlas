import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIO, statistics } from './shared.mjs';
import { recordMetrics } from '../checks/budget-report.mjs';
import { validateKtx2 } from '../checks/ktx2.mjs';

export async function checkBudgets(directory = 'public/world') {
  const budgets = JSON.parse(await readFile(new URL('./budgets.json', import.meta.url), 'utf8'));
  const root = path.resolve(directory);
  const report = { status: 'PASS', mode: 'report-only', assets: [], worldBytes: 0, startBytes: 0, errors: [], comparisons: [], note: '' };
  try {
    if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    report.note = 'Directory does not exist; no assets to check.';
    return report;
  }
  const io = await createIO();
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        report.errors.push(`${relative}: symbolic links are not supported.`);
        continue;
      }
      if (entry.isDirectory()) { await visit(absolute); continue; }
      if (!entry.isFile()) continue;
      const bytes = (await stat(absolute)).size;
      report.worldBytes += bytes;
      if (relative.startsWith('start/')) report.startBytes += bytes;
      if (path.extname(entry.name).toLowerCase() === '.ktx2') {
        try { validateKtx2(await readFile(absolute)); }
        catch (error) { report.errors.push(`${relative}: cannot read KTX2: ${error.message}`); }
      }
      if (path.extname(entry.name).toLowerCase() !== '.glb') continue;
      const match = /^(?:hr-)?(tree|palm|rock|cliff|prop|character|vehicle)-([a-z0-9]+(?:-[a-z0-9]+)*)\.glb$/i.exec(entry.name);
      if (!match) {
        report.errors.push(`${relative}: expected <type>-<name>.glb; type must be tree, palm, rock, cliff, prop, character, or vehicle (optional hr- prefix).`);
        continue;
      }
      try {
        const type = match[1].toLowerCase();
        const document = await io.read(absolute);
        for (const texture of document.getRoot().listTextures()) {
          if (texture.getMimeType() === 'image/ktx2') validateKtx2(Buffer.from(texture.getImage()));
        }
        const { triangles } = statistics(document);
        const budget = budgets.types[type === 'cliff' ? 'rock' : type === 'palm' ? 'tree' : type];
        report.assets.push({ file: relative, type, triangles, bytes });
        report.comparisons.push({ file: relative, triangles, bytes, legacyReference: budget });
      } catch (error) {
        report.errors.push(`${relative}: cannot read GLB: ${error.message}`);
      }
    }
  }
  await visit(root);
  report.legacyReference = { worldBytes: budgets.worldBytes, startBytes: budgets.startBytes };
  if (report.worldBytes === 0) report.note = 'Directory is empty; no assets to check.';
  if (report.errors.length) report.status = 'FAIL';
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: check-budgets.mjs [dir=public/world]');
    const report = await checkBudgets(process.argv[2]);
    report.measurement = recordMetrics('assets', {
      worldBytes: report.worldBytes, startBytes: report.startBytes,
      ...Object.fromEntries(report.assets.flatMap(asset => [
        [`${asset.file}:bytes`, asset.bytes], [`${asset.file}:triangles`, asset.triangles],
      ])),
    });
    console.log(JSON.stringify(report));
    if (report.status === 'FAIL') process.exitCode = 1;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
