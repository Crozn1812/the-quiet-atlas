import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIO, statistics } from './shared.mjs';

export async function checkBudgets(directory = 'public/world') {
  const budgets = JSON.parse(await readFile(new URL('./budgets.json', import.meta.url), 'utf8'));
  const root = path.resolve(directory);
  const report = { status: 'PASS', assets: [], worldBytes: 0, startBytes: 0, errors: [], note: '' };
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
      if (path.extname(entry.name).toLowerCase() !== '.glb') continue;
      const match = /^(tree|rock|prop|character|vehicle)-([a-z0-9]+(?:-[a-z0-9]+)*)\.glb$/i.exec(entry.name);
      if (!match) {
        report.errors.push(`${relative}: expected <type>-<name>.glb; type must be tree, rock, prop, character, or vehicle.`);
        continue;
      }
      try {
        const type = match[1].toLowerCase();
        const { triangles } = statistics(await io.read(absolute));
        const budget = budgets.types[type];
        report.assets.push({ file: relative, type, triangles, bytes });
        if (triangles > budget.triangles) report.errors.push(`${relative}: ${triangles} triangles > ${budget.triangles}.`);
        if (bytes > budget.bytes) report.errors.push(`${relative}: ${bytes} bytes > ${budget.bytes}.`);
      } catch (error) {
        report.errors.push(`${relative}: cannot read GLB: ${error.message}`);
      }
    }
  }
  await visit(root);
  if (report.worldBytes > budgets.worldBytes) report.errors.push(`World: ${report.worldBytes} bytes > ${budgets.worldBytes}.`);
  if (report.startBytes > budgets.startBytes) report.errors.push(`Start: ${report.startBytes} bytes > ${budgets.startBytes}.`);
  if (report.worldBytes === 0) report.note = 'Directory is empty; no assets to check.';
  if (report.errors.length) report.status = 'FAIL';
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: check-budgets.mjs [dir=public/world]');
    const report = await checkBudgets(process.argv[2]);
    console.log(JSON.stringify(report));
    if (report.status === 'FAIL') process.exitCode = 1;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
