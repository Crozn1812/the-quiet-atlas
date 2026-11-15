// Derive audit poses from the checked-out world; no generated layout is trusted.
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

export async function auditLayout() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
        const candidate = fileURLToPath(new URL(specifier, context.parentURL));
        for (const file of [candidate + ".ts", path.join(candidate, "index.ts")]) {
          if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
        }
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.endsWith(".json") && url.includes("/src/")) {
        return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
      }
      if (url.endsWith(".ts") && url.includes("/src/")) {
        const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
          fileName: fileURLToPath(url),
        }).outputText;
        return { format: "module", source, shortCircuit: true };
      }
      return next(url, context);
    },
  });
  try {
    const from = name => import(pathToFileURL(path.join(root, "src/features/world", name)).href);
    const [{ ZONES }, { surfaceHeight, waterLevelAt, worldHeight }, { placeZoneScenes }, { PATH_BRIDGES, pathPointAt },
      { createFishSchools }, { riverPointAt }, { COAST_BEACH_Z }] = await Promise.all([
      from("layout/zones.ts"), from("terrain/height.ts"), from("zones/index.ts"), from("layout/path.ts"),
      from("water/fish-schools.ts"), from("layout/river.ts"), from("layout/scale.ts"),
    ]);
    const placed = placeZoneScenes(surfaceHeight);
    try {
      return {
        zones: placed.map(zone => ({
          id: zone.zoneId, anchor: zone.group.position.toArray(),
          forward: ZONES.find(z => z.id === zone.zoneId).lookDirection.toArray(),
          target: zone.target.position.toArray(), label: zone.target.label.en,
        })),
        bridges: PATH_BRIDGES.map(b => {
          const p = b.position;
          return [p.x, surfaceHeight(p.x, p.z), p.z];
        }),
        fish: createFishSchools().map(s => ({ name: s.name, center: s.center.toArray(), submergence: s.submergence })),
        road: (() => { const p = pathPointAt(.94); return [p.x, surfaceHeight(p.x, p.z), p.z]; })(),
        shore: (() => {
          const p = pathPointAt(.94), z = p.z - 8;
          let x = p.x;
          for (; x > p.x - 40 && worldHeight(x, z) > 0; x -= .1) { /* sea crossing */ }
          return [x, 0, z];
        })(),
        river: (() => { const p = riverPointAt(.19); return [p.x, waterLevelAt(p.z), p.z]; })(),
        sea: [-12, waterLevelAt(COAST_BEACH_Z), COAST_BEACH_Z],
      };
    } finally { placed.forEach(zone => zone.dispose()); }
  } finally { hooks.deregister(); }
}
