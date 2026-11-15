import { spawnSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const runtimeFiles = ['scene/far-landscape.ts', 'scene/far-material.ts', 'scene/far-relief.ts',
  'zones/first-light-cliff-detail.ts', 'terrain/cliffs.ts', 'terrain/cliff-relief.ts'];
const commands = process.argv.slice(2);
const allowed = ['lint', 'typecheck', 'test', 'check:assets', 'check:licenses', 'build', 'e2e'];
const file = 'test-results/hr-fix-terrain/gates.json';
let gates;
try { gates = JSON.parse(readFileSync(file, 'utf8')); } catch { gates = {}; }
for (const name of commands) {
  if (!allowed.includes(name)) throw new Error(`Unexpected check: ${name}`);
  const log = `test-results/hr-fix-terrain/${name.replace(':', '-')}.log`;
  const fd = openSync(log, 'w'), start = Date.now();
  const args = name === 'test' ? [name, '--maxWorkers=2']
    : name === 'e2e' ? ['exec', 'playwright', 'test', 'world', '--workers=2'] : [name];
  const env = { ...process.env, E2E_PORT: '4203' };
  if (name === 'build') Object.assign(env, {
    NEXT_TEST_WASM_DIR: 'C:\\Users\\PC-LP\\AppData\\Local\\next-swc\\wasm\\package', NEXT_BUILD_WEBPACK: '1',
  });
  // Every command and argument comes from the fixed allowlist above.
  const result = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', `pnpm.cmd ${args.join(' ')}`],
    { stdio: ['ignore', fd, fd], windowsHide: true, env });
  closeSync(fd);
  gates[name] = { command: `pnpm ${args.join(' ')}`, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status, ms: Date.now() - start, log,
    startedAt: new Date(start).toISOString(),
    ...(name === 'e2e' ? { port: env.E2E_PORT } : {}), ...(result.error ? { error: String(result.error) } : {}) };
  if (name === 'build' && result.status === 0) {
    gates[name].buildId = readFileSync('.next/BUILD_ID', 'utf8').trim();
    gates[name].sourceHashes = Object.fromEntries(runtimeFiles.map(file => [file,
      createHash('sha256').update(readFileSync(`src/features/world/${file}`)).digest('hex')]));
  }
  writeFileSync(file, JSON.stringify(gates, null, 2));
  console.log(`${name}: ${gates[name].status}, exit ${result.status}`);
  console.log(readFileSync(log, 'utf8').trim().split('\n').slice(-8)
    .map(line => line.length > 1200 ? `${line.slice(0, 1200)} [full output in log]` : line).join('\n'));
  if (result.status !== 0) process.exitCode = 1;
}
