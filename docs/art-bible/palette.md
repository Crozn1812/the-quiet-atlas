# Bảng màu — hướng A

- Nguồn hex và tên khóa: `src/features/world/art/palette.ts` (`PALETTE`, `RARE_ACCENTS`); đủ 24 màu theo `docs/tickets/B2-184-art-bible-lock.md`.
- Cột diện tích là **tương quan gợi ý**, không phải phần trăm đã đo: nguồn chưa khóa phần trăm. Theo `taste.md` §5.3, xanh chiếm phần lớn, cam/đỏ chỉ là chấm nhỏ. Theo ADR hướng A, kem dành cho vật thể/ký ức, không phủ nền world.
- Chỗ dùng dưới đây là phạm vi art cho phép; công thức đang chạy đối chiếu các file nguồn cuối bảng. Chỉ pha giữa màu PALETTE, bão hòa vừa, không neon (`docs/tickets/_asset-common.md`).

| Khóa | Hex (`src/features/world/art/palette.ts`) | Vai trò | Chỗ được dùng | Diện tích gợi ý |
|---|---|---|---|---|
| `paper` | `#EEE8D8` | Kem ngà | Thân xe, tote, ký ức | Mảng vật thể; rộng trong ký ức |
| `ink` | `#2B2A26` | Mực nâu đen | Tóc, quần, yên/lốp, chữ giao diện | Nét và mảng tối cục bộ |
| `forestLight` | `#5E8C6A` | Ngọc rừng sáng | Tán lá, dương xỉ, giày vải | Mảng xanh chủ đạo trong rừng |
| `forestDeep` | `#2F5446` | Xanh rừng sâu | Tán sâu, gốc cỏ, rêu | Mảng xanh tối xen kẽ |
| `mist` | `#A9C8B8` | Ngọc nhạt | Pha khí quyển bình minh, sương đúng vị trí | Cục bộ ở xa |
| `water` | `#2E5E73` | Lam nước | Preset vật liệu nước ramp; không thay nền biển hiện hành | Dải nước cục bộ |
| `indigo` | `#23476B` | Chàm lạnh | Bóng, trời/fog hoàng hôn | Màu pha trong bóng và xa |
| `dusk` | `#E2B65C` | Vàng hoàng hôn | Đèn xe, pha vỏ cây, phản chiếu nước | Điểm ấm và màu pha |
| `flower` | `#D9822B` | Cam hoa | Hoa, ngày film, pha nắng hoàng hôn | Chỉ chấm; ánh sáng là màu pha |
| `vermilion` | `#B5432F` | Đỏ son | Đèn hậu, đầu cột tiêu, dấu film | Chấm rất hiếm |
| `skyHigh` | `#3F7FBF` | Xanh trời cao | Đỉnh trời, pha bóng lạnh | Mảng trời rộng |
| `skyLow` | `#9CC6E4` | Xanh chân trời | Chân trời đồi, hemi, fog trong | Mảng khí quyển rộng |
| `cloud` | `#F5F2EA` | Trắng mây ấm | Mây, pha nắng và highlight | Cụm mây; chừa trời xanh |
| `sunGold` | `#F2C46D` | Vàng nắng | Nắng, viền mây, pha chân trời | Màu chiếu sáng, không sơn phủ |
| `seaShallow` | `#3AAFA9` | Ngọc biển nông | Nước sát bờ, mép suối | Dải gần bờ |
| `seaDeep` | `#1E6F8E` | Lam biển sâu | Biển xa, lòng suối | Mảng nước rộng |
| `grass` | `#7BA44A` | Xanh cỏ | Đồi, cỏ, pha lá/rêu | Mảng đất xanh chủ đạo |
| `grassDry` | `#C4B866` | Cỏ khô vàng | Đồi khô, lá rụng, pha hemi nền | Mảng phụ xen xanh |
| `rock` | `#8C8476` | Đá xám nâu | Đá, vỏ cây, sỏi lề đường | Mảng vật thể và địa hình |
| `rockDark` | `#5A554E` | Đá tối | Mặt khuất đá, vỏ cây, gỗ | Mảng tối cục bộ |
| `sand` | `#DCCDA6` | Cát ấm | Bờ biển, sỏi/cát lề đường | Dải ven bờ |
| `asphalt` | `#4B4D52` | Nhựa đường | Lòng đường, pha mảng vá | Dải dẫn đường |
| `laneYellow` | `#E4C24C` | Vàng vạch đường | Vạch giữa đường | Nét hẹp |
| `laneWhite` | `#EDEDE6` | Trắng vạch đường | Vạch mép, pha nhựa bạc màu | Nét hẹp; màu pha |

- Nguồn chỗ dùng hiện hành: `src/features/world/art/direction.ts`, `materials/ramp.ts`, `sky/grade.ts`, `sky/dome.ts`, `foliage/shapes.ts`, `foliage/ground.ts`, `road/surface.ts`, `road/posts.ts`, `water/material.ts`, `vehicle/mesh.ts` (các đường dẫn rút gọn đều dưới `src/features/world/`); `tools/assets/blender/character.py`.
- Ngoại lệ tồn tại trong asset cũ: màu da/vải của nhân vật và kim loại xe nằm ngoài PALETTE; xem [character.md](character.md), [gd110.md](gd110.md). Đây không phải màu mới được cấp cho môi trường.
