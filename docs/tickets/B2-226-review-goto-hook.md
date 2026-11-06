## TICKET B2-226: hook QA đưa người chơi tới từng khu (để Lead chụp ảnh trong game)

- Đọc `B2-210-journey-bot.md` (hook `__tqaJourney` chỉ bật khi `window.__tqaJourney === true`).
- Được sửa: `src/features/world/index.ts` (**chỉ** mở rộng object hook `__tqaJourney` đã có), unit test wiring tương ứng, và tạo `tools/review/ingame-shots.mjs`.

### Việc

1. Thêm vào hook (chỉ khi cờ bật): `goTo(zoneId)`: dùng **đúng đường dịch chuyển hiện có** của world (như khi chọn trong bảng "Đi tới…" ở biển chỉ đường: fade, đặt người chơi ở điểm đến của khu, camera như sau teleport), bỏ qua điều kiện "đang đứng ở biển chỉ đường". Trả Promise resolve khi `data-world-teleport` về `idle` và khu đích đã dựng (dùng `ensure` của B2-197). Không cờ → không có hàm.
2. `tools/review/ingame-shots.mjs <outDir> [baseUrl=http://127.0.0.1:4180] [locale=en]`: bật cờ trước khi trang chạy, bỏ intro (`__tqaSkipIntro`), vào world, chờ `data-world-build="done"`, chụp spawn, rồi lần lượt `goTo` 7 khu còn lại, chờ 3 s mỗi khu, chụp `ingame-<zone>.png` (1600 × 900). Thoát mã 1 nếu có `pageerror`.
3. Unit: có cờ → `goTo` tồn tại, gọi tới khu hợp lệ đổi vị trí người chơi; khu không hợp lệ → reject; không cờ → không có; cleanup gỡ hook.

### Điều kiện xong

- `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0. Script: NOT RUN trong sandbox; Lead chạy.
