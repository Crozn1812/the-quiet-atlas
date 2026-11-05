## TICKET B2-197: dựng các khu xa sau khung hình đầu (thời gian vào chơi 6,18 s → ≤ 6 s)

- Được sửa: `src/features/world/index.ts` (**chỉ** chỗ gọi `placeZoneScenes` trong mount và phần dọn dẹp tương ứng), `src/features/world/zones/index.ts` (thêm API dựng theo nhóm/deferred), test `tests/unit/world/*wiring*`, `zones*.test.ts`.
- Đọc `B2-179-load-defer.md` (cùng cách làm: dựng theo mẩu ≤ 8 ms sau khi người chơi điều khiển được).

### Số đo của Lead (2026-11-06, desktop tham khảo, `tests/perf/playwright.perf.config.ts`)

- Time to playable xấu nhất: **6,18 s** (trần spec 10 s PASS; mục tiêu nội bộ ≤ 6 s **chưa đạt**). Đã sửa Milestones 1,47 s → 0,42 s.
- Dựng khu trên Node: first-light 175 ms, roots 150, milestones 420, old-trail 83, quiet-shore 56, horizon 36, last-postcard 33, workshop 24.

### Việc

1. Khi mount: dựng ngay các khu **gần spawn** cần cho khung hình đầu và cho đoạn đi đầu (first-light, workshop, roots). Các khu còn lại (milestones, old-trail, horizon, quiet-shore, last-postcard) dựng sau khung hình đầu theo mẩu (mỗi khu một mẩu, hoặc chia nhỏ hơn nếu > 8 ms).
2. **Collider** của khu dời phải có trước khi người chơi tới gần (khoảng cách đường đi từ spawn tới milestones ≈ 0,235 × chiều dài đường > 200 m). Interactable/zone-enter của khu dời phải đăng ký khi khu dựng xong; teleport tới khu chưa dựng phải chờ khu đó dựng xong (hoặc dựng ngay lập tức khi teleport).
3. Unmount giữa chừng: huỷ mẩu chờ, không rò.
4. Kết quả cuối giống hệt dựng một lần.

### Test

- Unit: sau mount chỉ có 3 khu gần; chạy hết mẩu → đủ 8 khu, collider/interactable như cũ; teleport tới khu xa trước khi dựng xong vẫn hoạt động; unmount giữa chừng không còn timer.
- Perf: NOT RUN trong sandbox; Lead đo.
