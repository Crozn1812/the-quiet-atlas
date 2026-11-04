## TICKET B2-019 — Bầu trời + ánh sáng bình minh → hoàng hôn theo vị trí

- Trạng thái: Assigned → Codex, đợt 15b, nhánh `lane/B2-019`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/world/layout/lighting.ts` (`timeOfDayAt`), `src/features/world/art/palette.ts`
- Spec: §7.1 (ánh sáng bình minh → hoàng hôn theo vị trí, không theo đồng hồ; fog, màu ánh sáng, bầu trời thống nhất; vùng chuyển tiếp tránh đổi màu đột ngột khi quay đầu); taste brief §5.3 (không bão hòa mạnh), §5.4 (bóng xanh/tím nhạt)
- Việc: `src/features/world/sky/`:
  1. `grade.ts`: `lightingAt(tod: number)` → `{ sunColor, sunIntensity, sunDirection, hemiSky, hemiGround, hemiIntensity, fogColor, skyTop, skyHorizon, shadowTint }` — nội suy giữa 3 keyframe (dawn 0, noon-ish 0,5, dusk 1) bằng smoothstep, màu lấy/pha từ palette (dawn: paper + dusk nhạt; giữa: paper + mist; dusk: dusk + flower rất nhẹ ở chân trời). Mặt trời thấp ở dawn/dusk, cao giữa.
  2. `smoothing.ts`: `createGradeFollower(rate)` — làm mượt theo thời gian (exponential) để quay đầu/dịch chuyển không đổi màu đột ngột; teleport được `snap()`.
  3. `dome.ts`: bầu trời gradient rẻ (một mesh cầu/hemisphere, ShaderMaterial 2 màu + dải giấy mờ ở chân trời, `depthWrite: false`, không texture); `update(grade)`.
- Được sửa: `src/features/world/sky/**`, `tests/unit/world/sky.test.ts`
- Test: tod 0/0,5/1 trả đúng keyframe; nội suy liên tục (bước tod 0,001 → thay đổi màu < 0,01); không màu nào có độ bão hòa HSV > 0,85; sun elevation dawn/dusk < giữa; follower hội tụ và `snap` nhảy ngay; dome dispose.
