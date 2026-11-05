## TICKET B2-192: nhân vật Duy làm kỹ (script Blender)

- Được sửa: `tools/assets/blender/character.py`, `tools/assets/blender/character_rig.py` (chỉ nếu cần giữ rig khớp), test `tests/unit/tools/*character*` nếu có.
- Không sửa `public/world/start/character-duy.glb` (Lead build lại bằng Blender 5.2 rồi tối ưu), không sửa runtime `src/features/world/character/*`.
- Đọc `docs/art-bible/taste.md` §5.6, ADR 0013, script hiện có (thiết kế đã được Duy duyệt D-23: **giữ tỉ lệ, dáng, bảng màu**; chỉ thêm chi tiết).

### Việc (thêm chi tiết, không đổi thiết kế)

1. Tóc: nhiều lọn khối (8–14) rối nhẹ, mái lòa xòa; không còn một khối mũ.
2. Kính tròn gọng kim loại mảnh vàng nhạt/bạc (mờ), có cầu kính và càng.
3. Sơ mi trắng/kem: cổ áo, nẹp cúc (không chữ), tay xắn có nếp gấp, vạt áo hơi rộng.
4. Quần short đen có gấu; tất trắng; giày vải xanh lá có đế sáng và dây (khối).
5. Túi tote kem đeo vai, quai mảnh.
6. Không logo, không chữ. Mặt cách điệu, không cố giống người thật.
7. Giữ tên xương/nhóm đỉnh để rig và animation hiện có vẫn chạy; ≤ 12 000 tam giác.

### Điều kiện xong

- Nếu sandbox chạy được `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/assets/blender/character.py -- <tmp>/character-duy.glb` thì chạy và dán số tam giác/xương. Không chạy được thì ghi NOT RUN; Lead chạy.
- `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0.
