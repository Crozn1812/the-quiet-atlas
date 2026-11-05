## TICKET B2-193: hết mảng cát loang lổ cạnh đường ven biển

- Được sửa: `src/features/world/shore/layout.ts`, `src/features/world/shore/geometry.ts` (**chỉ** `createShoreSandGeometry`), test `tests/unit/world/shore*.test.ts`.
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Lead thấy (`docs/showcase/25-tranh-chan-that/04-quiet-shore.webp`, `12-last-postcard.webp`)

- Dọc mép phải đường nhựa đoạn Quiet Shore có chuỗi **mảng cát phẳng màu be, mép cắt sắc như giấy dán**, đè cả lên vạch trắng mép đường và lên cỏ xanh.
- Last Postcard: mũi đất là một mảng cát phẳng lớn, mép cứng.

### Việc

1. Bãi cát chỉ ở **giữa mép nước và chân cỏ**: cách mép đường nhựa (kể cả lề sỏi) ≥ 2 m; không mảng nào chạm hoặc đè lên đường (dùng `road/layout.ts` để đo khoảng cách).
2. Mép bãi mềm: vertex color/alpha giảm dần về cỏ trong 1,5–3 m, đường mép uốn lượn không đều (noise theo seed), không cạnh thẳng.
3. Mặt cát bám địa hình (không phẳng nổi lên trên cỏ, lệch ≤ 0,05 m so với terrain + offset chống z-fight).
4. Mũi đất Last Postcard: cát thành dải hẹp quanh mép nước, phần trong là cỏ khô (`grassDry`) — tức là bỏ mảng cát lớn ở trong, để màu terrain lộ ra.

### Test

- Không đỉnh cát nào trong vùng đường + 2 m (lấy mẫu dọc đường t 0,82–1).
- Mỗi patch: tỉ lệ đỉnh có alpha/độ phủ < 1 ở mép ≥ 30 % số đỉnh viền.
- Độ lệch so với terrain ≤ 0,05 m + offset.
- Test shore cũ pass.

### Gợi ý của Lead

- Nguyên nhân: `createShoreSandGeometry` dựng cát bằng ô vuông 2 m, mép cắt cứng, và `shorePlacementClear` chỉ tránh `PATH_CLEARANCE` (hành lang lối đi), không tránh bề rộng thật của đường nhựa ven biển.
- **Phương án được phép và ưu tiên:** bỏ mesh cát rời (trả `sand: []` hoặc bỏ hẳn draw call), vì `terrain/mesh.ts` đã tô cát/đá ven nước thật bằng vertex color. Khi đó chỉ cần sửa test shore và ghi giảm 1 draw call. Nếu giữ mesh cát thì phải đạt đủ các mục ở trên.
