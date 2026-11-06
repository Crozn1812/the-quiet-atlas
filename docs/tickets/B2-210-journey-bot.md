## TICKET B2-210: đo hành trình thật trong trình duyệt (B2 công đoạn 5, spec §7.1)

- Spec §7.1: "5–7 phút đo theo tuyến chính, tốc độ đi bộ chuẩn, không sprint, không dừng đọc, không cinematic, không tìm secret… chỉnh bằng playtest". §7.1: Workshop ≤ 45–60 s từ spawn; Roots và Milestones ≤ 90 s.
- Hiện chỉ có phép tính trên giấy (`layout/timing.ts`: 1 109 m ÷ 3 m/s ≈ 6,16 phút, unit test `layout.test.ts`). Cần **đo thật** với va chạm, dốc, cầu, camera.
- Được sửa:
  - `src/features/world/index.ts`: **chỉ** thêm một hook test chỉ đọc, bật bằng cờ `window.__tqaJourney === true` đặt trước khi trang chạy (giống `__tqaSkipIntro`). Hook gắn `container.__tqaJourney = { position(): {x,y,z}, cameraYaw(): number, zone(): string | null }`. Không có cờ → không gắn gì, không tốn gì. Gỡ trong cleanup.
  - Tạo `tests/perf/journey.perf.ts` và thêm vào `tests/perf/playwright.perf.config.ts` nếu config lọc theo tên file (không đổi ngưỡng hay test khác).
  - Unit test cho hook (có cờ / không cờ / cleanup) trong `tests/unit/world/*wiring*`.
- Đọc `tests/perf/frame-harness.ts` (đã có tuyến phím cố định), `tests/e2e/test.ts` (fixture `__tqaSkipIntro`).

### Bot đi bộ (chỉ dùng input thật của người chơi)

1. Vào world `/en/`, bỏ intro (fixture), đóng gợi ý nếu cần.
2. Mỗi 100 ms: đọc vị trí người chơi và hướng camera qua hook; tính điểm nhìn trước 6 m trên đường (`pathPointAt`, import từ `src/features/world/layout/path` trong test Node là được, hoặc nhúng bảng điểm tuyến). Giữ **W** (đi bộ, **không Shift**); nếu lệch hướng > 8° thì giữ ←/→ (orbit camera) để chỉnh. Không teleport, không sửa vị trí.
3. Ghi: thời điểm tới mỗi khu (khi `zone()` đổi, hoặc khoảng cách tới tâm khu < bán kính), tổng thời gian tới Last Postcard, số lần **kẹt** (vị trí di chuyển < 0,3 m trong 2 s khi đang giữ W), quãng đường thực đi.
4. Timeout 12 phút. Lưu báo cáo JSON + Markdown vào `test-results/journey/`.

### Điều kiện đạt (ghi PASS/FAIL trong báo cáo, test fail nếu không đạt)

- Tổng 5:00–7:00; Workshop 45–60 s; Roots ≤ 90 s; Milestones ≤ 90 s; 0 lần kẹt.
- Sandbox không mở trình duyệt: không chạy được thì ghi NOT RUN; **Lead chạy**.
- `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0.
