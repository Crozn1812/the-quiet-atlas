## Đợt 28: UX/UI hoàn thiện (mục tiêu 90–100 % trước khi Duy chấm)

- Spec V6 §3.1 (Welcome), §5 (overlay tạp chí), §6.3–6.4 (menu, HUD), taste §5.4–5.5 (UI im lặng, kiểu tạp chí, ít chữ, chuyển động chậm, không nảy), art bible `docs/art-bible/` (palette, font Noto Serif tự host).
- Ảnh hiện trạng: `docs/showcase/28-ux/hien-trang/` (welcome, menu, journal, chooser, overlay-first-light, quick).
- Ràng buộc A (không được làm đỏ): Welcome initial transfer ≤ 1 MB, JS gzip ≤ 150 KB (hiện 140,8 KB), 0 chunk 3D trước Enter World, Lighthouse/axe 0 critical/serious, toàn bộ thao tác bằng bàn phím, focus trap trong dialog, `prefers-reduced-motion`.
- Không thêm dependency, không font mới (dùng Noto Serif đã có + system sans nếu cần). Chỉ màu từ palette (`--` CSS vars hiện có hoặc thêm vars ánh xạ từ `art/palette.ts` hex).
- Điều kiện xong: `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0; **chạy e2e liên quan nếu sandbox cho phép**, không thì NOT RUN (Lead chạy full e2e + chụp ảnh).
