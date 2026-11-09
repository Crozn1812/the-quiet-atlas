## RC-09 — Xoay camera cạnh biển chỉ đường không chui vào nhân vật

- Trạng thái: doing; Lead thi công.
- Vùng: src/features/world/index.ts; phép kiểm tools/review/rc-camera.mjs; bằng chứng showcase 35.
- Tái hiện: Edge High, tới biển Đi tới…, xoay 180°. Camera ray hit biển mảnh ngay sau lưng, spring arm rút còn dưới một mét; ảnh nhân vật chiếm gần toàn màn. Xảy ra ở mọi khu được chụp, cả zoom 4/16.
- Sửa: chỉ bỏ biển mảnh khỏi ray va chạm camera; giữ chúng trong line of sight/click/interaction. Đá, tường, thân cây và lan can vẫn là vật cản camera. Không đổi địa hình/collider người chơi.
- Kiểm: ảnh camera gần/xa bốn góc đủ 8 khu trước/sau; khoảng cách camera QA để phát hiện hồi quy; full gate/e2e, CPU compare 2 lần mỗi bản (+10 ms/s trần), load-budget, luma High 8 khu, intro/ending.
