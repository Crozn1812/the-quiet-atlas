## TICKET B2-184: khóa art bible hướng A (công đoạn 3)

- Ngoại lệ của `_common-b2.md`: ticket này **được** sửa docs, nhưng **chỉ** `docs/art-bible/` (tạo file mới, cập nhật `README.md`). Không sửa `taste.md` (nguyên văn của Duy). Không sửa code.
- Đọc: `docs/art-bible/taste.md`, `docs/adr/0013-art-direction-painted-world-film-memories.md` (đặc biệt mục "Bổ sung 2026-11-05: đổi sang hướng Tranh chân thật"), `docs/tickets/_dirA-common.md`, `docs/tickets/_asset-common.md`, `docs/tickets/B2-180-dawn-dusk-light.md`, spec `docs/spec/The_Quiet_Atlas_Master_Prompt_V6.md` §2, §6, §8.
- Đọc code để lấy số thật (không bịa): `src/features/world/art/palette.ts`, `art/direction.ts` (preset R), `sky/grade.ts`, `materials/ramp.ts`, `tools/assets/budgets.json`, `foliage/*`, `vehicle/mesh.ts`, `tools/assets/blender/character.py`.

### Tạo các file (tiếng Việt, ngắn, dạng gạch đầu dòng/bảng)

1. `palette.md`: 24 màu PALETTE (tên khóa, hex, vai trò, chỗ được dùng, tỉ lệ diện tích gợi ý). Ghi quy tắc cam/đỏ chỉ là chấm.
2. `lighting.md`: bảng ánh sáng theo đoạn đường (rừng bình minh / đồi / biển hoàng hôn): độ cao và màu mặt trời, cường độ, hemi, fog, luma mục tiêu, cửa sổ chuyển tiếp. **Lấy số từ `grade.ts`**. Nước theo ánh sáng (B2-181).
3. `shading.md`: ramp mềm 4 bậc, bóng xanh/tím, không PBR kim loại, không texture ảnh; hậu kỳ của preset R; sương chỉ ở 3 chỗ (ADR 0013 bổ sung).
4. `asset-budgets.md`: ngân sách từ `_asset-common.md` + `budgets.json` + §8 (≤ 8 MB bắt đầu, ≤ 30 MB world, thời gian vào chơi ≤ 6 s, FPS ADR 0007); quy tắc instancing, draw call, biến thể.
5. `materials.md`: cách vẽ từng chất liệu (lá, vỏ cây, rêu, đá, gỗ, cỏ, cát, nhựa đường, nước, mây) — màu PALETTE nào, biến màu, mức chi tiết hình học.
6. `character.md` và `gd110.md`: chép đúng mô tả từ taste §5.6/§5.7, ADR 0013 (ghi đông scrambler, không chữ/huy hiệu), cộng số liệu thật trong code/script (tỉ lệ, số tam giác nếu có trong script/test; không có thì ghi "chưa đo").
7. `README.md`: bảng file, trạng thái "**Khóa 2026-11-06 — hướng A**", quy trình đổi (đổi phải có ADR).

### Điều kiện xong

- Mọi con số đều trỏ được về file nguồn (ghi đường dẫn cạnh số). Không có số tự đặt.
- `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` vẫn exit 0 (không đổi code).
