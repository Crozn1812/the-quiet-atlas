// Build/test workspace for transferred Windows worktrees whose old generated
// directories lack the current sandbox's write capability. Copies sources only;
// never changes permissions, tracked configuration, or the original artifacts.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const results = path.resolve(process.env.HR_PROPS_RESULTS ?? 'tools/styleframes/.vite/test-results/hr-props2');
const destination = path.join(results, 'build-workspace');
if (!destination.startsWith(`${root}${path.sep}`)) throw new Error('Staging must stay inside this worktree');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const hashes = {}, directories = new Set();
let bytes = 0;
for (const file of files) {
  const target = path.join(destination, file), directory = path.dirname(target);
  if (!directories.has(directory)) { await mkdir(directory, { recursive: true }); directories.add(directory); }
  await copyFile(path.join(root, file), target);
  bytes += (await stat(target)).size;
  if ((file.startsWith('src/') && !file.endsWith('.md')) || /^(package.json|pnpm-lock.yaml|tsconfig.json|.*config\.[cm]?[jt]s)$/.test(file)) {
    hashes[file] = createHash('sha256').update(await readFile(target)).digest('hex');
  }
}
const snapshot = { root, destination, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), files: files.length, bytes, hashes };
await writeFile(path.join(results, 'source-at-build.json'), JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify({ destination, files: files.length, bytes, hashedFiles: Object.keys(hashes).length }));
