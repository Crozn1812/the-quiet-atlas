## Quy tắc chung cho mọi ticket B2 (đợt 15+)

- Không được sửa: mọi thứ ngoài "Được sửa" của ticket; đặc biệt `src/features/world/index.ts` (Lead tích hợp), `package.json`, lockfile, config, `docs/`, `tests/e2e/`, `tests/perf/`.
- Không thêm dependency; không tải file ngoài; không lưu trạng thái vào localStorage/sessionStorage/cookie/URL; không import `features/world` từ `src/app` hay `src/components`.
- Tham chiếu art chỉ là cảm hứng (`docs/art-bible/taste.md`); không logo/thương hiệu.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0 — dán dòng tổng kết. Không chạy e2e/Lighthouse (sandbox không mở trình duyệt). **Không commit** (Lead commit).
- Bàn giao: danh sách file, output lệnh, giới hạn đã biết, cách Lead nối vào `index.ts` (đoạn code mẫu ≤ 15 dòng).
