## GFX-02 — Lead trả lại vòng 1 (ảnh: `docs/showcase/37-aaa/lib-sheet.webp` trong worktree)

Đạt, giữ nguyên: đá 1–4, dương xỉ, khúc gỗ đổ, số liệu, LICENSES, manifest, pipeline `lib-build.py` / `lib-package.mjs`.

Sửa 3 điểm:
1. **Thông (pine-a/b/c):** đang là thân đen + chùm vụn nâu đen thưa, đọc như cây chết. Yêu cầu: tán **dày, kín**, hình nón nhiều tầng; lá xanh thẫm có ánh xanh lục (không nâu đen); thân nâu ấm. Dùng lại texture lá gốc Poly Haven `pine_tree_01` làm **thẻ lá alpha-cutout** cỡ lớn (mỗi tầng cành 1 thẻ), không cắt thành mảnh vụn. LOD0 ≤ 8 000 tam giác, LOD1 ≤ 2 000.
2. **Lá rộng (broadleaf-1/2/3, bush):** màu bạc hà nhạt, lá rời như giấy. Yêu cầu: tán **thành khối** (nhiều lá chồng nhau), xanh lục ấm theo `docs/art-bible/taste.md` / `src/features/world/art/` palette, có sáng–tối trong tán (vertex color hoặc AO bake). Thân nhạt quá: chuyển nâu xám.
3. **Cỏ:** lá quá cao, thẳng, màu nhạt. Ngắn lại (0,3–0,6 m), nhiều lá hơn, cong nhẹ, xanh đậm dần ở gốc.

Chụp lại contact sheet cùng góc + một ảnh nhóm (3 thông + 3 lá rộng + đá + dương xỉ đứng chung, nền giấy, ánh sáng bình minh nghiêng) để Duy thấy cảm giác khu rừng. Chạy lại check:licenses, check:assets, lint, typecheck, test. Không commit.
