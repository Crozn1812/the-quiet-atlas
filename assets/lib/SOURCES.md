# GFX-02 source and rights inventory — revision 1

2026-11-13. Continued offline from the existing inputs. Revision executed in this ticket's Blender MCP on 127.0.0.1:9880. No downloads, dependencies, Blender reset, or commit.

`library.blend` contains 14 derived LOD0 objects and packed textures. The revision preserves the approved boulders, fern and fallen log from the existing derived library; their public GLBs are not rewritten by the packager. LOD1 for revised vegetation uses Blender Decimate.

| Source | Use | Rights |
|---|---|---|
| https://polyhaven.com/a/pine_tree_01 | Intact needle sprig cropped from the original diffuse/alpha atlas, recolored forest green; bark on the approved log | CC0-1.0 |
| https://polyhaven.com/a/boulder_01 | Four approved scale/shear variants of one decimated scan | CC0-1.0 |
| https://polyhaven.com/a/fern_02 | Approved decimated fern_02_a and diffuse/alpha | CC0-1.0 |
| tools/assets/blender/lib-build.py | Pine skeleton/card arrangement, broadleaf/bush volumes and overlapping leaves, curved grass, original log geometry | Project-original, dedicated to CC0-1.0 |

Poly Haven license: https://polyhaven.com/license ; CC0 terms: https://creativecommons.org/publicdomain/zero/1.0/ . Source links remain in the manifest and the unchanged license rows.

Rebuild offline:

1. Keep the shipped `assets/lib/library.blend`, `public/world/lib/` and existing `tmp/raw-polyhaven/`. This revision intentionally uses the approved derived library as input to preserve the accepted objects. Raw texture filenames must remain unchanged; the input blend SHA-256 stays in the manifest.
2. Execute `tools/assets/blender/lib-build.py` through `execute_code` on this ticket's Blender instance. `ROOT` points to this worktree. The script uses its own scene and restores the previous scene in `finally`. It writes vegetation exports and an inventory to `tmp/lib-export/`, then saves the packed derived library.
3. With installed `C:/Program Files/KTX-Software/bin` in PATH, run `node tools/assets/blender/lib-package.mjs`. It invokes the existing optimize.mjs (meshopt + KTX2), measures the actual GLBs, refreshes the manifest, and only appends missing license rows.
4. The same command starts a temporary local Vite server on 4193 and captures the final compressed GLBs in installed Edge, then closes the browser/server. It writes `lib-sheet.webp` (1600×1680, original camera/lighting) and `lib-forest.webp` (1600×900, paper ground and warm oblique light). No intermediate Blender render PNGs are required.

Pine cards use a whole sprig, with border-connected neighboring atlas islands removed from alpha before packing. Leaves remain alpha MASK, double-sided. Broadleaf/bush/grass export COLOR_0 with a vertical shading gradient. The group illustration scales ferns to 1.1 m high so their shape remains visible; the shipped fern geometry is unchanged. Sheet tiles normalize each model independently and do not convey relative scale.

This is a styleframe library, with no world integration or Iris Xe benchmark. LOD1 decimation can remove leaf/card surfaces; Lead must choose and check transition distance in the eventual scene. Packed texture resolution is 128px (approved rocks 64px), not the maximum 1K allowance.
