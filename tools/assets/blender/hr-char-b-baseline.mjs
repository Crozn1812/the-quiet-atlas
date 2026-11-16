// Read-only baseline: both character code and asset bytes come from the same commit.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export function baselinePlugin() {
  const base = process.env.HR_REVIEW_BASE ?? 'HEAD';
  const files = ['ride.ts', 'hr-appearance.ts', 'baked-appearance.ts'];
  const snapshot = process.env.HR_REVIEW_BASE_DIR;
  const sources = new Map(files.map(file => [`/src/features/world/character/${file}`,
    snapshot ? readFileSync(existsSync(`${snapshot}/before-${file}.txt`) ? `${snapshot}/before-${file}.txt`
      : `src/features/world/character/${file}`, 'utf8')
      : execFileSync('git', ['show', `${base}:src/features/world/character/${file}`], { encoding: 'utf8' })]));
  const assets = new Map(['character-hr.glb', 'character-hr-lod1.glb'].map(file => [`/world/character/${file}`,
    snapshot ? readFileSync(`${snapshot}/${file}`)
      : execFileSync('git', ['show', `${base}:public/world/character/${file}`], { maxBuffer: 32 * 1024 * 1024 })]));
  return {
    name: 'hr-char-b-baseline', enforce: 'pre',
    transform(code, id) {
      for (const [suffix, source] of sources) if (id.replaceAll('\\', '/').split('?')[0].endsWith(suffix)) return source;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const bytes = assets.get(req.url?.split('?')[0]);
        if (!bytes) return next();
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.end(bytes);
      });
    },
  };
}
