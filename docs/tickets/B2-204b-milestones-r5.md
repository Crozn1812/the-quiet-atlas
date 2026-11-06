## TICKET B2-204b: Milestones vòng 5

- Đọc `_zone-r4-common.md`. File: `src/features/world/zones/milestones.ts` + test. Ảnh: `docs/showcase/26-asset-ky/lead-review/zones-r4-sheet.webp` (ô hàng 2 bên phải).

### Lead thấy

1. Tảng đá chính trông như **con ốc lục giác**: slab dựng đứng có viền lục giác đều, mặt phẳng. Phải là phiến đá tự nhiên: viền không đều (5–9 cạnh lệch), mặt hơi cong/gồ, cạnh vỡ, không đối xứng.
2. Gò đất (`mound`) hiện là **một tấm xanh sáng có mép răng cưa** nổi trên terrain. Phải hoà vào terrain: màu theo terrain xung quanh (cỏ/đất) và mép mờ dần, không viền răng cưa; hoặc bỏ mesh gò và chỉ để đá bám đất.
3. Giữ hiệu năng: không quay lại lấy mẫu `fits` 5 cm (Lead đã đổi 10 cm, xem commit 896ea9e). Dựng khu ≤ 450 ms trên Node.

### Test

- Slab chính: số cạnh viền 5–9 và độ lệch chiều dài cạnh ≥ 20 %; có ≥ 2 mức pháp tuyến trên mặt trước.
- Không có đỉnh mound cao hơn terrain > 0,08 m; màu mound lệch màu terrain cùng điểm ≤ 10 % luma.
- Test cũ pass.
