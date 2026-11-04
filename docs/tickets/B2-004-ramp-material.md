## TICKET B2-004 — Vật liệu toon ramp mềm, bóng xanh/tím nhạt

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-004`
- Đọc trước: `docs/tickets/_common-b2.md`
- Spec: §7.3 (độ nhám), §7.4; ADR 0013 mục 5; taste brief §5.4 (shading mềm kiểu tranh, bóng xanh/tím nhạt thay vì đen; vật liệu nhám, không bóng loáng)
- Việc: tạo `src/features/world/materials/ramp.ts`:
  - `createRampGradient(steps = 4, soft = true): DataTexture` — texture 1 hàng; soft = LinearFilter (chuyển bậc mềm), không soft = NearestFilter. Cache **một** texture cho mỗi cặp (steps, soft); `disposeRampGradients()`.
  - `createRampMaterial(color: number, opts?: { shadowTint?: number; soft?: boolean }): MeshToonMaterial` — gradientMap = ramp dùng chung; bóng không về đen: `onBeforeCompile` trộn phần tối với `shadowTint` (mặc định pha giữa `PALETTE.mist` và `PALETTE.indigo`, đủ sáng như mực loãng). Không specular, không metalness.
  - `RAMP_PRESETS`: `terrain` (forestLight), `crown` (forestDeep), `trunk` (ink pha paper), `water` (water) — màu từ `../art/palette`.
  - `customProgramCacheKey` ổn định để material cùng tham số dùng chung shader program.
- Được sửa: `src/features/world/materials/ramp.ts`, `tests/unit/world/ramp.test.ts`
- Test: gradient tăng đơn điệu, giá trị đầu > 0; cùng texture cho các material cùng tham số; preset đúng màu palette; cache key ổn định; dispose.
