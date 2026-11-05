## TICKET B2-179: kéo thời gian vào chơi về ≤ 6 s (dựng phần phụ sau khung hình đầu)

- Được sửa:
  - `src/features/world/index.ts`: **chỉ** phần mount (khối `try` dựng zones, dressing, forest sun, far landscape, composition) và phần dọn dẹp tương ứng;
  - `src/features/world/dressing.ts`;
  - `src/features/world/scene/far-landscape.ts`;
  - test liên quan (`tests/unit/world/*wiring*.test.ts`, `dressing.test.ts`, `far-landscape.test.ts`).
- Đọc `_dirA-common.md`.

### Số đo của Lead (2026-11-05, máy dev, `tests/perf/playwright.perf.config.ts`)

- Time to playable xấu nhất: **8,35 s** (trước đợt 25 là 4,96 s). Ngưỡng 10 s **không được nâng**.
- 3D bytes: 1,96 MB, vẫn rất xa trần 8 MB. Vậy thời gian tăng là do **CPU lúc dựng**, không phải do tải.
- Phần dựng mới trong đợt 25:
  - far landscape (~170 ms trên Node);
  - dressing: 845 viên cuội, đường, 2 cầu;
  - foliage nặng hơn (tán khối, tầng dưới rừng);
  - forest sun shafts.

### Việc

1. **Đo trước:** thêm mốc `performance.mark` quanh từng bước dựng trong mount và ghi kết quả vào bàn giao. Không để mốc đo trong bản build nếu tốn chi phí.
2. **Dời phần không cần cho khung hình đầu sang sau khi người chơi điều khiển được.**
   - Dựng theo từng mẩu nhỏ, mỗi mẩu ≤ 8 ms, bằng `requestIdleCallback` hoặc `setTimeout` lồng nhau. Không chặn frame quá 16 ms.
   - Các phần được dời:
     - far landscape (dựng theo dải hàng);
     - đá cuội và bãi cát của shore;
     - forest sun shafts;
     - dây điện.
   - **Collider của tảng đá lớn, cột, cầu** phải có trước khi người chơi đi tới đó. Cách được chấp nhận: dựng collider ngay, chỉ dời phần hình; hoặc dời cả hai nhưng xong trước khi người chơi tới (khoảng cách tới đoạn biển > 600 m từ spawn).
3. Dọn dẹp khi rời world giữa chừng phải huỷ các mẩu dựng còn chờ. Không rò listener, timer hay GPU resource; theo đúng kiểu test unmount hiện có.
4. **Không đổi hình ảnh cuối cùng:** khi dựng xong, scene giống hệt cách dựng một lần.

### Test

- Unit:
  - unmount khi đang dựng dở không để timer chờ và không rò;
  - sau khi chạy hết các mẩu, scene có đủ group như trước;
  - collider của dressing có ngay sau mount.
- Chạy `pnpm exec playwright test -c tests/perf/playwright.perf.config.ts` nếu sandbox cho phép. Không cho phép thì ghi NOT RUN; Lead sẽ đo.
