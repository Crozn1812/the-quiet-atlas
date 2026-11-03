# CV and Open Graph artifacts

Tools resolve the repository from their own file location; run from any directory, with the existing dependencies and installed Edge.
No browser download or external request is needed. Page rendering blocks network
requests. `PLAYWRIGHT_CHANNEL` may select another already installed channel.

```powershell
$env:CV_VERSION_DATE = '2026-11-04'
pnpm build
node tools/cv/index.mjs
node tools/og/index.mjs
node tools/cv/verify.mjs
node tools/cv/check-output.mjs
powershell -NoProfile -File tools/cv/preview.ps1
pnpm check:bundle
pnpm check:leaks
```

Set `CV_VERSION_DATE` to the release date; otherwise the shared filename function uses today's UTC
date. Both generators require the static export to exist. A new Next build
must be followed by both generators. Suggested package scripts for Lead:

- `build:cv`: `node tools/cv/index.mjs`
- `build:og`: `node tools/og/index.mjs`
- `build:artifacts`: `pnpm build && pnpm build:cv && pnpm build:og`
- `check:cv`: `node tools/cv/verify.mjs && node tools/cv/check-output.mjs`

The CV tool evaluates only the allowlisted public content modules using the
existing TypeScript compiler. It does not import drafts or export content JSON.
CV output contains selected profile/project fields, unchanged TBD placeholders,
Draft labels for unapproved content, and no TBD phone number. PDF metadata fields
are blanked without changing cross-reference offsets; Title is fixed to `CV`.
The verifier decodes Chromium's embedded ToUnicode maps using Node's built-in
zlib and checks both names, including Vietnamese diacritics. It is deliberately
limited to these Chromium PDFs, rather than a general-purpose PDF reader.

`manifest.json` is retained for verification only. Server-rendered Welcome/Quick links point to `/cv/`, whose HTML contains both PDF download links without JavaScript. Build and CV generation must use the same `CV_VERSION_DATE`; the tool rejects a mismatch against the built HTML.
Do not deploy an export if either generator or a verification command fails.
`preview.ps1` resolves paths from `$PSScriptRoot` and can run from any working directory. It uses the built-in Windows PDF renderer to render every page into
`out/cv/previews/` for visual review, without installing anything. Automated text
extraction does not replace this visual PDF layout review.
