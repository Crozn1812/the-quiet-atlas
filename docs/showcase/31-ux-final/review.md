# U-02 review — 2026-11-08

Commit: 28d1343 (lane/U-02), based on main 0421ffe.

## Implemented
- Magazine overlay: desktop image/content split, stacked mobile, body >=17px, heading >=32px, clear 44px links.
- Eight project-original 960x640 High in-engine postcards, each <=60,000 bytes. No DOM HUD or player avatar. Reframed workshop, First Light and Milestones after opening rejected intermediate shots.
- Sticky 16px Close control remains available at bottom of long mobile content, real click tested.
- Explicit journey-only review camera event tqa:postcard; null resets pose/player. No imports from world in content renderer.

## Actual checks
- pnpm.cmd build: PASS (includes TypeScript).
- pnpm.cmd check:bundle: PASS; Welcome JS gzip135.0KB, Quick132.5KB; initial Welcome transfer183.3KB; no initial world chunks.
- pnpm.cmd check:licenses: PASS35 public files.
- Targeted eslint changed TS/TSX/test/capture script --max-warnings=0: PASS.
- pnpm.cmd exec vitest run tests/unit/portfolio/zone-content.test.tsx --maxWorkers=2: PASS53/53.
- E2E_PORT=4402 pnpm.cmd exec playwright test tests/e2e/world-content.spec.ts --workers=1: PASS4/4,42.8s. Covers E/close/escape, content, paused state, focus and menu exclusion. Executed before final Close-only CSS polish; final integration suite still required.
- zone-content-shots.mjs final capture: PASSall8 High; four representative mobile overlays axe audit 0critical/serious; 390px horizontal overflow check and real Close click PASS.
- Opened all8 postcards individually; opened desktop/mobile four representative overlays and final contact sheets. Mobile bottom screenshots verify persistent Close.
- git diff --check: PASS.

## Evidence
- postcards-contact.webp: all8.
- overlays-desktop-contact.webp and overlays-mobile-contact.webp: FirstLight,Workshop,OldTrail,QuietShore.
- overlay-*-mobile-end.png: sticky Close at bottom of each long overlay.
- zone-renders.json: capture metadata (pending means generated script does not self-approve visual quality).

Full e2e/Lighthouse/load-budget: NOT RUN here; parent final integration QA owns these. Rebuild after cherry-pick to package final public image bytes.
