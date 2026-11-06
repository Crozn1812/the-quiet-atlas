## TICKET B2-217: kéo thời gian vào chơi về ≤ 6 s sau đợt 27

- Đọc `B2-179-load-defer.md`, `B2-197-defer-far-zones.md`, `_finish-common.md`.
- Được sửa: `src/features/world/scene/compose.ts` (dựng ban đầu), `src/features/world/foliage/ground.ts` (nếu cần API dựng theo mẩu), `src/features/world/index.ts` (**chỉ** chỗ gọi composition và lịch dựng sau khung hình đầu), test liên quan.

### Số đo của Lead (2026-11-06, desktop tham khảo, `load-budget.perf.ts`, worst of 3)

- Trước đợt 27: **5,90 s**. Sau B2-212…216 + đồng cỏ: **6,05–6,13 s** (3 lần đo). Trần spec 10 s PASS; mục tiêu nội bộ ≤ 6 s **chưa đạt**.
- Dev, mount: zones 476 ms, dressing 143 ms, **composition 816 ms** (trước 720 ms). Tạo đồng cỏ 0,5 ms, waymarks 0,4 ms (Node) → phần tăng chủ yếu là **biên dịch shader** khung đầu (lá B2-213, terrain B2-215, prop B2-216) và dựng composition.

### Việc

1. Dời phần **lớp phủ nền** (ground details: cỏ túm, dương xỉ, hoa, lá khô) của các tile ngoài bán kính 25 m quanh spawn sang mẩu idle ≤ 8 ms sau khi người chơi điều khiển được; collider không đổi.
2. Biên dịch trước shader các material chưa xuất hiện ở khung đầu bằng `renderer.compileAsync` **sau** khung đầu (không chặn), để lần đầu thấy chúng không giật.
3. Hình ảnh cuối giống dựng một lần (parity test).

### Test

- Unit: sau mount chỉ có ground details quanh spawn; chạy hết mẩu → đủ như cũ; unmount giữa chừng không rò.
- Perf: NOT RUN trong sandbox; Lead đo, mục tiêu worst ≤ 6,0 s.
