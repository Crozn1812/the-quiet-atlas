## TICKET B2-036 — Phác thảo xe GD110 (cách điệu, không huy hiệu) bằng script Blender

- Trạng thái: Assigned → Codex, đợt 15c, nhánh `lane/B2-036`
- Đọc trước: `docs/tickets/_common-b2.md`; `docs/art-bible/taste.md` §5.7 (xe) — đọc kỹ; `docs/adr/0013-art-direction-painted-world-film-memories.md` mục "Bổ sung… Q-25…Q-28" (ghi đông **scrambler**); `tools/assets/blender/pine.py`
- Spec: §2 (Suzuki GD110 trắng, ghi đông scrambler cao), §7.3 (vehicle ≤ 8 000 tam giác, ≤ 400 KB); CLAUDE.md §6 (**không logo/chữ Suzuki, không huy hiệu**)
- Việc: `tools/assets/blender/gd110.py` — mô hình cách điệu low-poly của một xe máy côn tay cổ điển nhỏ **dựa trên mô tả**, không có tên hãng:
  - Thân trắng (bình xăng tròn, ốp hông), yên đen dài phẳng, vành nan (gợi bằng đĩa mỏng + vài nan, không đủ 36 nan), lốp đen, ống xả mạ (vật liệu kim loại **mờ, ấm** — roughness ≥ 0,6), gương tròn hai bên, baga sau, đèn pha tròn.
  - **Ghi đông scrambler cao**: ống rộng, vuốt lên rõ, có thanh giằng ngang.
  - Phụ kiện tách object riêng (bật/tắt được): mũ bảo hiểm cổ điển (half-face) có kính phi công treo trên ghi đông hoặc đặt trên bình; túi tote kem treo ghi đông.
  - **Không** text object, decal, logo, biển số có chữ.
  - Gốc tọa độ giữa hai trục bánh, mặt đất y = 0, mũi xe hướng +Z; xuất `vehicle-gd110.glb`; in số tam giác.
  - Dùng lại `turnaround.py` (B2-035) nếu đã có, không thì viết `turnaround_vehicle.py` tương tự (3 góc: nghiêng trái, 3/4 trước, sau).
- Được sửa: `tools/assets/blender/gd110.py` (+ `turnaround_vehicle.py` nếu cần), `tests/unit/tools/gd110-script.test.ts`
- Test (Node): script có `main(argv)`; không chứa "suzuki"/"logo"/text object (không phân biệt hoa thường); màu thân/yên từ palette hoặc trắng kem; có object tên `handlebar_scrambler`.
