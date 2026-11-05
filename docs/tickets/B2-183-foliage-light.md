## TICKET B2-183: tán cây nhận ánh sáng đúng (không đen khi ngược nắng, có lay nhẹ)

- Được sửa: `src/features/world/foliage/instances.ts` (shader patch và màu instance), test `tests/unit/world/*foliage*`, `attribute-budget.test.ts` nếu cần.
- Không sửa `foliage/shapes.ts` (B2-182, B2-191 đang sửa). Không thêm vertex attribute mới (ngân sách 16 attribute; test `attribute-budget` phải pass).
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Lead thấy trên ảnh

- `01-duong-ven-bien.webp`: cây trên sườn núi ven biển gần như **đen tuyền** khi nhìn ngược nắng hoàng hôn.
- `05-rung-first-light.webp`: tán gần camera đen đặc, mất hết hình khối.

### Việc

1. **Ánh sáng xuyên lá** (translucency rẻ): khi mặt lá quay lưng với mặt trời, cộng thêm `sunColor × k × (1 − N·L)` với k nhỏ (0,15–0,25), mạnh hơn ở mép tán. Bóng ngả xanh lam/tím theo hemi, không về đen.
2. **Ambient tối thiểu:** luma cuối của lá ≥ 0,06 ở rừng bình minh và biển hoàng hôn (dùng grade hiện có).
3. **Biến màu theo instance:** hue/độ sáng ±8 % theo seed vị trí (không `Math.random`), để rừng không một màu.
4. **Lay gió nhẹ:** đỉnh tán lệch ≤ 0,08 m, chu kỳ 4–7 s, pha theo vị trí; tắt khi `reducedMotion`. Thân không lay.
5. Không thêm draw call, không thêm pass.

### Test

- Mô phỏng CPU công thức shader cho lá ngược sáng ở t = 0,15 và t = 0,93: luma ≥ 0,06.
- Lá thuận sáng không sáng hơn bản cũ quá 10 %.
- `reducedMotion` → độ lệch gió = 0.
- Test attribute-budget, test cũ pass.
