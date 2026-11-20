# QF-07 return round 1 - smoke correction

Hull, tilt, placement and topology are unchanged from the accepted worktree. No production build, downloads, dependencies or commit in this return round. Lead owns the next `out/` build.

## Changed in this return round

- `src/features/world/scene/shipwreck-smoke.ts`: real alpha blending, depthWrite off, depthTest on, renderOrder 6 after water/surf. Soft radial billboards grow from 6.8 to 27.2 m (2x to 8x the 3.4 m funnel diameter). A shared curved wind centreline and substantial overlap keep the source continuous. Dark grey-brown soot lightens and becomes transparent upward; a restrained sunset rim remains. Low scales per-instance opacity to preserve optical density.
- `tests/unit/world/shipwreck.test.ts`: five tests covering the existing vessel/asset constraints, smoke lifecycle, transparency/depth flags, quality budget and overlapping footprints throughout the cycle on High/Low.
- `tools/assets/blender/shipwreck-review.mjs`: native-resolution ship crops for every view and an extra 1 km offshore camera. Uses existing opt-in QA hooks and local headed Edge on worker A port 4201.
- `tools/assets/blender/shipwreck-handoff.md`: this handoff.

## Other files already present on arrival (retained)

- `src/features/world/scene/shipwreck.ts`
- `src/features/world/index.ts` (four integration lines; no new edits this round)
- `public/world/props/prop-shipwreck.glb`
- `tools/assets/blender/shipwreck-build.mjs`
- `tools/assets/blender/shipwreck-metrics.json`
- `assets/LICENSES.csv`

No files outside the ticket's allowed paths were changed. Screenshots/logs are ignored outputs.

## Accepted budget retained

| Item | Value |
| --- | --- |
| Asset | 86,564 bytes; meshopt + embedded 256x256 KTX2 UASTC |
| Hull | 3,256 triangles; 1 material; 1 draw call |
| Whole landmark | 3 colour-pass draws: hull, instanced foam, instanced smoke |
| Submitted triangles | 3,408 High / 3,328 Low |
| Smoke instances | 64 High / 24 Low; one instanced draw |
| Hull pose | 72 m; 20 degrees; [0, -1.5, -970] |
| Smoke trajectory | 44 m rise above funnel, 24 m wind drift, 6 m lateral drift |

Counts above are object topology counts, not a whole-world GPU frame capture. Enlarging the billboards changes overdraw but does not add geometry or draw calls. The existing Low-only distant landmark projection clamp remains.

## Validation for this return round

PowerShell blocks the pnpm.ps1 shim; commands use pnpm.cmd. Logs: `tmp/shipwreck/*-round1.log`.

- `pnpm.cmd lint`: exit 0, 0 warnings.
- `pnpm.cmd typecheck`: exit 0.
- `pnpm.cmd test tests/unit/world/shipwreck.test.ts`: exit 0; 1 test file passed, 5 tests passed.
- `pnpm.cmd test --maxWorkers=2 --testTimeout=180000`: exit 0, with the summary:

  ```text
  Test Files  211 passed (211)
       Tests  2038 passed | 1 skipped (2039)
    Duration  336.77s (tests 95%, import 4%)
  ```

- `git diff --check`: exit 0.
- `node tools/assets/blender/shipwreck-review.mjs http://127.0.0.1:4201`: exit 0. The owned source dev server was stopped after the capture.

No production build or static e2e was run in this return round, as requested. Existing `out/` is stale; Lead must rebuild it before static verification. The earlier ticket handoff recorded passing static world e2e and licenses, but those are not fresh validation of this return round.

## Visual evidence

`test-results/qf-07/` contains fresh source-dev captures:

- `high-last-postcard.png` and `high-last-postcard-ship-crop.png`
- `high-coastal-road.png` and `high-coastal-road-ship-crop.png`
- `low-last-postcard.png` and `low-last-postcard-ship-crop.png`
- `high-distance-1km.png` and `high-distance-1km-ship-crop.png`
- `review.json`: camera positions, quality, asset HTTP status and console/page errors.

Crops are 300x220 pixels at native scale, without resizing or sharpening. High's existing depth-of-field softens the distant ship and smoke. The renderer still reports pre-existing photo/hill shader X4000 warnings and the existing concurrent KTX2 loader performance warning; these are distinct from lint warnings. The capture script requires zero console/page errors.

Final headed Edge capture: exit 0, asset HTTP 200, `review.json.errors` is empty. Inspected both requested 1600x900 High images and their native-scale crops: the plume reads as a continuous soft column connected to the funnel, leaning and widening downwind, without visible individual particles or rectangular depth silhouettes. Also inspected the extra 1 km offshore full image/crop and the Low crop: smoke remains continuous and softer/fainter at distance.

## Lead wiring (already present; no additional integration)

```ts
import { createShipwreck } from "./scene/shipwreck";
const shipwreck = createShipwreck(gpu); scene.add(shipwreck.group); dressing.defer(shipwreck.build());
shipwreck.update(animDt, reducedMotion, player.position, quality);
shipwreck.dispose();
```

These are beside the corresponding birds import, setup, frame update and teardown. No vehicle code was changed.
