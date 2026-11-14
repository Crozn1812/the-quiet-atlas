// Offline input preparation. Run from the repository root before sculpt.py.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
await mkdir('tmp/hr-cliff', { recursive: true });
const vite = await createServer({ configFile: false, server: { middlewareMode: true } });
try {
  const { createSpring } = await vite.ssrLoadModule('/src/features/world/terrain/spring.ts');
  const spring = createSpring();
  await writeFile('tmp/hr-cliff/sculpt-input.json', JSON.stringify({ positions: Array.from(spring.cliff.geometry.attributes.position.array), colors: Array.from(spring.cliff.geometry.attributes.color.array) }));
  spring.dispose();
} finally { await vite.close(); }
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
for (const [kind, file] of [['color', 'rock-photo'], ['surface', 'rock-surface']]) {
  const output = `tmp/hr-cliff/atlas-${kind}.png`;
  const result = spawnSync('C:/Program Files/KTX-Software/bin/ktx.exe', ['extract', '--transcode', 'rgba8', '--level', '0', `public/world/tex/${kind}-2048.ktx2`, output], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  // rock_face occupies the third 2K tile in the lower two rows of the PNG atlas.
  await sharp(output).extract({ left: 4096, top: 1024, width: 2048, height: 2048 }).toFile(`tmp/hr-cliff/${file}.png`);
}
