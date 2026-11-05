# Cách vẽ chất liệu

- Chuẩn chung: hình khối vừa phải, vát mép, silhouette có biến thể; dùng ramp mềm và vertex color, không ảnh vật liệu, không PBR kim loại (`docs/tickets/_dirA-common.md`, `_asset-common.md`).
- Bảng là chỉ dẫn art gắn với code hiện có, không xác nhận mọi chi tiết đã sản xuất. Màu ghi bằng khóa [PALETTE](palette.md); định lượng ngân sách theo [asset-budgets.md](asset-budgets.md).

| Chất liệu | Màu / biến màu | Chi tiết hình học và cách đọc | Nguồn đối chiếu |
|---|---|---|---|
| Lá | `forestLight`, `forestDeep`, `grass`; tán sâu dùng xanh đậm, sáng đổi theo chiều cao | Cụm lá nhỏ, chồng lệch, mép không đều, cành cong và dây rủ; tránh khối lục giác đồng dạng. Thông thân cao, tán tập trung trên ngọn | `src/features/world/foliage/shapes.ts`, `instances.ts`; `docs/tickets/_asset-common.md` |
| Vỏ cây | `rock` pha `rockDark`, chút `dusk`; gốc nhận xanh rêu | Thân thuôn hơi cong, cành phân nhánh, vát/mặt khối đọc là gỗ xám nâu, không cột đen | `src/features/world/foliage/shapes.ts`, `mossColor`, `createTreeTrunk`; `art/direction.ts`, R |
| Rêu | `forestDeep` pha `grass`; độ phủ giảm theo chiều cao và tăng ở mặt ẩm | Mảng vertex color bám gốc và mặt hướng lên, không thêm vỏ hình học trùm đều vật | `src/features/world/foliage/shapes.ts`, `mossColor`; `foliage/ground.ts`, `createRock` |
| Đá | `rock`, `rockDark`; rêu dùng `grass`/`forestDeep` | Mặt vỡ và cạnh sáng, silhouette méo theo seed; tảng lớn và đá nhỏ có độ khối khác nhau, không cầu tròn nhẵn | `src/features/world/foliage/ground.ts`, `createRock`; `docs/tickets/_asset-common.md` |
| Gỗ | `rock`, `rockDark`, pha `dusk` tiết chế; rêu xanh ở chỗ ẩm | Thớ gợi bằng dải màu/hình học nông, cạnh vát, đầu gãy; ghế/hàng rào phải đọc là gỗ. Khúc gỗ nền hiện tái dùng geometry đá kéo dài, chưa phải mẫu thớ hoàn chỉnh | `src/features/world/foliage/shapes.ts`, `mossColor`; `foliage/ground.ts`, `createGroundDetails`; `docs/tickets/_asset-common.md` |
| Cỏ | Gốc `forestDeep`, đầu `forestLight` pha `grass`; đất đồi `grass`/`grassDry` | Phiến thuôn gập cong thành cụm; phân bố thành mảng có khoảng trống, dùng instancing thay thảm kín đồng đều | `src/features/world/foliage/ground.ts`, `createGrassTuft`; `art/direction.ts`, R |
| Cát | `sand`, chuyển sang `rock` ở sỏi và `grass`/`grassDry` ở mép đất | Dải địa hình thấp với bờ không đều, biến màu rộng; tránh dựng từng hạt | `src/features/world/road/surface.ts`, `roadSurfaceColorAt`; `docs/tickets/_dirA-common.md` |
| Nhựa đường | `asphalt` pha `laneWhite` cho mặt bạc màu; `laneYellow` giữa, `laneWhite` mép | Vệt bánh/mảng vá bằng màu thủ tục, lề sỏi chuyển sang cỏ; không gờ bóng hay phản chiếu gương | `src/features/world/road/surface.ts`, `road/geometry.ts` |
| Nước | `seaShallow`/`seaDeep`; suối pha `forestLight`, nắng pha `sunGold`/`flower`, xa phản chiếu chân trời | Dải suối cong, biển theo bờ; gợn và phản chiếu mềm bằng shader, không thêm texture/render target. Nhận màu và cường độ grade là yêu cầu B2-181 còn phải hoàn tất | `src/features/world/water/material.ts`, `water/ribbon.ts`, `water/sea.ts`; `docs/tickets/B2-181-water-follows-light.md` |
| Mây | `cloud` nhận `sunColor`, đáy pha `skyHorizon`; nền `skyHigh`/`skyLow`, hoàng hôn thêm `indigo` | Cumulus mềm, viền nắng ấm, giữ khoảng trời xanh. Hiện vẽ noise trên sky dome, không cần mesh cho từng bông mây; mây vờn núi giữ cục bộ | `src/features/world/sky/dome.ts`; `docs/tickets/_dirA-common.md`; ADR hướng A |

- Mọi đường dẫn rút gọn trong cột nguồn đều nằm dưới `src/features/world/`. ADR hướng A là mục đổi sang Tranh chân thật của `docs/adr/0013-art-direction-painted-world-film-memories.md`.
- Cam/đỏ chỉ là chấm trên vật thể; màu ấm trong ánh sáng là phép pha grade, không phải lý do sơn cả mảng môi trường cam (`taste.md` §5.3; `src/features/world/sky/grade.ts`).
