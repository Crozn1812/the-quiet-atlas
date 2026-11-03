// Offline reproducible P01-B benchmark (Rapier only): no WebGL, no network, generated files in OS temp.
import { build, createServer } from "vite";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
const root = resolve("src/features/world");
const temporary = await mkdtemp(join(tmpdir(), "tqa-physics-"));
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {

  const terrainModule = await server.ssrLoadModule(`${root}/terrain.ts`);
  const terrain = terrainModule.createTerrain();
  const trees = terrainModule.createTrees(terrain);
  for (const quality of Object.keys(terrainModule.PRESETS)) {
    const meshes = [terrainModule.createTerrainMesh(terrain), ...terrainModule.createForest(trees, quality)];
    let triangles = 0;
    for (const mesh of meshes) triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * (mesh.isInstancedMesh ? mesh.count : 1);
    console.log(JSON.stringify({ milestone: "P01-B", machine: "desktop dGPU RTX 3060 (ADR 0007); offline CPU only", quality, trees: meshes[1].count, treeColliders: trees.length, geometryBatches: meshes.length, terrainForestTriangles: triangles, browserDrawCalls: "NOT RUN; batches exclude player, culling and shadow passes", browserFPS: "DEFERRED P01-F" }));
    for (const mesh of meshes) { if (mesh.isInstancedMesh) mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  const worldOutput = join(temporary, "world");
  await build({ configFile: false, logLevel: "error", build: { outDir: worldOutput, minify: true, target: "es2022", lib: { entry: `${root}/index.ts`, formats: ["es"], fileName: "world" } } });
  const worldFiles = [];
  for (const file of await readdir(worldOutput)) if (file.endsWith(".js")) worldFiles.push({ file, gzip: gzipSync(await readFile(join(worldOutput, file))).length });
  console.log(JSON.stringify({ milestone: "P01-B", worldGzipBytes: worldFiles.reduce((total, file) => total + file.gzip, 0), files: worldFiles, method: "Vite library ES, all dynamic JS chunks, includes both collision choices; not Next transfer trace" }));
  for (const variant of ["rapier"]) {
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
    const meshes = [terrainModule.createTerrainMesh(terrain), ...terrainModule.createForest(trees, "High")];
    let controller = await (variant === "rapier" ? physicsModule.createController(terrain, trees) : physicsModule.createController(meshes));
    const initMs = performance.now() - start;
    const samples = [];
    // P01-B: 840 steps along the central ramp corridor, right (60), grove
    // forward/back (180 each), left (60). 10 warm-up, 100 measured cycles.
    const movement = (i) => {
      const phase = i % 840;
      return phase < 180 ? [0, -3] : phase < 360 ? [0, 3] : phase < 420 ? [3, 0] : phase < 600 ? [0, -3] : phase < 780 ? [0, 3] : [-3, 0];
    };
    for (let i = 0; i < 8400; i++) controller.step(...movement(i), 1 / 60);
    for (let i = 0; i < 84000; i++) {
      // Reset the path every cycle, outside timing, to avoid benchmarking empty space after drift.
      if (i % 840 === 0) { controller.dispose(); controller = await (variant === "rapier" ? physicsModule.createController(terrain, trees) : physicsModule.createController(meshes)); }
      const before = performance.now();
      controller.step(...movement(i), 1 / 60);
      samples.push(performance.now() - before);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ variant, gzipBytes: bytes, files, initMs, meanStepMs: mean, p95StepMs: samples[Math.floor(samples.length * 0.95)], finalPosition: controller.position }));
    controller.dispose();
    for (const mesh of meshes) { if (mesh.isInstancedMesh) mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
} finally { await server.close(); await rm(temporary, { recursive: true, force: true }); }
