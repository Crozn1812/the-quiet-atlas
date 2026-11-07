## TICKET B2-244: biển hoàng hôn lúc chơi ở Last Postcard

- Đọc `_review-common.md` (cổng 4194), `docs/art-bible/lighting.md` (biển hoàng hôn), B2-240 ghi chú Lead (lớp phản chiếu trời 18 % làm biển xám đục: không lặp lại).
- Được sửa: `src/features/world/water/material.ts`, `src/features/world/sky/grade.ts` (chỉ phần biển), test `sea-*`. **Không** sửa `ribbon.ts`/`estuary.ts` (B2-243 đang làm).
- Hiện trạng: `docs/showcase/29-hoan-thien/hien-trang/last-postcard-bien-toi.webp`: camera chơi nhìn xuống, biển là mảng chàm tối phẳng (luma khung 0,21), không thấy chút hoàng hôn nào.
- Việc: mặt biển khi nhìn chếch xuống vẫn có ánh hoàng hôn: chuyển sắc chàm → tím/cam nhạt về phía mặt trời, gợn sáng nhỏ, nước nông gần bờ trong hơn; giữ chàm sâu ở xa và **không** làm xám đục. Luma Last Postcard 0,22–0,30; ending không xấu đi (so ảnh 31/34,5 s).
- Test: cập nhật CPU mirror trong `sea-sunset.test.ts` đúng theo shader; ảnh trước/sau gameplay + ending.
