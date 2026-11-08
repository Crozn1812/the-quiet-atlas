## Quy tắc chung cho mọi ticket B2 (đợt 15+)

- Không được sửa: mọi thứ ngoài "Được sửa" của ticket; mặc định không sửa `src/features/world/index.ts`, `package.json`, lockfile, config, `docs/`, `tests/e2e/`, `tests/perf/`. **Nếu ticket ghi rõ một file trong số này ở mục "Được sửa" thì được sửa file đó** (từ 2026-11-08).
- Không thêm dependency; không tải file ngoài; không lưu trạng thái vào localStorage/sessionStorage/cookie/URL; không import `features/world` từ `src/app` hay `src/components`.
- Tham chiếu art chỉ là cảm hứng (`docs/art-bible/taste.md`); không logo/thương hiệu.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0 — dán dòng tổng kết. **Được và nên** mở Edge local để tự kiểm tra hình (`pnpm build`, `node tools/serve-out/index.mjs out --port <cổng>`, `tools/review/*.mjs`) và chạy e2e liên quan khi ticket yêu cầu (`pnpm exec playwright test <spec>`). Lighthouse/full e2e để Lead. **Không commit** (Lead commit).
- Bàn giao: danh sách file, output lệnh, giới hạn đã biết, cách Lead nối vào `index.ts` (đoạn code mẫu ≤ 15 dòng).
