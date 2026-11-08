## TICKET FL-02: nguồn suối từ vách đá (trên nhánh First Light R1) + CPU

- Duy (2026-11-08): **giữ hướng R1** (`docs/showcase/32-first-light-prototype/`). Ticket này làm tiếp trên worktree `D:/tqa-worktrees/FirstLight-R1` (nhánh `lane/FirstLight-R1`); sau khi đạt, Lead merge R1 + FL-02 vào main.
- Đọc: `_graphics-common.md`, `_review-common.md` (cổng 4415), README mẫu R1 (mục CPU).
- Được sửa: những gì R1 đã chạm + `src/features/world/terrain/*` (địa hình quanh nguồn), `src/features/world/water/ribbon.ts` (chỉ đoạn nguồn `t < 0.03`), `tools/assets/blender/` (đá nguồn nếu cần), `public/world/props/`, `assets/LICENSES.csv`, test.

### Việc

1. **Nguồn suối có lý do:** hiện suối "chảy ra từ không đâu" ở đầu dòng. Dựng một **vách/mỏm đá** (cùng ngôn ngữ khối mặt phẳng của R1, đá xám ấm có rêu) cao 4–8 m ở đầu suối; nước chảy ra từ khe/hốc dưới chân vách thành vũng nhỏ rồi thành suối (có thể thêm vài tảng đá rải và một dải thác nhỏ 1–2 m). Nhìn được rõ từ camera chơi ở spawn và trong intro (đoạn cuối hạ xuống nguồn). Không chặn lối đi, có collider.
2. **CPU:** R1 đang +10,33 ms/s TaskDuration ở Workshop (3 cặp), chưa PASS. Tìm phần tốn (ví dụ cập nhật mỗi khung của grove/fog vùng 48 m, kiểm tra khoảng cách mỗi khung) và giảm để mỗi khu ≤ main + 10 ms/s theo `cpu-compare.mjs` (2 cặp, máy rảnh).

### Nghiệm thu

- Ảnh: spawn gameplay (Balanced + High), góc mắt nhìn về nguồn, intro 10/15 s; 7 khu khác luma ±0,03.
- `assets-loaded.mjs`, gate, `pnpm test:perf load-budget` (≤ 6 s), `cpu-compare` bảng 2 cặp.
