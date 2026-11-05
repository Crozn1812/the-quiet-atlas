# Nhân vật

- Mô tả nguyên văn từ `docs/art-bible/taste.md` §5.6:

> - Tóc đen ngắn, hơi rối tự nhiên, mái lòa xòa.
> - Kính tròn gọng kim loại mảnh, màu vàng nhạt/bạc.
> - Dáng người mảnh, tỷ lệ người thật, không chibi.
> - Trang phục chính (đúng spec): sơ mi trắng/kem rộng, xắn tay, quần short đen, tất trắng, giày vải xanh lá. Áo trơn, không logo.
> - Phụ kiện: túi vải tote màu kem.
> - Biến thể có thể dùng cho cảnh ending/biển chiều: áo khoác hoodie xám + khăn quàng (như ảnh trên đồi gió) — Lead quyết.
> - Không làm khuôn mặt giống người thật đến mức nhận diện; giữ cách điệu nhưng bắt được tinh thần: hiền, hay cười, hay nhìn xa.

- ADR `docs/adr/0013-art-direction-painted-world-film-memories.md`: nhân vật giữ chi tiết kính, tote, short đen, giày xanh; không logo/thương hiệu. Tham chiếu chỉ lấy cảm hứng.

| Thông số trong script, không phải đo lại asset | Giá trị | Nguồn |
|---|---|---|
| Chiều cao sau chuẩn hóa | `1,72 m` | `tools/assets/blender/character.py`, `HEIGHT`, `build_character` |
| Tỷ lệ silhouette | Khoảng `7` đầu; đầu khoảng `0,245 m` theo chú thích tác giả | `tools/assets/blender/character.py`, chú thích `Seven-head silhouette` |
| Cổ | Dài `0,125 m`, bán kính `0,056 m` | `tools/assets/blender/character.py`, `NECK_LENGTH`, `NECK_RADIUS` |
| Hệ số bề ngang chân / tay / giày | `1,35 / 1,20 / 1,12` so với khối cơ sở trong script | `tools/assets/blender/character.py`, `LEG_WIDTH_SCALE`, `ARM_WIDTH_SCALE`, `SHOE_SCALE` |
| Quai tote / chỏm tóc | Rộng `0,011 m` / tham số cao `0,045 m` | `tools/assets/blender/character.py`, `STRAP_WIDTH`, `HAIR_CROWN_HEIGHT` |
| Trần tam giác / dung lượng | `12 000` / `600 000 byte` | `tools/assets/blender/character.py`, `MAX_TRIANGLES`, `MAX_BYTES`; `tools/assets/budgets.json` |
| Tổng tam giác asset thực tế | **Chưa đo**; script tính và in `character-duy triangles` sau bake modifier | `tools/assets/blender/character.py`, `calc_loop_triangles` |

- Màu hiện hành: tóc/quần `ink`, giày `forestLight`, tote pha `paper` và vải sáng; kính pha `paper` với `dusk` mức `0,18` (`tools/assets/blender/character.py`). Ngoại lệ màu có sẵn ngoài palette môi trường: `CREAM_WHITE=#F4F0E6`, `SKIN=#D9B48F` (cùng script); không mở rộng ngoại lệ sang asset môi trường.
- Script study gốc dùng roughness `1`, metallic `0` (`tools/assets/blender/character.py`, `material`); runtime thay vật liệu PBR bằng ramp và giữ màu linear (`src/features/world/character/loader.ts`; `tests/unit/world/character.test.ts`).
- Không suy ra số tam giác từ test fixture. Chưa chạy Blender/duyệt turnaround trong ticket tài liệu này.
