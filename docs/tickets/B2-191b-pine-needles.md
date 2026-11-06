## TICKET B2-191b: thông v2 vòng 2 (chùm kim đầy, không còn que tăm)

- Được sửa: `src/features/world/foliage/pine.ts`, `tests/unit/world/pine.test.ts` (và đếm tam giác trong test foliage nếu cần, ghi lý do).
- Đọc `B2-191-pine-v2.md`, `B2-194-forest-kit-wiring.md` (đã nối), `_asset-common.md`.
- Ảnh Lead: `docs/showcase/26-asset-ky/lead-review/pine-v2-toothpicks.webp` (rừng t = 0,3).

### Lead thấy

- Thông v2 trông như **que tăm**: thân mảnh cao, các tầng cành gần như vô hình, chùm kim chỉ là vài vệt xanh nhỏ như dấu gạch.
- Thông Đà Lạt thật: tán ngọn thưa nhưng **có khối**, mỗi tầng là các mảng kim dày, đọc rõ ở 20–60 m.

### Việc

1. Chùm kim to hơn nhiều: mỗi chùm là khối dẹt (đĩa/bánh) rộng 0,9–1,6 m, dày 0,25–0,45 m, mép răng cưa; 3–6 chùm mỗi tầng, chồng nhau.
2. Tầng tán chiếm 1/3 trên của cây, nhìn từ xa thành **mảng tán không đều** (không phải nón), có khe trời giữa các tầng.
3. Cành nhìn thấy được (dày ≥ 0,06 m) nối thân với chùm.
4. Ngân sách: ≤ 600 tam giác mỗi biến thể (hiện 348/396/444, tổng hành lang +12,6 %; không được vượt +25 % so với trước B2-194).
5. Giữ toạ độ/gốc đã căn ở B2-194, thuộc tính `surface`.

### Test

- Diện tích chiếu đứng (silhouette) của phần kim ≥ 35 % diện tích hình bao tầng tán (đo trên lưới 2D).
- Mỗi chùm: rộng 0,9–1,6 m, dày 0,25–0,45 m.
- Tam giác ≤ 600; test hành lang foliage ≤ +25 %.
