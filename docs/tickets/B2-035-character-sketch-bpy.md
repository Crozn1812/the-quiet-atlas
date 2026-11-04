## TICKET B2-035 — Phác thảo nhân vật bằng script Blender (cho turnaround 3 góc)

- Trạng thái: Assigned → Codex, đợt 15c, nhánh `lane/B2-035`
- Đọc trước: `docs/tickets/_common-b2.md`; `docs/art-bible/taste.md` §5.6 (nhân vật) — đọc kỹ; `tools/assets/blender/pine.py` (cách viết bpy hiện có); `tools/assets/README.md`
- Spec: §2 (nhân vật stylized tóc đen, kính tròn, áo trắng, quần short, tỷ lệ không chibi), §7.3 (ngân sách tam giác: character ≤ 12 000, ≤ 600 KB); ADR 0013 mục 4c (turnaround 3 góc để Duy duyệt riêng)
- Việc: `tools/assets/blender/character.py` — dựng **mô hình cách điệu low-poly** bằng primitive + modifier (không sculpt, không asset ngoài, không ảnh tham chiếu nào được nhúng):
  - Tỷ lệ người thật mảnh (~7 đầu), cao 1,72 m; tư thế A-pose nhẹ.
  - Tóc đen ngắn, hơi rối tự nhiên, mái lòa xòa (vài khối tóc lệch nhau, không gai anime).
  - Kính tròn gọng kim loại mảnh màu vàng nhạt/bạc (torus mảnh), không tròng phản chiếu.
  - Sơ mi trắng/kem rộng, cổ bẻ, **xắn tay** tới khuỷu; quần short đen; tất trắng; giày vải xanh lá; túi tote vải kem đeo vai. **Áo trơn, không logo, không chữ.**
  - Mặt: không chi tiết nhận diện chân dung — chỉ mũi gợi khối, không vẽ mắt chi tiết (giữ cách điệu; "hiền, hay nhìn xa" thể hiện bằng tư thế đầu hơi ngẩng).
  - Vật liệu phẳng, màu từ palette (paper/ink/forestLight…) + trắng kem áo; roughness 1, metallic 0 (kính: kim loại mờ, không bóng).
  - Xuất `character-duy.glb`. In số tam giác ra stdout.
  - `turnaround.py`: render 3 ảnh (trước, nghiêng 3/4, sau) 1024 × 1024, nền giấy `#EEE8D8`, Workbench/EEVEE flat, camera trực giao, ánh sáng mềm — xuất PNG vào thư mục được truyền qua argv.
- Được sửa: `tools/assets/blender/character.py`, `tools/assets/blender/turnaround.py`, `tests/unit/tools/blender-scripts.test.ts`
- Test (Node, không chạy Blender): script tồn tại, có hàm `main(argv)`, không có chuỗi "logo"/text object/`bpy.data.images.load`, các màu hex trùng palette; turnaround nhận thư mục đầu ra qua argv. Lead chạy Blender và chụp turnaround.
