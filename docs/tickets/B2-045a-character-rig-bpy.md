## TICKET B2-045a: Rig + animation nhân vật bằng script Blender (mô hình đã duyệt D-23)

- Trạng thái: Assigned → Codex, đợt 18, nhánh `lane/B2-045a`
- Đọc trước:
  - `_common-b2.md`
  - `tools/assets/blender/character.py` (B2-035). **Đã duyệt giữ hết (D-23): không đổi hình dáng, màu, tỷ lệ.**
  - `tools/assets/README.md`
  - `docs/showcase/15-turnaround/checklist.md`
- Spec: §5 (nhân vật đi bộ, chạy chậm); taste §5.4 (chuyển động chậm, không nảy)

### Việc

Viết `tools/assets/blender/character_rig.py`. Import hoặc gọi `build_character()` từ `character.py`, không sao chép code.

1. **Armature người tối giản, ≤ 20 xương:**
   - hips, spine, chest, neck, head
   - vai, cánh tay, cẳng tay, bàn tay: mỗi bên 1 bộ
   - đùi, ống chân, bàn chân: mỗi bên 1 bộ

   Parent mesh vào armature bằng automatic weights, hoặc gán tay theo từng vùng. Túi tote gắn vào xương vai, kính gắn vào đầu.
2. **3 action**, lặp liền mạch, 30 fps, **tại chỗ** (không root motion):

   | Action | Nội dung |
   |---|---|
   | `Idle` | thở nhẹ, 4 s |
   | `Walk` | 1,0 s/chu kỳ, bước khoảng 0,7 m |
   | `Run` | 0,7 s/chu kỳ, chạy chậm |
3. **Xuất GLB:**
   - Đường dẫn ra truyền sau `--`, giống `character.py`.
   - Y-up, có skin và 3 animation, không camera hay đèn.
   - Gộp mesh thành ≤ 4 mesh để giảm draw call.
4. Thêm mục "Character rig" vào `tools/assets/README.md`: lệnh chạy, tên các action, số xương.

**Codex không chạy được Blender trong sandbox.** Viết script cẩn thận theo API Blender 5.x, ví dụ `bpy.ops.export_scene.gltf(export_animations=True, export_skins=True, ...)`. Lead sẽ chạy và báo lỗi nếu có (tối đa 2 vòng).

### Được sửa

- `tools/assets/blender/character_rig.py`
- `tools/assets/README.md`
- `tests/unit/tools/character-rig.test.ts`: test tĩnh đọc file .py và kiểm:
  - có đủ 3 tên action;
  - khai báo ≤ 20 xương;
  - không import ảnh hay tệp ngoài repo;
  - có `export_skins`.

### Bàn giao

Lệnh để Lead chạy và ngân sách dự kiến: ≤ 12 000 tam giác, ≤ 600 KB sau meshopt.

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
