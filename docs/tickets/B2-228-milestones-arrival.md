## TICKET B2-228: Milestones nhìn thấy được từ điểm đến

- Đọc `_finish-common.md`, `B2-204b-milestones-r5.md`. File: `src/features/world/zones/milestones.ts` + test. Đọc (không sửa) điểm đến teleport/biển chỉ đường của khu và camera sau teleport trong `index.ts` / `navigation`.
- Ảnh trong game: `docs/showcase/27-hoan-thien-1/ingame/milestones.webp`: đứng ở điểm đến khu (biển chỉ đường) **không thấy cụm đá nào** trong khung camera.

### Việc

- Đặt lại vị trí cụm đá (giữ hình, giữ collider tương đối) sao cho từ điểm đến khu và từ lối đi khi tới gần (10–25 m), tảng chính nằm trong khung camera mặc định (cách tâm ≤ 25°), không bị thân cây che; vẫn trên vai đồi khô theo B2-204b.
- Test: chiếu tảng chính vào camera ở điểm đến (cùng FOV/hướng như sau teleport): trong khung, ≤ 25° từ tâm, không bị collider thân cây che. Test cũ pass; dựng ≤ 450 ms Node.
