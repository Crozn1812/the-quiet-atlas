# G-01 ground detail

Regenerate: `node tools/assets/textures/generate.mjs`. Uses installed `toktx`
(or `TOKTX` override), no downloads/dependencies. Intermediate PPMs are in
`tmp/ground-textures/`. Four linear grayscale ETC1S textures plus a mild UASTC
normal, 512x512, ten periodic mip levels. Total: 385,355 bytes (< 600,000).

The existing ramp, vertex pigment, fog and procedural detail are preserved.
Slope selects triplanar rock; pigment separates grass, soil and coastal sand.
Two world scales (1.5/8 m, rotated second sample) fade between 20 and 110 m.
Detail modulation is capped at +/-25%. Normal relief fades too. Low restores
the original shader and does not fetch textures/decoder on entry.
High/Balanced share detail. Added triangles: 0; added draw calls: 0.

Runtime binding is already in `scene/compose.ts`, using the minimal composition
exception in `_graphics-r1.md`: first terrain render loads textures, quality
changes update the binding, and composition disposal releases resources.
`mesh.ts` names terrain tiles for shared material discovery. No index.ts edits.

Lead must await the existing binding before publishing world-ready to include
texture readiness in the explicit entry gate (use the actual composition name):

```ts
await composition.loadTerrainDetail(gpu);
```

Do not create a second controller. Explicit entry and render-triggered loading
share one request. Failed loads leave the old shader and reject; a later quality
call can retry. Composition recreation also recreates the binding.

KTX2Loader uses the installed Three package's local bundled Basis decoder URLs.
Raw Basis JS+WASM: 584,862 bytes; together with KTX2: 970,217 bytes before transport
compression, plus loader/Zstd runtime chunks. This is incremental accounting,
not a measured 8 MB entry-gate result.

Review remains required at port 4301: loaded asset list, High before/after images
for eight zones, luma delta <= 0.03, readability at 5-15 m, intro/ending repetition,
entry budget and CPU/GPU timing. Browser/e2e/perf/Lighthouse are not run under the
direct ticket restriction. Source neutrality does not prove rendered luma.

Validation (2026-11-08):
- pnpm.cmd lint: exit 0, 0 warnings.
- pnpm.cmd typecheck: exit 0.
- VITEST_MAX_WORKERS=2 pnpm.cmd test: exit 0.
  Test Files 138 passed (138); Tests 1668 passed (1668); Duration 247.95s.
- Initial unconstrained suite: 4 existing world/CLI tests timed out; full rerun
  above passed with unchanged timeouts/config and two workers.
- node tools/check-licenses/index.mjs: RESULT: PASS.
- ktx validate: 5/5 VALID. git diff --check: exit 0.

Ticket files:
- tools/assets/textures/{generate.mjs,generate.d.mts,README.md}
- public/world/textures/{grass,dirt,rock,sand,normal}.ktx2
- assets/LICENSES.csv (five appended rows)
- src/features/world/terrain/{detail.ts,mesh.ts}
- src/features/world/scene/compose.ts (five binding lines, R1 exception)
- tests/unit/world/terrain-textures{,-loading}.test.ts

Pre-existing review helper changes in tools/review/ingame-shots.mjs and
 tools/review/assets-loaded.mjs were left untouched in this continuation.
No commit was created.
