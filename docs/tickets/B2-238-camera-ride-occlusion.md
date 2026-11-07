## TICKET B2-238: camera khi đi xe + camera bị che đen gần landmark

- Đọc `_ux-common.md`, spec §6 (camera, T05 không xuống dưới địa hình).
- Được sửa: `src/features/world/camera.ts`; trong `src/features/world/index.ts` **chỉ** `updateCamera` và `cameraObstacles`; vật liệu/landmark bí mật trong `src/features/world/props/secrets*` nếu nguyên nhân ở đó; test camera.
- Công cụ duyệt: build + serve `out/` cổng 4180; `node tools/review/extras-shots.mjs <dir>`.

### Hiện trạng
1. `docs/showcase/29-hoan-thien/hien-trang/secret-reflection-camera.webp`: đứng ở bí mật "reflection" (`__tqaJourney.visitSecret("reflection")`), **nửa phải màn hình là khối đen** (camera chui vào/sát một mesh lớn: landmark vòm dây leo + gương, đá, vách, hoặc địa hình). Tìm object bằng raycast từ camera qua giữa vùng đen; sửa để spring arm kéo camera vào trước vật cản (thêm vào `cameraObstacles` hoặc đặt collider) hoặc làm vật thể mờ khi chen giữa camera và nhân vật (như `fadeCrowns`). Kiểm tra cả 4 bí mật và 8 khu.
2. `ride.webp`: khi đi xe camera xa gấp 1,3 lần lúc đi bộ; xe chỉ còn chấm nhỏ giữa rừng tối. Camera đi xe: gần hơn (xe + người lái cao khoảng 12–18 % khung), hơi thấp, nhìn về phía trước theo hướng chạy (lead nhỏ theo vận tốc), chuyển mượt khi lên/xuống xe. Không chui xuống địa hình (T05).

### Test
- Unit: tại 4 vị trí bí mật + điểm đến 8 khu, tia nhân vật→camera không cắt mesh nào không nằm trong obstacles/fade.
- Unit: khoảng cách camera khi ride < khi walk; chuyển tiếp không nhảy (> X m/frame).
- Test cũ (T05, e2e camera) pass.
