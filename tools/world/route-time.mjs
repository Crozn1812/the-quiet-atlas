import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Run from any working directory: node tools/world/route-time.mjs
// Existing Vite transforms TS in memory; no generated JSON can become stale.
// Middleware mode opens no HTTP listener or browser; always close the runner.
const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, watch: null, ws: false },
});
try {
  const { ZONES } = await server.ssrLoadModule("/src/features/world/layout/zones.ts");
  const { pathLength } = await server.ssrLoadModule("/src/features/world/layout/path.ts");
  const { routeSeconds, secondsToZone } = await server.ssrLoadModule("/src/features/world/layout/timing.ts");
  console.table(ZONES.map(zone => ({
    zone: zone.id,
    metres: Number((zone.t * pathLength()).toFixed(2)),
    seconds: Number(secondsToZone(zone.id).toFixed(2)),
  })));
  console.log(`Total: ${pathLength().toFixed(2)} m / ${routeSeconds().toFixed(2)} s`);
} finally {
  await server.close();
}
