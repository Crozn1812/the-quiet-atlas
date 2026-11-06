## TICKET B2-219: mặt nước có gợn và bọt mép (hết tấm phẳng)

- Đọc `_finish-common.md`, `B2-181c-water-reflection.md`.
- Được sửa: `src/features/world/water/material.ts`, test nước.

### Vấn đề (ảnh `docs/showcase/27-hoan-thien-1/03-doi-co.webp`, `04-duong-ven-bien.webp`)

- Suối ở đồi là **một mảng xanh đậm phẳng**, không thấy dòng chảy. Biển ven bờ không có bọt.

### Việc

1. Suối: gợn sóng thủ tục chạy theo hướng dòng (`vWaterUv` dọc suối): vệt sáng mảnh kéo dài theo dòng, mật độ cao hơn ở chỗ hẹp/nông; chuyển động chậm, tắt khi reducedMotion.
2. Mép suối/mép biển: dải bọt trắng ngà mỏng 0,2–0,6 m, đứt quãng theo noise (dùng khoảng cách mép đã có).
3. Phản chiếu trời (B2-181c) giữ nguyên; độ sáng trung bình không đổi quá 10 %.
4. Không texture, không thêm pass.

### Test

- CPU: độ lệch chuẩn luma mặt suối trong cửa sổ 4 × 4 m ≥ 0,02; trung bình đổi ≤ 10 %.
- Bọt: chỉ trong 0,6 m từ mép; tỉ lệ phủ dải mép 30–70 %.
- Test nước cũ pass (vệt sáng ≤ 40 m vẫn đạt).
