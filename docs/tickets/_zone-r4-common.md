## Đợt 26 vòng 4 các khu: làm kỹ (B2 công đoạn 2)

- Đọc: `_dirA-common.md`, `_asset-common.md`, brief của khu trong `B2-10x-zone-briefs.md` (giữ ý tưởng, interactable, nhãn), `_zone-common.md`.
- Được sửa: **chỉ** file khu `src/features/world/zones/<id>.ts` và test của khu `tests/unit/world/zone-<id>*.test.ts` (hoặc tên test tương ứng hiện có).
- **Dùng bộ asset chung** đã merge, không tự vẽ lại:
  - đá: `props/rocks.ts` (`createRockGeometry`, `createRockStack`);
  - gỗ: `props/wood.ts` (`createLogGeometry`, `createStumpGeometry`, `createPlankGeometry`, `createPostGeometry`, `createFenceSpanGeometry`, `createBenchGeometry`).
- Không sửa kit; cần thêm hàm cho kit thì ghi trong bàn giao.

### Mục tiêu chung

1. **Đọc được chất liệu ở 5–15 m**: hết khối hộp/trụ trơn, hết đĩa lục giác phẳng, mọi vật có vát mép và biến màu vertex color.
2. **Bám đất:** chân vật lún 3–10 cm vào terrain, có rêu/cỏ/đá dăm quanh chân (2–6 vật nhỏ), không lơ lửng, không bóng đen đặc dưới đáy.
3. **Kể chuyện nhỏ** đúng brief (1–2 chi tiết đời thường: cốc, sổ, dây phơi, dụng cụ), không chữ, không logo.
4. Giữ vị trí, bán kính, interactable, collider (box) và các export hiện có; test interactable cũ phải pass.
5. Ngân sách: ≤ 2 000 tam giác mỗi cụm prop, tổng khu không quá bản cũ × 1,5; ≤ 4 draw call mới (gộp batch vertex color).

### Test

- Tam giác, draw call, collider không đổi vị trí (±0,1 m).
- Không vật nào có đáy cao hơn terrain > 0,05 m tại tâm chân (lấy mẫu `heightAt`).
- Màu thuộc PALETTE; tất định; fingerprint đổi thì cập nhật và ghi lý do.

### Bổ sung trước khi giao (Lead)

- Cây thông trong khu: dùng `createPineCrownV2(seed)` từ `foliage/pine.ts` (B2-191), không dùng `createPineCrown` cũ.
- Cây lá rộng đã là v3 (B2-182), tán có ánh sáng xuyên lá (B2-183). Không vẽ lại cây trong khu.
- Dương xỉ: `createFern` có thể đang đổi bởi B2-185b; đừng phụ thuộc số tam giác của nó trong test khu (đo tổng khu, không khóa cứng phần dương xỉ).
