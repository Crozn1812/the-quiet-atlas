## Quy tắc chung cho mọi ticket B2 (đợt 15+)

- Không được sửa: mọi thứ ngoài "Được sửa" của ticket; mặc định không sửa `src/features/world/index.ts`, `package.json`, lockfile, config, `docs/`, `tests/e2e/`, `tests/perf/`. **Nếu ticket ghi rõ một file trong số này ở mục "Được sửa" thì được sửa file đó** (từ 2026-11-08).
- Không thêm dependency; không tải file ngoài; không lưu trạng thái vào localStorage/sessionStorage/cookie/URL; không import `features/world` từ `src/app` hay `src/components`.
- Tham chiếu art chỉ là cảm hứng (`docs/art-bible/taste.md`); không logo/thương hiệu.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0 — dán dòng tổng kết. **Được và nên** mở Edge local để tự kiểm tra hình (`pnpm build`, `node tools/serve-out/index.mjs out --port <cổng>`, `tools/review/*.mjs`) và chạy e2e liên quan khi ticket yêu cầu (`pnpm exec playwright test <spec>`). Lighthouse/full e2e để Lead. **Không commit** (Lead commit).
- Bàn giao: danh sách file, output lệnh, giới hạn đã biết, cách Lead nối vào `index.ts` (đoạn code mẫu ≤ 15 dòng).
- **Build từ 2026-11-12** (Windows Application Control chặn SWC native): `NEXT_TEST_WASM_DIR="C:\Users\PC-LP\AppData\Local\next-swc\wasm\package" NEXT_BUILD_WEBPACK=1 pnpm build`. Chỉ build **một lần** khi đã xong code, để không làm nghẽn máy (nhiều worker chạy song song).
- **Không dừng lại hỏi vì lệch phạm vi nhỏ** (đường dẫn trong ticket ghi sai nhưng rõ là cùng một tính năng, hoặc cần chạm 1–2 file sát bên): cứ làm, ghi rõ trong bàn giao file nào ngoài phạm vi và vì sao. Chỉ dừng nếu phải đổi `package.json`/lockfile, `docs/adr/`, hạ tầng, hoặc đụng tính năng của ticket khác.
