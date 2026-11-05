# Asset pipeline (B2-020)

Run from the repository root with the existing devDependencies installed. No download or new package is needed. Blender and KTX-Software are external authoring tools; see `docs/runbook/asset-tools.md`. The generated model is project-original, inspired only by the art direction, with no third-party pixels or branding.

## 1. Generate a pine (Lead runs Blender)

Create an intermediate directory outside the published world directory, for example `tmp/assets`, then:

```sh
blender -b --factory-startup -P tools/assets/blender/pine.py -- tmp/assets/tree-pine.glb
```

The script clears the startup scene, builds a flat-shaded six-sided trunk and three slightly offset seven-sided cones, and exports a Y-up GLB with two rough, nonmetallic materials. Hex values are copied from `src/features/world/art/palette.ts` and converted from sRGB to linear for export. No camera, light, animation, or texture is exported. Blender execution and visual review are Lead responsibilities.

## 2. Optimize

Create `public/world/start` first, then run:

```sh
node tools/assets/optimize.mjs tmp/assets/tree-pine.glb public/world/start/tree-pine.glb --texture=etc1s
node tools/assets/optimize.mjs tmp/assets/tree-pine.glb public/world/start/tree-pine.glb --texture=uastc --ratio=0.75
node tools/assets/optimize.mjs tmp/assets/tree-pine.glb public/world/start/tree-pine.glb --texture=none
```

The geometry pipeline is dedup → prune → weld → optional simplify → texture conversion → prune → dedup → meshopt. `--ratio` must be in `(0, 1]`; simplification uses error tolerance 0.001, so the requested ratio is a target, not a guarantee. Meshopt encoding can make very small inputs larger due to extension overhead. Input and output must be different `.glb` paths; the destination parent must exist.

Texture mode defaults to ETC1S. The installed functions API's `textureCompress` does not produce KTX2, so this tool calls `toktx` directly with mipmaps and registers `KHR_texture_basisu`. UASTC additionally uses Zstandard level 18. PNG/JPEG color textures use sRGB and data textures use linear transfer as inferred from material slots. Author color and data maps as separate textures; mixed-use textures need author review. Existing KTX2 textures are preserved. Missing `toktx` in PATH skips conversion with a stderr warning and succeeds. Other tool failures and unsupported image types fail explicitly; there is no silent quality downgrade. Texture compression with a real KTX-Software installation requires Lead validation.

Stdout contains one JSON object with post-transform `triangles`, `materials`, `textures`, and actual file `bytesBefore` / `bytesAfter`. Diagnostics go to stderr. Triangle counts cover indexed and non-indexed triangle lists, strips, and fans, counted once per stored mesh, excluding lines/points. Repeated scene instances do not increase stored asset triangles.

## 3. Check budgets

```sh
node tools/assets/check-budgets.mjs
node tools/assets/check-budgets.mjs public/world
```

The recursive checker requires `<type>-<name>.glb` (for example `tree-pine.glb`); types are tree, rock, prop, character, vehicle. Names contain letters/digits separated by hyphens, case insensitive. It decodes meshopt before counting triangles. Invalid names, unreadable GLBs, symlinks, and exceeded limits produce `FAIL` and exit 1. Empty/missing directories produce `PASS`, exit 0, and an explanatory note. Other filesystem errors fail rather than being treated as empty.

`budgets.json` contains initial per-type ceilings for Perf Watcher to tune after measurement. Units are decimal: KB = 1,000 bytes, MB = 1,000,000 bytes. The world ceiling is 30 MB; the subtree `start/**` is limited to 8 MB. Aggregate totals include **all regular files**, including textures/audio, so standalone payloads cannot bypass the gate. The start subtree is relative to the directory passed; pass the world root to check both ceilings. Equality passes. This is an on-disk asset check; measure actual network/startup traffic separately.

## 4. License and integration handoff

Do not commit generated `.glb` files. Before publishing an asset, Lead must register its final public path in `assets/LICENSES.csv`, preserving that file's existing schema. For this pine record project-original source `tools/assets/blender/pine.py`, project ownership, permitted modifications/web/repo distribution, no third-party attribution, two materials, no texture, and the final LOD/collider decision. This ticket does not edit the license ledger because it is outside its allowed scope.

In `src/features/world/index.ts`, inside the existing world mount after scene creation, Lead can load the generated model using the example below. Host the Three Basis transcoder locally and set its actual directory; do not fetch it from a CDN. Keep loading after Enter World, report load errors through the existing world flow, and include model geometries/materials/textures and the KTX2 loader in unmount cleanup. Decide instancing, placement, collision, and LOD after visual/performance review.

```ts
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
const ktx2 = new KTX2Loader().setTranscoderPath('/world/basis/');
ktx2.detectSupport(renderer);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
const pine = await loader.loadAsync('/world/start/tree-pine.glb');
scene.add(pine.scene);
```

For this untextured pine KTX2 support is optional. No integration code is applied by this ticket. Required repository checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Focused Node fixtures: `pnpm test -- tests/unit/tools/assets.test.ts`; all GLB fixtures are generated in OS temporary directories and removed after tests. No Blender, browser, e2e, or Lighthouse run is needed here.

## Character rig

Lead runs Blender **5.x** from the repository root (Blender is not run in the Codex sandbox):

```sh
blender -b --factory-startup -P tools/assets/blender/character_rig.py -- tmp/assets
```

The argument after `--` is an output **directory**, matching `character.py`. The result is `tmp/assets/character-duy-rig.glb`. The script calls the approved D-23 `build_character()` directly: no replacement geometry, changed proportions, textures, or new colors. It retains the source's 1.72 m normalization and flat normals. Original linear base colors become corner vertex colors (`COLOR_0`) under one rough, nonmetallic material, giving **one skinned mesh / one primitive** (within the four-mesh limit). A replacement world shader must consume vertex colors to retain the approved palette.

The armature has **19 bones**: hips, spine, chest, neck, head; shoulder, upper arm, forearm and hand on each side; thigh, shin and foot on each side. Region weights are normalized with at most two influences per vertex. The complete tote, including both handles, follows `shoulder.L`; glasses and head details follow `head`. No automatic-weight operator, external asset, IK constraint, camera, or light is needed in the exported file.

| Action | Duration at 30 fps | Motion |
|---|---|---|
| `Idle` | 4 s (frames 1–121) | Subtle breathing through spine, chest and neck |
| `Walk` | 1 s (frames 1–31) | Approximately 0.70 m per step, two steps per cycle |
| `Run` | 0.7 s (frames 1–22) | Slow jog, restrained arm swing and 0.10 m foot clearance |

Clips have an identical first/last pose and linear, per-frame samples. The leg solver keeps shoes level during stance; the swing path meets stance with continuous velocity. The armature stays at the origin with no horizontal root motion. Walk/Run use a constant lowered pelvis for knee flexion, without periodic vertical bounce. Walk's nominal travel speed is about 1.4 m/s; the runtime supplies movement separately and can scale clip speed to match its controller. The GLB exports separate NLA tracks named `Idle`, `Walk`, `Run` and includes a 19-joint skin, Y-up coordinates, and no leaf bones.

The script checks the exported GLB for all three clip names/durations, skin attributes, vertex colors, mesh/primitive limits, and unchanged triangle count. Expected geometry is the approved **6,884 triangles**, below **12,000**. Final size is expected to fit **600,000 bytes (600 KB) after meshopt**, but has not been measured in the sandbox; the script reports raw bytes without applying that compressed-size gate prematurely. Optimize without simplification to preserve D-23:

```sh
mkdir tmp/assets-rig-optimized
node tools/assets/optimize.mjs tmp/assets/character-duy-rig.glb tmp/assets-rig-optimized/character-duy-rig.glb --texture=none
node tools/assets/check-budgets.mjs tmp/assets-rig-optimized
```

Keep optimized output in its own directory: the budget checker recursively checks a directory and would otherwise include the larger raw GLB. Lead must visually review all clips in Blender and the optimized GLB: ground contact, knees/elbows, tote/arm clearance, glasses attachment, seams at the cycle boundary, palette, and framing. Region skinning does not simulate cloth or bag physics. Blender execution, final compressed bytes, and playback remain **unverified** until Lead runs them. Register the final path in `assets/LICENSES.csv` before publication, as in the asset handoff above; do not commit generated GLBs for this ticket.

Lead can connect the final asset inside the existing `src/features/world/index.ts` world mount (no integration is applied by this ticket):

```ts
const { AnimationMixer } = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const character = await loader.loadAsync('/world/start/character-duy-rig.glb');
scene.add(character.scene);
const mixer = new AnimationMixer(character.scene);
const actions = Object.fromEntries(character.animations.map(c => [c.name, mixer.clipAction(c)]));
actions.Idle.play(); // crossFadeTo(actions.Walk / actions.Run) from controller state
// Existing frame loop: mixer.update(deltaSeconds).
// Unmount: mixer.stopAllAction(); mixer.uncacheRoot(character.scene);
// Remove character.scene and dispose its geometries/materials in existing cleanup.
```

Run static checks with `pnpm test -- tests/unit/tools/character-rig.test.ts`, then `pnpm lint`, `pnpm typecheck`, and `pnpm test`. These checks do not execute Blender or a browser.
