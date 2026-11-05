# Ngân sách asset

- Trần dưới đây là ngân sách, không phải số asset đã đo. Áp dụng trần chặt hơn khi các nguồn khác nhau; không tăng trần để hợp thức hóa kết quả trượt.

| Loại / mỗi biến thể | Tam giác tối đa | Byte tối đa nếu nguồn có | Nguồn |
|---|---|---|---|
| Cây lá rộng | `1 500` | `60 000` (loại `tree`) | `docs/tickets/_asset-common.md`; `tools/assets/budgets.json` |
| Thông | `1 200` | `60 000` (loại `tree`) | `docs/tickets/_asset-common.md`; `tools/assets/budgets.json` |
| Bụi / dương xỉ | `300` | Chưa có trần byte riêng | `docs/tickets/_asset-common.md` |
| Cỏ | `60` | Chưa có trần byte riêng | `docs/tickets/_asset-common.md` |
| Đá nhỏ | `200` | `20 000` (loại `rock`) | `docs/tickets/_asset-common.md`; `tools/assets/budgets.json` |
| Tảng lớn | `400` | `20 000` (loại `rock`) | `docs/tickets/_asset-common.md`; `tools/assets/budgets.json` |
| Gỗ: khúc gỗ, ghế, hàng rào mỗi nhịp | `600` | Chưa có trần byte riêng | `docs/tickets/_asset-common.md` |
| Prop khu / mỗi cụm | `2 000` | `80 000` (loại `prop`) | `docs/tickets/_asset-common.md`; `tools/assets/budgets.json` |
| Nhân vật | `12 000` | `600 000` | `tools/assets/budgets.json`; `tools/assets/blender/character.py` |
| Xe | `8 000` | `400 000` | `docs/tickets/_asset-common.md`; `tools/assets/budgets.json` |

- Đơn vị file: `KB = 1 000 byte`, `MB = 1 000 000 byte` (`tools/assets/budgets.json`). Các loại không có trần byte riêng vẫn nằm trong tổng tải world; không tự tạo hạn mức mới.

| Gate world | Trần / điều kiện | Nguồn |
|---|---|---|
| Bắt đầu chơi | ≤ `8 MB` nén, gồm runtime/decoder/asset cần | `tools/assets/budgets.json` (`startBytes=8 000 000`); `docs/spec/The_Quiet_Atlas_Master_Prompt_V6.md` §8 |
| Cả tuyến world | ≤ `30 MB` nén | `tools/assets/budgets.json` (`worldBytes=30 000 000`); spec §8 |
| Vào chơi | ≤ `6 s`; số `5,77 s` là hiện trạng được nguồn ghi, không phải đo lại ở ticket này | `docs/tickets/_asset-common.md`; `docs/tickets/B2-184-art-bible-lock.md` |
| Phương pháp tải | `10 Mbps`, RTT `100 ms`, lấy lần xấu nhất trong `3` cold load; baseline spec là ≤ `10 s`, dùng trần chặt hơn ở trên | `docs/spec/The_Quiet_Atlas_Master_Prompt_V6.md` §8 |
| Low FPS | Trung bình ≥ `30 FPS`; p95 frame time ≤ `50 ms`; ≤ `1%` frame > `100 ms`; không frame > `250 ms` ở đoạn ổn định | `docs/spec/The_Quiet_Atlas_Master_Prompt_V6.md` §8 |
| Phương pháp FPS | Warm-up `30 s`, tuyến `60 s`, `3` lần; đánh giá từng lần | `docs/spec/The_Quiet_Atlas_Master_Prompt_V6.md` §8 |
| Máy nghiệm thu | ASUS Vivobook Flip, i5-13500H / Iris Xe, RAM `16 GB`; cắm sạc, Balanced, tắt tiết kiệm pin | `docs/adr/0007-benchmark-reference-machine.md`, bổ sung lần cuối; desktop RTX 3060 chỉ tham khảo |
| Tổng tam giác High | Không tăng quá `25%` so với trước ticket; báo trước/sau | `docs/tickets/_asset-common.md` |
| Dựng geometry Node | Không chậm hơn bản cũ quá `20 ms` | `docs/tickets/_asset-common.md` |

- Vật lặp dùng `InstancedMesh`; module mới ≤ `4 draw call`; báo tam giác mỗi biến thể và tính cả pass khi có (`docs/tickets/_dirA-common.md`, `_asset-common.md`). Không suy ra số draw call của toàn foliage từ trần module mới.
- Có ≥ `3` biến thể hình dạng, xoay/scale/hue theo seed vị trí; không đặt bản sao giống hệt cạnh nhau; đọc được chất liệu ở `5–15 m` (`docs/tickets/_asset-common.md`). Không dùng `Math.random` lúc chạy (`_dirA-common.md`).
- Hiện trạng cần phân biệt với chuẩn sản xuất: `src/features/world/foliage/shapes.ts` có các seed biến thể thông/lá rộng; `foliage/ground.ts` vẫn có `2` seed đá và một số dạng bụi/dương xỉ đơn. Chưa thể coi mọi asset đã đạt chuẩn biến thể (`src/features/world/foliage/ground.ts`, `ROCK_VARIANT_SEEDS`, `createFern`, `createBroadleafBush`).
- Hình học thủ tục TypeScript; không file ảnh hay GLB mới, trừ pipeline Blender đã có của nhân vật/xe (`docs/tickets/_asset-common.md`). Chia sẻ geometry/material, không tăng pass để thêm chi tiết.
- Tôn trọng `PATH_CLEARANCE`, nền `ZONES` cùng lề; không đặt dưới nước trừ đá ven bờ (`docs/tickets/_dirA-common.md`; `src/features/world/foliage/scatter.ts`).
- Ticket tài liệu không dựng lại asset, không đo GPU/tải mạng; lint/typecheck/unit test không chứng minh các gate hiệu năng đã đạt.
