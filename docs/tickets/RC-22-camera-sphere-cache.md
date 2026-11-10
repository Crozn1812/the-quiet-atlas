# RC-22 — Cache world sphere cho camera raycast mặc định

- Vùng file: `src/features/world/camera.ts`, block `updateCamera` và import tại `src/features/world/index.ts`, `tests/unit/world/camera-candidates.test.ts`, ticket này.
- Mục tiêu: tránh đổi local sphere sang world sphere lặp lại cho hàng loạt collider tĩnh mỗi frame, trước khi Three raycast nhận danh sách ứng viên.
- Chỉ lọc leaf mesh có đúng `Mesh.prototype.raycast`; luôn giữ custom raycast, mesh có con, instanced và skinned mesh. Không đổi near/far, danh sách collision/LoS, geometry hoặc phép intersect tam giác.
- Predicate sao đúng Three: recast ray theo near; containsPoint; intersectSphere; so khoảng cách bình phương với `(far-near)^2`. Không thay bằng phép kiểm sphere trên ray vô hạn.
- Cache WeakMap theo mesh: geometry identity, giá trị local sphere center/radius và toàn bộ matrixWorld. Tính sphere khi null như Three; direct sphere/matrix edit hoặc thay geometry đều invalidate. Vertex buffer sửa phải cập nhật bounds như contract Mesh.raycast cũ.
- Test oracle so toàn bộ hit object/distance/point/faceIndex và thứ tự trước/sau: transform parent/nonuniform scale, direct world matrix edit, geometry/sphere replacement/mutation/null, near/far/inside/tangent/NaN, custom/recursive/instanced/skinned bypass. Spy xác nhận không applyMatrix4 lặp ở cache hit.
- Trạng thái: code/static review; unit/lint/typecheck/build/render/CPU **NOT RUN** ở worker. Lead sẽ chạy sau lượt render đang diễn ra. Không đổi harness, warmup hoặc ngưỡng CPU main +10 ms/s.
