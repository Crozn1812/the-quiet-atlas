## RC-16 — Có bounding box trước raycast camera qua collider tĩnh

- Vùng file: `src/features/world/camera.ts`, `src/features/world/index.ts` (Lead nối), `tests/unit/world/camera-bounds.test.ts`.
- Trạng thái: review; helper chưa nối tại index, chưa build/CPU/render.
- Mục tiêu: giảm duyệt tam giác thừa mà giữ nguyên khoảng cách camera và danh sách vật cản.
- Phát hiện mã: Three Mesh.raycast chỉ thử boundingBox khi nó đã tồn tại. Một mesh phẳng có sphere lớn có thể chạy cả danh sách tam giác cho ray hướng lên không chạm mặt phẳng. Terrain tile hiện đã có bounds và slab raycast; tối ưu mới nhằm các collider/landmark tĩnh chưa có boundingBox.
- Sửa: `ensureCameraBounds(obstacles)` chỉ gọi computeBoundingBox khi null; không thay raycast, near/far, vật liệu, geometry, object transform, bounds authored đã có hoặc recursion. Lead gọi trước camera/LoS raycast trên danh sách collider tĩnh.
- Giới hạn: chỉ dùng cho mesh có vertex positions tĩnh trong danh sách collider. Object/group transform có thể đổi bình thường; mesh nào sửa vertex buffer sau đó phải tự cập nhật bounds. Không dùng helper thay quy tắc bounds của nhân vật skinned hoặc mesh morph.
- Test: đối chiếu toàn bộ object/distance/point/faceIndex của raycast trước/sau với terrain, trunk cylinder, landmark box, child mesh recursive, parent translate/rotate/nonuniform scale và các đoạn near/far. Giữ nguyên custom fallback picking bên ngoài visible geometry như ống nhòm Horizon; giữ bounds authored. Ray hướng lên trong sphere plane64m: cùng miss, trước gọi getVertexPosition >100 lần, sau không gọi lần nào.
- Đã chạy: camera-bounds + camera **6/6 PASS**, Vitest exit 0. Lint/typecheck cần kiểm sau khi Lead nối index.
- Lead cần CPU hai lượt mỗi bản, gate và ảnh High tám khu. Unit không chứng minh đã đạt +10ms/s hoặc render.
