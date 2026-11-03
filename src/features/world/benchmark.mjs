// Offline reproducible spike: no WebGL, no network, generated files in OS temp.
import { createRequire } from "node:module";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
// Resolve the already installed Vite through Vitest, without changing dependencies.
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const { build, createServer } = await import(pathToFileURL(vitestRequire.resolve("vite")).href);
const root = resolve("src/features/world");
const temporary = await mkdtemp(join(tmpdir(), "tqa-physics-"));
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {
  const { createObstacles } = await server.ssrLoadModule(`${root}/scene.ts`);
  for (const variant of ["rapier", "raycast"]) {
    const output = join(temporary, variant);
    await build({ configFile: false, logLevel: "error", build: {
      outDir: output, minify: true, target: "es2022",
      lib: { entry: `${root}/${variant}.ts`, formats: ["es"], fileName: "physics" },
    } });
    let bytes = 0;
    const files = [];
    for (const file of await readdir(output)) {
      if (file.endsWith(".js")) { const gzip = gzipSync(await readFile(join(output, file))).length; bytes += gzip; files.push({ file, gzip }); }
    }
    const start = performance.now();
    const physicsModule = await import(pathToFileURL(join(output, "physics.js")).href);
    const meshes = createObstacles();
    let controller = await physicsModule.createController(meshes);
    const initMs = performance.now() - start;
    const samples = [];
    // 840 steps: ramp forward/back (180 each), right (60), column
    // forward/back (180 each), left (60). 10 warm-up, 100 measured cycles.
    const movement = (i) => {
      const phase = i % 840;
      return phase < 180 ? [0, -3] : phase < 360 ? [0, 3] : phase < 420 ? [3, 0] : phase < 600 ? [0, -3] : phase < 780 ? [0, 3] : [-3, 0];
    };
    for (let i = 0; i < 8400; i++) controller.step(...movement(i), 1 / 60);
    for (let i = 0; i < 84000; i++) {
      // Reset the path every cycle, outside timing, to avoid benchmarking empty space after drift.
      if (i % 840 === 0) { controller.dispose(); controller = await physicsModule.createController(meshes); }
      const before = performance.now();
      controller.step(...movement(i), 1 / 60);
      samples.push(performance.now() - before);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ variant, gzipBytes: bytes, files, initMs, meanStepMs: mean, p95StepMs: samples[Math.floor(samples.length * 0.95)], finalPosition: controller.position }));
    controller.dispose();
    for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
} finally { await server.close(); await rm(temporary, { recursive: true, force: true }); }
