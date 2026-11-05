# Shading và hậu kỳ

- Khóa theo `docs/adr/0013-art-direction-painted-world-film-memories.md`, mục đổi sang hướng Tranh chân thật: trời xanh có mây, nắng trong, bóng rõ, màu tự nhiên; không nền giấy kem phủ world, không màn sương sữa, không nét mực địa hình. Ký ức vẫn là ảnh film.
- Ramp mềm **4 bậc**, lọc `LinearFilter`; giá trị lấy mẫu `64, 128, 191, 255`, đầu bóng không bằng không (`src/features/world/materials/ramp.ts`, `createRampGradient`; `src/features/world/art/direction.ts`, preset R).
- Ngoại lệ đang triển khai: địa hình dùng half-Lambert liên tục với khoảng irradiance `0,25–1`, thay lookup ramp; vật thể/lá vẫn ramp mềm (`src/features/world/materials/ramp.ts`, `continuous`, `RAMP_STEPS`). Không mô tả địa hình hiện tại là các dải toon cứng.
- Bóng ngả xanh/tím theo `taste.md` §5.4; R mặc định pha `indigo` với `skyHigh` mức `0,25`, highlight pha `cloud` với `sunGold` mức `0,12` (`src/features/world/materials/ramp.ts`). Bóng asset luma ≥ `0,06` (`docs/tickets/_asset-common.md`), cần đo, không suy ra chỉ từ ramp.
- Không PBR kim loại, không texture ảnh; dùng `createRampMaterial` / `createPropMaterial`, vertex color, hình học thủ tục (`docs/tickets/_dirA-common.md`, `_asset-common.md`). DataTexture của ramp là dữ liệu shader, không phải texture ảnh vật liệu.

| Thành phần | Preset R hiện hành | Nguồn số / hành vi |
|---|---|---|
| Hướng world | `WORLD_DIRECTION = STYLE_PRESETS.R` | `src/features/world/art/direction.ts` |
| Mép màu | `bleed=0,04`, `ink=false`, kể cả High | `src/features/world/art/direction.ts`; `src/features/world/post/paper.ts` |
| Balanced/High | Pass hậu kỳ gộp sẵn có; tone mapping hình học, fog theo depth, mist, pooling nhẹ | `src/features/world/post/paper.ts` |
| Giấy/hạt trên world | R bật `CLEAR_AIR`: tắt grain, vignette giấy và viền sáng giấy của pooling | `src/features/world/post/paper.ts` |
| Low | Render trực tiếp và native scene fog; không cấp render target hậu kỳ | `src/features/world/post/paper.ts` |
| Mist đồi/xa | Bands `160/320/600 m`, strength `0,02`, warmth `1` | `src/features/world/art/direction.ts`, R |
| Sương sớm rừng hiện hành | Bands `40/75/115 m`, strength `0,16`; nhả qua `40 m` đường | `src/features/world/art/direction.ts`, R và `FOREST_ATMOSPHERE_TRANSITION` |
| Lối vào biển | Giảm strength mist nền theo hệ số `1 − 0,9 × coastClear`, đạt độ giảm tại `pathT=0,82` | `src/features/world/scene/paper.ts` |

- Không thêm pass hậu kỳ (`docs/tickets/_dirA-common.md`). Film grain/viền film/light leak thuộc ký ức (`taste.md` §5.2, §5.5), không mang lại lớp giấy phủ world.
- **Sương chỉ ở 3 chỗ theo ADR bổ sung hướng A** (`docs/adr/0013-art-direction-painted-world-film-memories.md`): mây vờn đỉnh núi; rừng núi bên trái đoạn biển; hơi nước xa ở chân trời. Đây là vị trí, không phải yêu cầu phủ các dải sương khắp bản đồ.
- Ngoại lệ cần giữ rõ: B2-180 cho phép sương sớm trong rừng bình minh, hiện có profile riêng trong R (`docs/tickets/B2-180-dawn-dusk-light.md`; `src/features/world/art/direction.ts`). Phạm vi này rộng hơn danh sách vị trí của ADR; Lead cần ghi ADR nếu giữ lâu dài, không mở thêm vùng sương dựa trên ngoại lệ đó.
