import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// node tools/world/layout-audit.mjs [--baseline]: inspect HEAD without changing the checkout.
const root = fileURLToPath(new URL("../../", import.meta.url)).replaceAll("\\", "/");
const baseline = process.argv.includes("--baseline");
// An exported HEAD tree also works where child-process creation is restricted.
const sourceIndex = process.argv.indexOf("--baseline-root");
const baselineRoot = sourceIndex < 0 ? undefined : resolve(process.argv[sourceIndex + 1]);
const server = await createServer({
  root, configFile: false, appType: "custom",
  resolve: { alias: { "@": `${root}src` } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, ws: false },
  plugins: baseline || baselineRoot ? [{
    name: "read-head-layout", enforce: "pre",
    load(id) {
      if (!id.startsWith(`${root}src/`) || !id.endsWith(".ts")) return;
      if (baselineRoot) return readFileSync(resolve(baselineRoot, id.slice(root.length)), "utf8");
      return execFileSync("git", ["show", `HEAD:${id.slice(root.length)}`], { cwd: root, encoding: "utf8" });
    },
  }] : [],
});
try {
  const read = path => server.ssrLoadModule(`/src/features/world/${path}.ts`);
  const { ZONES } = await read("layout/zones");
  const { pathLength, pathPointAt } = await read("layout/path");
  const { routeSeconds, secondsToZone } = await read("layout/timing");
  const { worldHeight } = await read("terrain/height");
  console.log(baseline || baselineRoot ? "HEAD baseline" : "Working layout");
  console.log(JSON.stringify({ routeMetres: pathLength(), routeSeconds: routeSeconds(), zones: ZONES.map(zone => ({
    id: zone.id, seconds: secondsToZone(zone.id), position: zone.position.toArray(),
  })), minimumZoneSeparation: Math.min(...ZONES.flatMap((zone, i) => ZONES.slice(i + 1).map(other => zone.position.distanceTo(other.position)))) }, null, 2));
  console.log("Coastal shoulder snapshots:");
  for (const t of [0.82, 0.85, 0.9, 0.95, 1]) {
    const p = pathPointAt(t);
    const f = pathPointAt(Math.min(1, t + 0.00001)).sub(pathPointAt(Math.max(0, t - 0.00001))).normalize();
    console.log(JSON.stringify([t, [40, 60, 100, 140].map(left => worldHeight(p.x + f.z * left, p.z - f.x * left))]));
  }
} finally { await server.close(); }
