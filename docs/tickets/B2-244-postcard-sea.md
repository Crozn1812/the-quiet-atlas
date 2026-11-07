## TICKET B2-244: biển hoàng hôn lúc chơi ở Last Postcard

- Đọc `_review-common.md` (cổng 4194), `docs/art-bible/lighting.md` (biển hoàng hôn), B2-240 ghi chú Lead (lớp phản chiếu trời 18 % làm biển xám đục: không lặp lại).
- Được sửa: `src/features/world/water/material.ts`, `src/features/world/sky/grade.ts` (chỉ phần biển), test `sea-*`. **Không** sửa `ribbon.ts`/`estuary.ts` (B2-243 đang làm).
- Hiện trạng: `docs/showcase/29-hoan-thien/hien-trang/last-postcard-bien-toi.webp`: camera chơi nhìn xuống, biển là mảng chàm tối phẳng (luma khung 0,21), không thấy chút hoàng hôn nào.
- Việc: mặt biển khi nhìn chếch xuống vẫn có ánh hoàng hôn: chuyển sắc chàm → tím/cam nhạt về phía mặt trời, gợn sáng nhỏ, nước nông gần bờ trong hơn; giữ chàm sâu ở xa và **không** làm xám đục. Luma Last Postcard 0,22–0,30; ending không xấu đi (so ảnh 31/34,5 s).
- Test: cập nhật CPU mirror trong `sea-sunset.test.ts` đúng theo shader; ảnh trước/sau gameplay + ending.

### Bổ sung (Lead, từ B2-242)

Ở Quiet Shore, dải tối chiếm 1/4 khung bên trái là **mặt nước sông** gần cửa (ribbon) lúc hoàng hôn, gần như đen. Cùng việc với biển: sông đoạn ven biển phải phản chiếu trời hoàng hôn (tím/chàm sáng hơn, ánh cam ở phía mặt trời), đọc được là nước. Ảnh: `docs/showcase/29-hoan-thien/lead-review-b2-242.webp` (ô 1).

### Trả lại vòng 1 (Lead, render)

Ảnh: `docs/showcase/29-hoan-thien/lead-review-b2-244-r0.webp` (Quiet Shore, Last Postcard gameplay, ending 31 / 34,5 s).
- Gameplay Last Postcard: **đạt** (ánh hoàng hôn phía mặt trời, luma 0,210 → 0,238).
- **Ending 31 / 34,5 s: chưa đạt** — biển thành nâu tím xỉn, mất chàm sâu; trước đó (main) chàm đậm + vệt nắng cam rõ. Sắc hoàng hôn mới chỉ nên áp khi nhìn **chếch xuống** (góc nhìn dốc); ở góc gần ngang mặt nước (ending, chân trời) giữ màu như main.
- **Sông ở Quiet Shore** (mục bổ sung phía trên) chưa làm: dải sông gần cửa vẫn gần đen.
- Rebase lên main mới nhất trước khi làm (B2-243 đã đổi `ribbon.ts`; `estuary.ts` đã bị xoá).
