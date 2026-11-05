# Ánh sáng theo đường đi

- Nguồn ánh sáng: `src/features/world/sky/grade.ts`, `KEYFRAMES`. Các giá trị dưới là **mốc `tod`**, không phải tọa độ đường `pathT`; màu được pha trong không gian linear của Three. `pha(a,b,w)` tương ứng `new Color(a).lerp(new Color(b),w)`.

| Đoạn / mốc | Độ cao, hướng mặt trời | Màu nắng | Cường độ nắng / hemi | Nguồn tất cả số trong hàng |
|---|---|---|---|---|
| Rừng bình minh / `tod=0` | `5°`, hướng đông sau rừng, X âm/Z dương | `pha(pha(cloud,sunGold,0.6),flower,0.03)` | `1,38 / 0,55` | `src/features/world/sky/grade.ts`, `KEYFRAMES` |
| Đồi sáng muộn / `tod=0.5` | `35°`, X bằng không/Z dương | `pha(cloud,sunGold,0.08)` | `2,2 / 1,6` | `src/features/world/sky/grade.ts`, `KEYFRAMES` |
| Biển hoàng hôn / `tod=1` | `3,5°`, bên phải phía trước, X dương/Z âm | `pha(sunGold,flower,0.3)` | `1,7 / 0,57` | `src/features/world/sky/grade.ts`, `KEYFRAMES` |

| Đoạn | Hemi trời / hemi đất | Màu fog của grade | Near–far fog (m) | Nguồn số |
|---|---|---|---|---|
| Rừng | `pha(skyLow,indigo,0.05)` / `pha(grassDry,skyLow,0.25) × 0.88` | Recipe `mist` pha `sunGold` mức `0,18` | `25–145` | Màu hemi: `src/features/world/sky/grade.ts`; recipe và khoảng fog: `src/features/world/art/direction.ts`, preset R |
| Đồi | `pha(skyLow,skyHigh,0.15)` / `pha(grassDry,skyLow,0.3) × 0.88` | `skyLow` | `120–700` | Hemi/fogColor: `src/features/world/sky/grade.ts`; khoảng fog: `src/features/world/art/direction.ts`, preset R |
| Biển | `pha(skyLow,indigo,0.12)` / `pha(grassDry,indigo,0.35) × 0.88` | `pha(COAST_TOP,COAST_HORIZON,0.55)` | `160–900` | Hemi/fogColor: `src/features/world/sky/grade.ts`; khoảng fog: `src/features/world/art/direction.ts`, preset R |

- Trời bình minh xanh xám nhạt, chân trời đào vàng; đồi xanh trong; biển xanh chàm phía trên, cam vàng phía chân trời. Recipe đầy đủ: `src/features/world/art/direction.ts`, `R.background.sky`; `grade.ts` đọc các recipe này.
- Phân biệt fog của grade và màu hậu kỳ thực tế: `src/features/world/scene/paper.ts` dùng `skyLow` pha `cloud` mức `0,3` cho không khí trong của R, rồi pha màu rừng theo trọng số. Không diễn giải bảng fogColor thành màu cuối cùng ở mọi quality.

| Luma mục tiêu, không phải phép đo ảnh | Nguồn |
|---|---|
| Rừng tại `pathT=0,15`: `0,26–0,32`; cao nắng `3–7°` | `docs/tickets/B2-180-dawn-dusk-light.md`; `tests/unit/world/sky.test.ts`, `referenceLuma` |
| Đồi tại `pathT=0,55`: sáng hơn rừng và biển, chưa có khoảng luma khóa | `docs/tickets/B2-180-dawn-dusk-light.md`; `tests/unit/world/sky.test.ts` |
| Biển tại `pathT=0,93`: `0,24–0,30`; cao nắng `2–5°` | `docs/tickets/B2-180-dawn-dusk-light.md`; `tests/unit/world/sky.test.ts`, `referenceLuma` |
| Prop ở khoảng cách `15 m`: luma ≥ `0,12`; bóng asset ≥ `0,06` | `docs/tickets/B2-180-dawn-dusk-light.md`; `docs/tickets/_asset-common.md` |

- `grade.ts` không chứa hằng mục tiêu luma. Test dùng vật liệu tham chiếu linear `0,4`, lấy trung bình mặt đất và mặt đứng, chưa tính fog/tone mapping (`tests/unit/world/sky.test.ts`); không gọi đó là luma trung bình ảnh đã render.

| Cửa sổ chuyển tiếp | Nguồn |
|---|---|
| Ánh sáng theo đường: `pathT=0,2–0,9`, smoothstep; giữ bình minh trước và hoàng hôn sau cửa sổ | `src/features/world/layout/lighting.ts`, `timeOfDayAt` |
| Rừng → đồi: `forestEdge ± 20/pathLength()`, tổng `40 m`; `forestEdge` là trung điểm giữa khu rừng cuối và khu đồi đầu | `src/features/world/art/direction.ts`, `FOREST_ATMOSPHERE_TRANSITION` |
| Trời/fog đồi → biển: `pathT=0,76–0,89`, smoothstep | `src/features/world/sky/grade.ts`, `coastAtmosphereWeight`; `art/direction.ts`, `fogAt` |
| Kiểm độ mượt: bước `pathT=0,005`, chênh luma ≤ `0,02` | `docs/tickets/B2-180-dawn-dusk-light.md`; `tests/unit/world/sky.test.ts` |

- Quay đầu vẫn tính từ vị trí, không lưu trạng thái để chọn màu (`grade.ts`, `layout/lighting.ts`).
- **Nước theo B2-181:** màu nền phải nhận `sunColor × sunIntensity` và hemi; phản chiếu `skyHorizon` theo góc nhìn. Suối bình minh tối xanh ngọc, hơi đào; biển gần bờ tối ngọc, xa xanh tím, vệt nắng cam vàng. Không tự phát sáng, không thêm texture/render target (`docs/tickets/B2-181-water-follows-light.md`).
- **Chưa hoàn tất trong code đang đọc:** `src/features/world/scene/compose.ts` mới truyền hướng nắng cho biển và `setSkyMix`; `water/material.ts` chưa nhận đầy đủ màu/cường độ grade. Không coi B2-181 là đã đạt. Ngưỡng nước: rừng ≤ luma đất × `1,3`, biển ≤ `0,35`; suối ven đường tại `pathT=0,86` tối hơn đường cùng khoảng cách (`docs/tickets/B2-181-water-follows-light.md`).
