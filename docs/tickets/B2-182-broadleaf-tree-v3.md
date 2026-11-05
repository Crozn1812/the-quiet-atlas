## TICKET B2-182: cây lá rộng v3 (tán cụm lá thật, thân gỗ, dây leo đúng chỗ)

- Được sửa: `src/features/world/foliage/shapes.ts` (**chỉ** `createBroadleafCrown`, `mossColor` và helper riêng của chúng; **không** đụng `createPineCrown`), test `tests/unit/world/*foliage*`/`*shapes*`/`*tree*`.
- Không sửa `foliage/instances.ts` (ticket B2-183 đang sửa). Giữ nguyên chữ ký hàm export và thuộc tính `surface` (0 lá, 1 gỗ, 2 dây leo) mà shader đang đọc.
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Lead thấy trên ảnh `docs/showcase/25-tranh-chan-that/05-rung-first-light.webp`

- Tán là 7 khối lục giác lớn, nhìn như đồ chơi xếp hình.
- Thân thẳng tắp, **màu kem nhạt**, dài, không có gốc loe; nhìn như cột.
- Dây leo là dải dài thòng từ mép khung hình xuống như sợi mì.

### Việc

1. **Tán:** 18–30 cụm lá nhỏ (bán kính 0,35–0,8 m) gom quanh 3–5 cành chính, mép tán răng cưa không đều; có khoảng hở nhìn xuyên qua tán. Mặt dưới tán tối hơn mặt trên (vertex color), mép ngoài sáng hơn lõi.
2. **Thân và cành:** thân thuôn (gốc rộng gấp 1,6 lần ngọn), gốc loe 3–4 rễ nổi, cong nhẹ; 3–5 cành chính tỏa từ khoảng 55–70 % chiều cao thân, cành nhỏ dần. Màu vỏ nâu xám (`rock` pha `rockDark` + chút `forestDeep`), luma vỏ 0,12–0,22; rêu xanh ở gốc giữ ý `mossColor`.
3. **Tỷ lệ:** phần thân trần dưới tán 3–6 m (hiện quá dài); tổng cao 9–14 m. Giữ `CROWN_BASE`/collider tương thích (collider thân không đổi).
4. **Dây leo:** chỉ ở 1/3 số cây (giữ hàm chọn hiện có), mỗi cây 2–4 sợi mảnh dài 1–2,5 m **treo từ cành**, không chạm đất, không vươn ra ngoài bounding của tán quá 0,5 m.
5. 3 biến thể hình (giữ cơ chế batch hiện có), ≤ 1 500 tam giác mỗi biến thể.

### Test

- Tam giác mỗi biến thể ≤ 1 500; số cụm lá 18–30; tỉ lệ thân gốc/ngọn ≥ 1,5.
- Dây leo: mọi đỉnh `surface = 2` có y ≥ (đáy tán − 2,5) và nằm trong bounding tán + 0,5 m.
- Luma vertex color của gỗ trong 0,12–0,22 (sau khi nhân màu material).
- Tất định: cùng seed → cùng geometry (hash).
- Test cũ pass; fingerprint nào đổi thì cập nhật và ghi lý do.
