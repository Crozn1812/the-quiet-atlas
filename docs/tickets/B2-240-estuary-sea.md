## TICKET B2-240: cửa sông và biển ở Last Postcard lúc chơi

- Đọc `_ux-common.md`, `_dirA-common.md`, `docs/art-bible/lighting.md` (biển hoàng hôn), B2-236 (`src/features/world/cinematic/estuary.ts`: mặt nạ chỉ dùng trong ending).
- Được sửa: `src/features/world/water/*` (ribbon, sea, surface, material), `src/features/world/cinematic/estuary.ts` (gỡ bỏ nếu không còn cần), test liên quan. **Không** sửa `src/features/world/index.ts` trừ khi gỡ `estuary` (chỉ các dòng gọi nó).
- Công cụ duyệt: build + `node tools/serve-out/index.mjs out --port 4183`; `node tools/review/ingame-shots.mjs <dir> http://127.0.0.1:4183 vi` (khung `ingame-last-postcard`, `ingame-quiet-shore`); `node tools/review/ending-shots.mjs <dir> http://127.0.0.1:4183`.

### Hiện trạng
`docs/showcase/29-hoan-thien/hien-trang/last-postcard-gameplay.webp`: biển là mảng xanh chàm phẳng; mép trái có **vùng tối hình mép đất chìm dưới nước** và dải tối của ribbon sông cuối chồng lên biển. B2-236 tìm ra: ribbon sông rộng ở đoạn cuối nằm vài cm trên mặt biển, và mẫu bờ `z(x)` của biển không biểu diễn được mũi đất hai phía nên chiếu thành "bóng đất giả". Hiện chỉ được che trong ending.

### Việc
1. Ribbon sông kết thúc/hoà dần (alpha hoặc cắt hình học) tại đường bờ biển; không vẽ đè lên biển.
2. Bờ biển quanh mũi đất Last Postcard: sửa dữ liệu/shader bờ (`uHasShore`) để không còn bóng đất giả; giữ bọt/viền bờ ở chỗ có bờ thật.
3. Sau khi sửa gốc, gỡ mặt nạ `estuary` của ending nếu không còn cần.
4. Biển lúc chơi ở Last Postcard/Quiet Shore: thấy chuyển sắc chàm → cam về phía mặt trời (B2-239 đã thêm cho grade; kiểm tra hiện trên khung gameplay nhìn xuống).

### Test
- Unit: không đỉnh ribbon sông nào nằm ở vùng biển (ngoài `SEA_INLAND_OVERLAP`); shader bờ không cho "đất" tại các điểm biển sâu quanh mũi đất (lấy mẫu).
- Bàn giao: ảnh gameplay Last Postcard + Quiet Shore + ending 31 s trước/sau, luma (`luma.mjs`).
