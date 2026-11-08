# U-02 — postcard capture and overlay review

The public zone images are project-original renders from the current in-engine
scene, not illustration substitutes. Eight distinct 960 × 640 WebP files stay
under 60,000 bytes each and load only when the content overlay opens.

## Capture

```powershell
pnpm build
node tools/serve-out/index.mjs out --port 4402
# In another terminal:
node tools/review/zone-content-shots.mjs test-results/u02-postcards http://127.0.0.1:4402 vi
```

Run in a browser-capable review environment with Microsoft Edge installed. The
script enables the explicit `window.__tqaJourney` QA mode before loading the page,
sets High through the menu, waits for deferred world construction, then uses the
`tqa:postcard` camera event. It refuses to export when the hook is unavailable.
The hook is only installed for opted-in QA sessions; normal visitor controls and
camera behavior stay unchanged. Passing `null` as the event detail restores the
normal camera and player visibility.

Each view is composed separately. The script hides all DOM HUD siblings as well
as viewport overlays and hides the player through the review camera hook. It
captures unaltered scene pixels, resizes and compresses them, updates asset
licenses and writes a manifest. No brightness correction or third-party pixels
are used. `TQA_ZONES=workshop,roots` can limit an iteration, but final approval
requires a full eight-zone run and visual inspection of every exported image.

The script also writes desktop and 390 px mobile overlays for First Light,
Workshop, Old Trail and Quiet Shore; it rejects horizontal mobile overflow.
Open all postcard and overlay files to inspect the subject, skyline, HUD removal,
legible content and image loading. The manifest deliberately says `pending`
until a reviewer actually opens the files. Rebuild after capture to include the
new files in the static export, then run world-content/a11y and bundle checks.
