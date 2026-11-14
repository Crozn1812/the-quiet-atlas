# MS-C — walking certificate statue

Replaces the procedural bust with the approved character-C mesh, frozen at Walk 0.18 s from the existing 19-joint rig. The deferred GLB has no skeleton, animation, textures or external imagery. The reference PNG was absent from this workspace; the implementation follows the written brief and existing approved character.

`milestoneCertificates()` remains the only source of inscriptions/status. Every achieved item gets an attached translucent shard and golden perimeter; every planned item gets a matching pentagonal through-hole and a floating shard. Geometry clipping also removes the back of each planned socket. A cached canvas atlas engraves only the existing English inscriptions. All glass, lettering and golden seams share one draw. Three additive ribbons share another draw and the existing High bloom pipeline.

Motion changes one shared shader-time uniform. The existing player root is resolved once from the 19-bone skin (or capsule fallback); horizontal distance <=12 m enables motion. Reduced motion, distance >12 m and Low freeze time. Low hides ribbons and renders the shards opaque with roughness 0.8. Standard materials inherit GFX-P1's environment automatically; no transmission or new post passes.

The real-terrain E point remains `(-4.7, 1.3131703662362746, 4)` in the zone frame. Both collider centers/sizes/yaw are regression-tested against the original values. A small mathematical click sphere on the existing plinth preserves click interaction between the walking pose's ankles, including before the deferred asset loads; finite camera/physics/visibility rays ignore it. No physical collider was added.

## Files

- `src/features/world/zones/milestones.ts` — existing hillside/interaction contract; removes the old bust generator and mounts the new statue.
- `src/features/world/zones/milestones-statue.ts` — deferred static body, glass/engraving atlas, PBR/shader materials, vertex motion, quality/proximity and cleanup.
- `src/features/world/zones/milestones-statue-geometry.ts` — content-driven slots and exact convex clipping for sockets.
- `public/world/milestones/character-milestones-walk.glb` — original project rig baked to a static body.
- `assets/LICENSES.csv` — project-owned bake provenance.
- `tests/unit/world/zones/milestones.test.ts` — hillside, exact collider/E regression, content mapping and resource disposal; the full suite also checks existing click/world wiring.
- `tests/unit/world/zones/milestones-statue.test.ts` — static asset, real through-holes, content count changes, uniform-only motion, Low/reduced/far states and late disposal.
- `tests/unit/world/zones/milestones-dressing.test.ts` — updated batch count after removal of the bust's separate future-stone batch.
- `tools/assets/blender/milestones-bake.mjs` — repeatable bake from character-C geometry and the original Walk clip; no downloads.
- `tools/assets/blender/milestones-budget.mjs` — compare with HEAD, including all deferred dressing instances; cleans its temporary TypeScript file.
- `tools/assets/blender/milestones-review.mjs` — isolated Edge material/geometry viewer.
- `tools/assets/blender/milestones-world-review.mjs` — production screenshots, video and CDP ABBA harness using existing QA hooks.
- This handoff.

No tracked files outside the ticket scope were changed. No dependency, content, character, post, config or index changes; no commit.

## Render/asset budget

| Milestones | Triangles | Color draws | Added asset bytes |
|---|---:|---:|---:|
| Original Low | 3,058 | 6 | 0 |
| Original High (all dressing LOD1) | 4,131 | 6 | 0 |
| MS-C Low | 14,898 | 7 | 265,192 |
| MS-C High (all dressing LOD1) | 16,931 | 8 | 265,192 |
| High delta | **+12,800** | **+2** | **265,192** |
| Ticket limit | +25,000 | +4 | 1,500,000 |

The statue alone is 14,597 triangles / 3 draws on High, including 960 ribbon triangles. Its shipped body is 10,544 triangles; clipped body and generated engravings account for the runtime difference. `forceSinglePass` prevents the transparent double-sided materials from doubling their draws. Canvas texture memory is generated at runtime rather than shipped as an asset. Budget evidence: `test-results/ms-c/budgets.json`.

## Validation — continuation on `e4cd974`, 2026-11-14

```text
pnpm lint: exit 0, 0 errors / 0 warnings
pnpm typecheck: exit 0
VITEST_MAX_WORKERS=2 pnpm test:
  Test Files 172 passed (172)
  Tests      1847 passed (1847)
  Duration   175.16s
pnpm check:assets: PASS; worldBytes=15569274; errors=[]
pnpm check:bundle: RESULT: PASS
```

Commands use `pnpm.cmd` in PowerShell because this machine blocks the `pnpm.ps1` shim. The three gates above all exited 0; lint emitted no warnings. No test/config timeouts were changed.

Exactly one build was run in this continuation, using the required `NEXT_TEST_WASM_DIR=C:\Users\PC-LP\AppData\Local\next-swc\wasm\package` and `NEXT_BUILD_WEBPACK=1`. **Exit 0**, webpack compiled in 3.4 s, static generation **22/22**, CV/OG completed. This is a fresh successful build on the transferred branch; no generated manifest/chunk repair was needed. Log: `test-results/ms-c/build.log`.

Production evidence (Edge, High pinned through the existing menu):

- `test-results/ms-c/world/before/high-{front,back,sockets}.png` and `before/low-front.png`: pre-change export at the identical camera poses.
- `test-results/ms-c/world/high-{front,back,sockets}.png` and `low-front.png`: current export. The rear and oblique shots show true through-holes; Low retains lettering and hides ribbons.
- `test-results/ms-c/world/milestones-animation-10s.webm`: exactly 10.000 s / 3,355,396 bytes of continuous High animation; first/last sampled frames visually verified. The untrimmed recording is `milestones-animation.webm`.
- `test-results/ms-c/world/review.json`: deferred statue request observed, no runtime/console errors, player distance **9.2604 m**.
- `test-results/ms-c/isolated/`: four additional material shots, environment enabled, **3 draws / 14,597 triangles**, no runtime errors.

Playwright's bundled ffmpeg was absent. The already-installed system ffmpeg was copied into the ignored `node_modules/.cache/ms-c-playwright/ffmpeg-1013/ffmpeg-win64.exe` cache and selected with `PLAYWRIGHT_BROWSERS_PATH`; no download or dependency change. The 10 s clip was extracted from seconds 46–56 of the original recording with that same ffmpeg.

CPU ABBA (High, stationary postcard view at Milestones, four independent contexts, 10 s measured after warm-up):

| Sample | Script ms/s | Task ms/s |
|---|---:|---:|
| A1 before | 229.21 | 246.13 |
| B1 current | 233.74 | 250.62 |
| B2 current | 232.38 | 249.79 |
| A2 before | 235.98 | 253.22 |
| Mean B - mean A | **+0.47** | **+0.53** |

**PASS** against +10 ms/s; command `node tools/assets/blender/milestones-world-review.mjs cpu` exited 0. Evidence: `test-results/ms-c/world/cpu-abba.json`. The baseline provenance limitation below applies.

The initial `pnpm exec playwright test world --workers=2` run returned **42 passed / 1 failed**. The vehicle “E while rolling” test timed out at 0.09824084 m against its >0.1 m / 5 s drive assertion at First Light. Screenshots/video were running concurrently during that attempt. Original log and trace are preserved at `test-results/ms-c/e2e-world.log` and `initial-e2e-failure/`.

A second full run with no concurrent recording returned **42 passed / 1 failed (4.4m)**: “E while rolling” passed, but “brake to rest” failed at the identical drive assertion and exact distance. Log/trace: `e2e-world-clean.log` and `clean-e2e-failure/`. The unchanged vehicle subset against the pre-change export subsequently passed **3/3 (51.6s)** (`e2e-baseline-vehicle.log`); that pass alone does not establish the failure's origin. No vehicle source, e2e test, config, deadline or assertion was changed.

The final full run, using the same default config and **no retries**, passed:

```text
pnpm exec playwright test world --workers=2
  43 passed (4.0m)
  exit 0
pnpm lint (after all e2e artifacts finished)
  exit 0, 0 errors / 0 warnings
```

Final log: `test-results/ms-c/e2e-world-final.log`; final lint log: `lint-final.log`. An intermediate lint attempt while Playwright was still writing raw trace resources scanned generated `.js` inside `test-results/e2e-artifacts/.playwright-artifacts-*` and failed on those vendor resources. Playwright removed its temporary trace resources at completion; the final unmodified `pnpm lint` above passed. No lint ignore/config change was made.

## Lead integration

No new hook in `index.ts` is required: the existing zone registry already imports `createMilestonesScene` and forwards its update/dispose contract. The equivalent wiring remains:

```ts
const milestones = createMilestonesScene(context);
scene.add(milestones.group);
// Existing zone update loop; only shader time changes.
milestones.update?.(dt, reducedMotion);
// Existing zone teardown.
milestones.dispose();
```

## Limits

- The figure intentionally retains the approved character's stylized anatomy and plain clothes, including its tote; it is a white porcelain sculpture rather than a newly authored photoreal human.
- Proximity is horizontal player-to-statue distance, with a camera-plane fallback only for isolated reviewers that contain no player.
- Before images and ABBA use the existing 07:01 workspace static export copied before compilation to `node_modules/.cache/ms-c-baseline-out`. It predates FISH-01 (its chunks lack `submerged-fish` / `lower-river`) and was not independently rebuilt from HEAD. Therefore the CPU comparison includes FISH-01 plus MS-C; it is not an isolated MS-C delta against current main.
- The vehicle drive assertion showed intermittent failures in two full runs before the final clean 43/43 pass. Both traces/logs are retained; the failure's origin has not been established or changed in this ticket.
- Full e2e/Lighthouse remain for Lead. Only the requested world subset is run here.
