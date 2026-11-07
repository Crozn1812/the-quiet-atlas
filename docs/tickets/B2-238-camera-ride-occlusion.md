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

### Trả lại vòng 1 (Lead)

Hình ảnh **đạt** (`docs/showcase/29-hoan-thien/lead-review-b2-238-r0.webp`: hết khối đen ở reflection; camera xe gần hơn).
**Hiệu năng chưa đạt.** `node tools/review/frame-compare.mjs <base>` (Edge, CPU throttle ×6, đi bộ 150 khung, 2 lần mỗi bản):

| | First Light p50 / p95 | Roots | Workshop |
|---|---|---|---|
| main | 20,0 / 40,1 ; 20,0 / 30,1 | 10–20 / 20,1 | 20 / 20–30 |
| B2-238 | **30,0 / 40,1 ; 30,0 / 50,0** | 20 / 20 | 20 / 30 |

Nguyên nhân khả dĩ: mỗi khung `cameraObstacles()` dựng mảng mới, duyệt toàn bộ `dressing` groups, thêm **InstancedMesh thân cây** (raycast duyệt từng instance), rồi bắn **5 tia**; thêm `traverse` mọi landmark bí mật mỗi khung.

Sửa:
1. Cache danh sách vật cản; chỉ dựng lại khi zone/dressing/quality đổi.
2. Không raycast InstancedMesh thân cây mỗi khung: dùng collider đơn giản (trụ/bounding sphere theo instance, lọc theo khoảng cách ≤ arm + 2 m) hoặc BVH thưa.
3. Tia phụ ở mép: chỉ bắn khi tia giữa trúng hoặc camera trong vùng có vật cản gần; hoặc giảm tần suất (mỗi 2–3 khung) nhưng giữ spring arm mượt.
4. Fade landmark: chỉ xét landmark trong bán kính vài mét quanh nhân vật (không traverse mọi bí mật mỗi khung).
5. Đo lại bằng `frame-compare.mjs` với main (4180) và worktree (cổng khác); kết quả **không tệ hơn main** ở cả 3 khu; dán bảng vào bàn giao. Thêm unit test: `updateCamera` không cấp phát mảng vật cản mới mỗi khung (đếm lần dựng).
