## TICKET B2-243: dải sông không đè lên biển ở cửa sông (sửa gốc)

- Đọc `_review-common.md` (cổng 4193), B2-236 (`cinematic/estuary.ts`, mặt nạ chỉ trong ending), B2-240 (phần ghi chú Lead: bài học `riverSeaJoinT` theo trục z làm **mất suối ở Horizon**).
- Được sửa: `src/features/world/water/ribbon.ts`, `src/features/world/cinematic/estuary.ts` + dòng gọi nó trong `index.ts` (chỉ để gỡ), test sông/nước.
- Việc: ribbon sông dừng/hoà vào biển **chỉ tại cửa sông thật** (đoạn cuối gần `t=1`, nơi địa hình hai bờ xuống dưới mực biển hoặc nơi ribbon nằm trong đa giác mặt biển nhìn thấy), không cắt theo trục z. Không vẽ đè lên biển lúc chơi lẫn trong ending; sau đó gỡ mặt nạ `estuary`.
- Test: unit — mọi hàng ribbon có `t < 0.95` giữ nguyên đỉnh như hiện tại (suối đi qua Horizon/Old Trail không đổi); không đỉnh ribbon nào nằm trên vùng biển nhìn thấy. Ảnh: 8 khu (đặc biệt Horizon có suối), ending 26/31/34,5 s.
