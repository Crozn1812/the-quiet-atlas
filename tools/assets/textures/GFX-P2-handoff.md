# GFX-P2b — continuation (current handoff)

The latest card is `D:/the-quiet-atlas/docs/tickets/GFX-P2b.md`.
Final exported world acceptance: **43/43 PASS**, default config, two workers.
Load-budget: **2/2 PASS**, all six cold runs below 5.368 seconds.
This continuation changes only `materials/cc0.ts`, `terrain/detail.ts`,
their two unit test files, the existing GPU/runtime verification scripts and
this handoff. All original P2 assets and changes below remain in the worktree.
No commit, dependency, download, config, e2e test, vehicle or index.ts edit.

## Implementation

- Low/adaptive Low, software renderers and GPUs below 4096 max texture size
  use a shared MeshBasicMaterial with the existing palette/vertex colours and
  fog. No photo, triplanar, normal/roughness, procedural fragment detail or
  lighting lookups. This is the flat-colour option explicitly allowed by P2b.
- Original vertex hooks still select padded batched rock/log silhouettes and
  colours. Unrelated scene materials are unchanged. Hardware Balanced/High
  keep the existing P2 PBR shaders, atlases and selected-triangle normal fix.
- Adaptive Low applies synchronously, invalidates pending High decodes,
  disposes photo GPU resources and discovers streamed meshes. A later High
  reloads the correct photos; stale completions cannot replace the fallback.
- Software fallback installs before deferred dressing completes, so the first
  High post/shadow draw already uses flat surfaces. Hardware photo loading
  stays behind the dressing marker, including quality changes during build.

## Frame measurements (local diagnostics)

SwiftShader, pinned High, 1280x720, one browser, 40 consecutive rAF intervals
after warmup at each location. These are local diagnostic frame means, not
Iris Xe T08 or an ABBA CPU certification. The machine runs other workers.

| Export / material path | First Light ms/frame | Parked bike ms/frame |
| --- | ---: | ---: |
| Existing main out (older export) | 409.75 | 545.50 |
| Retained P2 return-2 out | 1181.00 | 1171.75 |
| Same P2 out, original-material diagnostic | 1301.25 | 1302.76 |
| Same P2 out, flat-colour diagnostic | 877.25 | 800.49 |
| Final P2b export, early flat fallback | **675.33** | **685.00** |

Final export reduces mean frame time by **42.8% / 41.5%** versus the old P2
export. It is also cheaper than restoring original materials on the same
retained scene (the diagnostic material control). Absolute software High FPS
is still low; 43/43 e2e is the functional acceptance, not T08 certification.

JSON, screenshots and raw intervals: ignored `tmp/gfx-p2/p2b-{main,before,
candidate,flat-candidate,final}/measure.json`. Main out is not a matched current
source baseline: its vehicle test also times out before dressing completes
(2 failed, 1 passed). It cannot certify equivalence to main d51fc89.

Response-patched diagnostics are not acceptance builds. Original materials:
1/3 vehicle tests; flat fallback: 2/3; early flat fallback: 1/3. Original
timeouts/assertions/config and two workers throughout. The mount
transition uses `animDt` capped at .1 s in index.ts and adds it to elapsed in
character/ride.ts; below 10 FPS wall-clock transition time grows. Proposal for
the owning ticket: advance presentation transitions with a separately managed
elapsed clock that still freezes while paused. No such change was made here.

## Validation and final export

- `pnpm.cmd lint --max-warnings=0`: exit 0, zero warnings.
- `pnpm.cmd typecheck`: exit 0.
- `pnpm.cmd test --maxWorkers=4 --testTimeout=60000`: exit 0:
  `Test Files 159 passed (159); Tests 1803 passed (1803); Duration 181.35s`.
  The CLI timeout is the existing strict gate setting; no test timeout changed.
- Exactly one P2b WASM/webpack `pnpm.cmd build`: exit 0;
  `Compiled successfully in 2.8s`; `22/22` static pages; CV/OG generated.
  Source/export agree. Build log: `tmp/gfx-p2/p2b-build.log`.
- Hardware and SwiftShader source GPU regressions: exit 0; Low/Balanced/High
  and zero-normal framebuffer checks PASS. Lit pixels: hardware 1279/1465/1465,
  software 1267/1267/1267. The benchmark has 3 draws at all tiers. P2b adds no
  geometry, draw call or public asset bytes to P2.
- `pnpm.cmd check:assets`: exit 0, PASS; world 14,525,711 B; start 147,096 B.
  `pnpm.cmd check:licenses`: exit 0, `RESULT: PASS`.

- `E2E_PORT=4236 pnpm.cmd exec playwright test world --workers=2`: exit 0,
  **`43 passed (5.8m)`**, no retry, no skips, default Playwright config.
  All three motion/vehicle cases passed. Dressing times after Enter World:
  brake 12.041 s; rolling 12.257 s; during-mount 10.977 s.
  After all 43 results, Playwright's Windows web-server teardown stalled;
  stopped only its owned node listener on port 4236, then the command reported
  its summary and exited 0. Tests were already complete. No test/config change.
  Log: `tmp/gfx-p2/p2b-e2e.log`.
- `PERF_PORT=4239 PERF_RUNS=3 pnpm.cmd test:perf load-budget`: exit 0,
  **`2 passed (59.2s)`**. Cold cache, 10 Mbps / 100 ms RTT, each locale 3 runs:
  en **5.367 / 5.363 / 5.317 s**, vi **5.316 / 5.333 / 5.322 s**.
  Worst **5.368 s** (rounded upward), below ADR0018's 10 s and the older 6 s.
  Entry **2,159,686 compressed B** every run; zero 3D on Welcome and Quick.
  Local RTX 3060 D3D11 / i5-14400F / 32 GB / Balanced power / Edge 157,
  not an Iris Xe certification. Explicit gzip server reused to avoid the
  Windows teardown issue above. Reports: `test-results/load-budget/`;
  log: `tmp/gfx-p2/p2b-load-budget.log`.

- Matched 1280x720 hardware High First Light + Workshop pairs were visually
  inspected. Control is the retained P2 export with only the already-reviewed
  selected-normal correction applied at response time; candidate is the final
  static export. P2b does not change the physical shader or photo atlas.
  Luma before/after: First Light **.510692 / .510647** (delta **-.000045**),
  Workshop **.514184 / .513227** (delta **-.000957**), both inside +/-.03.
  Mean absolute RGB difference on the 0..255 scale: **.151 / 1.347**; wind,
  water and particle timing varies, so this is not a pixel-identical claim.
  Pairs: `tmp/gfx-p2/p2b-{before-high,final-high}/{first-light,workshop}.png`;
  data: `tmp/gfx-p2/p2b-final-high/comparison.json`. Hardware errors: `[]`.

- `TQA_QUALITY=high node tools/review/ingame-shots.mjs ...`: exit 0,
  eight 1600x900 High zone captures at `tmp/gfx-p2/p2b-high/`. Current luma:

  | Zone | High luma |
  | --- | ---: |
  | First Light | .507 |
  | Workshop | .515 |
  | Roots | .518 |
  | Milestones | .491 |
  | Old Trail | .480 |
  | Horizon | .607 |
  | Quiet Shore | .412 |
  | Last Postcard | .390 |

  Logs: `p2b-{shots,luma,hue}.log`. This eight-zone table is current evidence;
  the matched P2b before/after acceptance above covers the two requested zones.
  The historical return-2 black-scene captures below are superseded.
- `node tools/assets/textures/verify-world.mjs http://127.0.0.1:4237
  tmp/gfx-p2/p2b-low`: exit 0; Low/Balanced/High/Low, network and console PASS.
  `capture.json`: `errors: []`, no 512 photo request, successful 1024/2048
  requests. Low First Light screenshot visually inspected:
  `tmp/gfx-p2/p2b-low/ingame-first-light.png`.
- Final `bash tools/lead/gate.sh .`: exit 0:
  **`GATE PASS: lint, typecheck, Tests 1803 passed (1803)`**.
  Log: `tmp/gfx-p2/p2b-gate.log`. `git diff --check`: exit 0.

Known limits: Low and software deliberately lose photographic detail and
surface lighting on the P2 surfaces. Software High still pays other systems'
High/post costs; the measured absolute FPS is not a T08 claim. CPU ABBA,
Iris Xe T08 and Lighthouse remain Lead gates. The retained older main export
does not provide a matched-current-main FPS certification. Existing ETC1S
normal/mip compromises from the P2 atlas remain. No further build is needed
for this source; this continuation used exactly one production build.

Files changed in this continuation (all original P2 files remain below):

- `src/features/world/materials/cc0.ts`
- `src/features/world/terrain/detail.ts`
- `tests/unit/world/terrain-textures-loading.test.ts`
- `tests/unit/world/terrain-textures.test.ts`
- `tools/assets/textures/review.ts`
- `tools/assets/textures/verify-world.mjs`
- `tools/assets/textures/GFX-P2-handoff.md`

Two adjacent validation files outside P2b's narrow materials/detail/unit scope
were updated: `review.ts` expects the new flat software material, and
`verify-world.mjs` no longer waits for a 512 texture request on flat Low.
Both are existing P2 verification tools, and were already allowed by GFX-P2.

## Lead integration

Zero new lines in index.ts. Existing composition owns these hooks:

```ts
dressing.defer(composed.buildGround);
composed.setQuality(quality);
composed.dispose();
```

The full original P2 file inventory and prior evidence are retained below.

---

# GFX-P2 — return 2 (historical)

Source checks PASS; static acceptance is incomplete. The authorized return-2
build passed, world e2e finished 41/43, and both vehicle mount failures repeated
on an isolated two-worker retry. Hardware review exposed a P2 ground normal
bug; the final source fixes it and passes hardware/software GPU regressions.
The static export predates that correction. No second return-2 build was run;
further build authorization was requested. No commit was made.

HEAD is 54680c7, already rebased by Lead. Confirmed E2E-VH 42b9662, P1 1e83b17
and P3 426bc0b are ancestors. Main's updated return-2 card explicitly says Lead
already rebased W-C and to skip rebase/stash; neither was attempted.

## Changes this continuation

- Connected COAST_SAND_Z from layout/scale.ts to photographic sand selection,
  guarding interpolated masks at MAP-01's coastal boundary.
- Fixed normals in materials/cc0.ts for deferred ground variants. Alternate
  rocks/logs can draw where the shared first-variant normal attribute is zero.
  Normalizing it produced invalid PBR output, blacking out Workshop/Old Trail
  with the new postprocessing. Ground photos now derive normals from the
  selected world-space triangle and retain flat shading: Standard flatShading
  on Balanced/High, FLAT_SHADED on Low's toon. No P1/P3 source/geometry changes.
- Added an actual framebuffer regression to review.ts: render a ground variant
  with all-zero shared normals against black, require at least 100 lit pixels.
  Hardware Low/Balanced/High: 1250/1465/1465 lit pixels. SwiftShader: 1241 each.
- verify-world.mjs accepts an output folder and records expected P1 HDRI
  net::ERR_ABORTED cancellations separately. Photo failures, other network
  failures and all page/console errors still fail it. GPU review includes
  collected page errors when reporting readiness timeouts.

The complete file list is retained in the historical implementation section
below. This continuation changed materials/cc0.ts, tools/assets/textures/
{review.ts,verify-cc0.mjs,verify-world.mjs,GFX-P2-handoff.md}. All files are in
allowed paths, plus the shared LICENSES inventory explicitly required by GFX
common. No dependency/download, config, index.ts, package/lockfile, docs,
e2e/perf test or P1/P3 edits. Diagnostics stay in ignored tmp/gfx-p2/.

## Current source validation

- pnpm.cmd lint --max-warnings=0: exit 0, zero warnings.
- pnpm.cmd typecheck: exit 0.
- pnpm.cmd test --maxWorkers=4 --testTimeout=60000: exit 0:
  Test Files 159 passed (159); Tests 1800 passed (1800); Duration 112.23s.
- Final bash tools/lead/gate.sh .: exit 0:
  GATE PASS: lint, typecheck, Tests 1800 passed (1800).
  This gate ran after the final normal fix, including Low's FLAT_SHADED define.
- Source GPU bench: hardware Edge and SwiftShader exit 0, all three tiers and
  zero-normal regressions PASS. Logs: return2-gpu-{source,software}-final.log.
- pnpm.cmd check:assets: exit 0, status PASS, world 14,525,711 B;
  start assets 147,096 B. The old 10,043,051 B world total below predates P1/P3.
  P2's six files remain 9,332,568 B, saving 3,805,149 B (29.0%) versus its
  original atlas layout. Added triangles/draw calls: 0.
- pnpm.cmd check:licenses: exit 0, RESULT: PASS.
- KTX validator: six files exit 0, no diagnostics. git diff --check: exit 0.

## Authorized static build evidence (before final normal fix)

- Exactly one return-2 WASM/webpack build: exit 0,
  Compiled successfully in 4.2s; 22/22 static pages; CV/OG generated.
  Log: tmp/gfx-p2/return2-build.log.
- E2E_PORT=4206 pnpm.cmd exec playwright test world --workers=2,
  unchanged default config: exit 1; 2 failed; 41 passed (4.6m).
  Both failures are world-vehicle.spec.ts:45: transitioning remains true at the
  existing 15-second mount deadline, in "brake to rest" and "E while rolling".
  "E during mount" passes. Isolated --last-failed --workers=2 repeats both.
  No test or timeout changes. Logs: return2-e2e.log, return2-e2e-retry.log;
  original traces preserved under tmp/gfx-p2/return2-e2e-initial/.
- A diagnostic response-patched candidate containing only the final normal fix
  also reproduces both mount failures with two workers. This is not a rebuilt
  export or acceptance run. Log: return2-candidate-e2e.log.
- PERF_PORT=4209 PERF_RUNS=3 pnpm.cmd test:perf load-budget: exit 0,
  2 passed (2.1m). Cold cache, 10 Mbps / 100 ms RTT; playable seconds:
  en 5.388 / 5.955 / 5.933; vi 6.167 / 5.934 / 6.036.
  Worst 6.167 s, under ADR0018's requested 10 s, above the older 6 s target.
  Entry 2,159,409 compressed bytes every run; zero 3D requests on Welcome/Quick.
  Reports: test-results/load-budget/load-budget{,-vi}.{json,md}.
  RTX 3060 D3D11, i5-14400F, 32 GB RAM, Balanced power, Edge 157; not Iris Xe T08.
- Hardware runtime Low → Balanced → High → Low, photo network and console:
  exit 0, errors []. Low First Light: tmp/gfx-p2/return2-low/
  {ingame-first-light.png,capture.json}.
- High eight-zone capture: exit 0, eight 1600×900 images in
  tmp/gfx-p2/return2-high/. Workshop/Old Trail are black bug evidence, not
  accepted art. Logs: return2-luma.log, return2-hue.log.

| High zone | Original Lead baseline | Return-2 export | Delta |
| --- | ---: | ---: | ---: |
| First Light | .225 | .507 | +.282 |
| Workshop | .262 | .020 | −.242 (black bug) |
| Roots | .314 | .518 | +.204 |
| Milestones | .239 | .494 | +.255 |
| Old Trail | .438 | .015 | −.423 (black bug) |
| Horizon | .429 | .167 | −.262 |
| Quiet Shore | .313 | .411 | +.098 |
| Last Postcard | .336 | .390 | +.054 |

Before is the retained pre-P1/P3 baseline, not a matched post-rebase control;
differences combine all three tickets. Final art acceptance is pending.
On the same export, disabling photos or only ground photos restores the black
scenes; Standard flat shading alone does not. Flat shading plus selected
triangle photo normals restores them. Visually inspected corrected images:
tmp/gfx-p2/return2-diagnostic/{workshop,old-trail}-selected-normal.png.
These are response-patched diagnostics, not final exported captures.

## Lead integration and remaining work

Zero new lines in index.ts: existing composition owns all hooks. Do not create
a second controller. Existing calls and optional separate bark opt-in:

    dressing.defer(composed.buildGround);
    composed.setQuality(quality);
    composed.dispose();
    trunk.userData.photoSurface = "bark";

A newly authorized build is required for source/export agreement, world 43/43,
load-budget, fresh High eight-zone + Low First Light captures and luma review.
The High/software mount failure remains unresolved; the material normal fix
does not claim to solve it. Do not change P1/P3 or vehicle logic in this ticket.
CPU ABBA, Iris Xe T08 and Lighthouse remain Lead gates. ETC1S normal quality,
distant mip softness, D3D X4000 compiler warnings and concurrent KTX2 loader
warnings remain as documented below. ESLint has zero warnings.

---

# Historical return-1 handoff (superseded by return 2 above)

Status: source, asset packing, lint/typecheck/unit and strict gate PASS.
The one extra build authorized by `GFX-P2-return1.md` has been used (exit 0).
Its world e2e run passed 41/43; two vehicle cases reproduce slow physical High
shading on SwiftShader (one movement assertion, one mount timeout). Dressing
completion now passes. Both failed cases reproduced on an isolated two-worker
retry. The source now selects cheap 512 photo shading on software rasterizers;
hardware Edge and SwiftShader GPU checks pass, as do all 1,786 unit tests.
Another static build needs explicit authorization under the exact-one-build
limit before this last correction can be signed off in world e2e.
This handoff supersedes the previous first-build evidence.

## Implementation

Eight Poly Haven CC0 photo sets: forest_floor, grass_ground,
river_small_rocks, sand_01, rock_face, stony_dirt_path, asphalt_02, pine_bark.
`cc0-sources.json` records source URL, author, source SHA-256, output bytes,
atlas dimensions and actual resolution of every surface. All cached source
checksums were checked by `prepare-cc0.py --cached`; no new download this turn.
Each public KTX2 has one row in `assets/LICENSES.csv`.

Terrain uses semantic forest/trail/river/sand masks. Cliffs and rocks use
triplanar projection; horizontal ground uses two scales and regional colour
variation. Instance transforms are included in world coordinates. Explicit
gradients and a four-texel inset limit wrap seams and neighbouring tile bleed.
Balanced/High use MeshStandardMaterial and photographic normal/roughness;
Low retains the existing cheap toon ramp, dominant photo projection, no normal
perturbation or physical BRDF. The existing instanced ground variant geometry
and colour shader stays intact. No geometry, collider, layout or water changes.

The existing terrain render hook captures the renderer. Photos are gated
behind the existing `data-world-build="done"` marker, after the bounded dressing
queue finishes. Standalone Three scenes without that marker work normally.
Tier switches dispose old GPU textures/materials; stale or failed requests and
late teardown completions dispose partial assets and retain fallback materials.
Streamed meshes are discovered by the existing scene render lifecycle.

## Asset reduction

High now packs four real 2K surfaces (forest floor, river gravel, cliff rock,
bark) and four real 1K surfaces (grass, sand, dirt trail, asphalt) into an
8192×3072 atlas, replacing the old 8192×4096 atlas. Balanced remains 4096×2048
(1K per surface), Low 2048×1024 (512 per surface). Two ETC1S KTX2 files per tier:
sRGB albedo and linear packed OpenGL normal XY/roughness. GPUs below 8192 max
texture size select Balanced for High; below 4096 select Low.
SwiftShader, llvmpipe, softpipe and software rasterizers always use the cheap
512 photo tier, including when overall High is pinned. This capability fallback
does not change the user's scene quality or hardware PBR selection.

| Tier | Previous bytes | Final bytes |
| --- | ---: | ---: |
| Low | 576,881 | 576,881 |
| Balanced | 2,368,916 | 2,368,916 |
| High | 10,191,920 | 6,386,771 |
| All shipped tiers | 13,137,717 | 9,332,568 |

Saved **3,805,149 bytes (29.0%)**; High atlas area reduced 25%.
Simply downsampling and upscaling inside the old fixed cells increased bytes
(to 13,251,640); that intermediate approach was replaced by the packed layout.
Final total `public/world`: **10,043,051 bytes**; start assets: **147,096 bytes**.
Added triangles/draw calls: **0**. One vec4 mask adds 17,424 bytes per 1089-vertex
terrain tile. GPU memory depends on the transcode format; no exact MB claim.

An isolated hardware Edge resolution comparison at roughly 5–15 m uses the
original first-build 2K atlases as control and the final packed atlases as
candidate. Mean absolute RGB difference on a 0–255 scale: grass 2.105,
sand 1.793, trail 6.898, asphalt 3.682. These are measured differences, not
pixel equivalence. The visual comparison retains gameplay surface detail.
Evidence: ignored `tmp/gfx-p2/resolution/` (paired images and comparison.json).

## Files

- `src/features/world/materials/cc0.ts` — shader, tier loading, discovery/disposal.
- `src/features/world/terrain/detail.ts` — existing composition binding and gate.
- `src/features/world/terrain/mesh.ts` — semantic vec4 surface mask only.
- `public/world/tex/{color,surface}-{512,1024,2048}.ktx2` — six files.
- `assets/LICENSES.csv` — required shared CC0 inventory; authorized by GFX common.
- `tools/assets/textures/{blender-client.mjs,prepare-cc0.py,encode-cc0.mjs,
  cc0-sources.json,review-server.mjs,review.html,review.ts,verify-cc0.mjs,
  verify-world.mjs,GFX-P2-handoff.md}`.
- `tests/unit/world/{terrain-textures.test.ts,terrain-textures-loading.test.ts,
  terrain-mesh.test.ts,coast-r1.test.ts,first-light-grove.test.ts}`.
  The final two retain fallback shader checks before photos arrive; assertions
  for the replaced procedural G-01 hook were superseded by photo shader tests.

No scope exception beyond the explicitly required shared license inventory.
No dependency, config, index.ts, docs, e2e or perf test changes. No commit.

## Lead integration

`index.ts`: **zero new lines**. Existing composition owns all three hooks:

```ts
// Existing registration; do not create another photo controller:
dressing.defer(composed.buildGround);
// Existing quality change:
composed.setQuality(quality);
// Existing teardown:
composed.dispose();
```

P3 may opt a separate bark mesh into this controller before scene insertion:

```ts
trunk.userData.photoSurface = "bark";
```

Existing merged leaf/trunk meshes are untouched; instanced logs use the bark
tile already. P1 can supply scene.environment for the physical materials.

## Final validation

- Lint: exit 0, zero warnings (`pnpm.cmd lint --max-warnings=0`).
- Typecheck: exit 0 (`pnpm.cmd typecheck`).
- `pnpm.cmd check:assets`: exit 0, status PASS, worldBytes 10043051.
- `pnpm.cmd check:licenses`: exit 0, RESULT: PASS.
- KTX validation: all six files valid, no validator diagnostics.
- Hardware Edge isolated GPU: Low/Balanced/High PASS after atlas packing.
- `git diff --check`: exit 0.
- `pnpm.cmd test --maxWorkers=4 --testTimeout=60000`: exit 0;
  Test Files 153 passed (153); Tests 1786 passed (1786); Duration 81.30s.
- `bash tools/lead/gate.sh .`: exit 0;
  GATE PASS: lint, typecheck, Tests 1786 passed (1786); unit duration 80.44s.
- The 60-second CLI setting matches the existing strict gate. No test file
  timeout or assertion was relaxed. Earlier one-worker runs under load hit
  two existing 30-second zones-wiring timeouts; final four-worker runs pass.
- Authorized extra WASM/webpack build: exit 0; Compiled successfully in 4.4s;
  22/22 static pages, CV and OG artifacts generated. This build predates only
  the software-renderer material fallback above.
- `E2E_PORT=4196 pnpm.cmd exec playwright test world --workers=2`: 41 passed,
  2 failed (5.8m), exit 1. The two vehicle failures repeated with
  `--last-failed --workers=2`, exit 1. Tests, vehicle logic and timeouts unchanged.
- Final source GPU bench: hardware Edge Low/Balanced/High PASS; SwiftShader
  Low/Balanced/High PASS with cheap photo shading (exit 0 for both).
- Hardware runtime on the authorized build: Low → Balanced → High → Low,
  texture requests and console PASS (exit 0); no photo request on Welcome.
  `tmp/gfx-p2/low/capture.json` records an empty error list and all tier requests.
- `TQA_QUALITY=high node tools/review/ingame-shots.mjs tmp/gfx-p2/final-high
  http://127.0.0.1:4196 vi`: exit 0, eight zones at 1600×900. Low First Light:
  `tmp/gfx-p2/low/ingame-first-light.png`. Images are local ignored evidence.
  These captures predate the software-only fallback; hardware appearance is
  unchanged by that fallback. Luma/hue reports are in `tmp/gfx-p2/`.
- `PERF_PORT=4199 PERF_RUNS=3 pnpm.cmd test:perf`: exit 0, **3 passed (7.3m)**.
  This is the full perf command, including journey and both en/vi load budgets.
  At 10 Mbps / 100 ms RTT with cold caches, playable times (seconds):
  en **5.761 / 5.695 / 5.684**; vi **5.743 / 5.733 / 5.721**.
  Worst **5.761 s**, below the requested 10 s gate (also below the older 6 s
  graphics target). World entry **2,189,201 compressed bytes** each run;
  zero 3D requests on Welcome/Quick. Reports:
  `test-results/load-budget/load-budget-{en,vi}.{json,md}`.
  Hardware journey: PASS, **368.51 s / 1,097.20 m / zero stuck episodes**,
  all eight zones reached; `test-results/journey/journey.{json,md}`.
  Machine: i5-14400F, RTX 3060 D3D11, 32 GB RAM, Balanced power, Edge 157;
  desktop evidence, not an Iris Xe T08 certification. Perf uses the same
  authorized static build as the screenshots and predates the software fallback.
  The gzip server was started explicitly and reused by Playwright, avoiding
  the earlier runner teardown stall; the complete command exited normally.

## Hardware art review

Before = the original Lead baseline captured at :4180; after = this return's
authorized build at :4196. The PBR change intentionally affects all eight zones.

| High zone | Before luma | After luma | Delta |
| --- | ---: | ---: | ---: |
| First Light | .225 | .295 | +.070 |
| Workshop | .262 | .391 | +.129 |
| Roots | .314 | .411 | +.097 |
| Milestones | .239 | .363 | +.124 |
| Old Trail | .438 | .451 | +.013 |
| Horizon | .429 | .447 | +.018 |
| Quiet Shore | .313 | .303 | −.010 |
| Last Postcard | .336 | .292 | −.044 |

Five exceed the generic ±.03 tolerance. This needs direction-C art review;
the change does not claim equivalence to the old painted lighting. Final High
packing changes luma by at most .001 from the prior photo build (.295/.391/
.410/.363/.451/.446/.303/.292 in journey order), while saving 3.8 MB.

## Known limits

CPU ABBA, Iris Xe T08 and Lighthouse remain Lead gates as assigned by GFX-PROD.
ETC1S packed normals trade fine relief for the shared byte budget. Distant atlas
mips may soften boundaries despite inset sampling. The isolated D3D compiler
can report X4000 potential uninitialized photoSample/photoBump warnings; programs link
and render, and runtime console error checks pass. ESLint has zero warnings.
The PBR change intentionally affects every zone; final luma differences need
art review rather than a claim of equivalence to the old painted materials.
