## TICKET B2-222: cụm "lời chào đầu" của First Light phải nằm trong khung nhìn đầu tiên

- Đọc `_finish-common.md`, `B2-220-zone-forest-props.md` (đã merge).
- Được sửa: `src/features/world/zones/first-light.ts` + test. Đọc (không sửa) `src/features/world/index.ts` / `cinematic/intro.ts` / `camera.ts` để biết hướng camera khi người chơi nhận điều khiển.
- Ảnh: `docs/showcase/27-hoan-thien-1/lead-review/spawn-view.webp`: từ góc nhìn spawn **không thấy** ghế khúc gỗ, sổ, cốc, hộp thư của B2-220.

### Việc

1. Tính hướng và vị trí camera thật lúc intro kết thúc (hoặc lúc spawn khi bỏ qua intro) trong test (dùng cùng hàm/hằng của camera/intro). Đặt cụm điểm nhấn ở **6–10 m trước mặt, lệch tâm khung 10–25°** (không che lối), trên terrain thật.
2. Cụm đọc được: chiều cao tổng 0,8–1,6 m, có vật sáng nhất là trang sổ (`paper`) để mắt bắt vào; một vệt nắng (shaft hiện có hoặc cụm sáng) rơi lên đó.
3. Không đặt gì trong 3 m quanh spawn, không chắn lối.

### Test

- Chiếu tâm cụm vào camera spawn (FOV, aspect 16:9): nằm trong khung, cách tâm 10–25°, khoảng cách 6–10 m; không bị thân cây nào che (raycast collider thân cây).
- Test khu cũ pass.
