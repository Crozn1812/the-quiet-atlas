## Trả lại vòng 1 cho G-01..G-04 (Lead, 2026-11-08)

Lead build từng worktree, chụp 8 khu ở **High** (`TQA_QUALITY=high node tools/review/ingame-shots.mjs …`, mặc định trước đây là Balanced) và intro. Ảnh: `docs/showcase/30-do-hoa/lead-review/g-r0-*.webp` (hàng 1 = main, sau đó G-01..G-04).

**Kết quả: so với main gần như không phân biệt được.** Luma 8 khu trùng tới 0,001.

`node tools/review/assets-loaded.mjs http://127.0.0.1:<cổng>` (liệt kê file world tải sau Enter World ở High):
- G-01: **không tải texture nào** → chi tiết đất không chạy lúc runtime.
- G-02: tải 6 GLB cây, nhưng mỗi cây 340 tam giác, tán gần giống cũ → khác biệt không thấy được.
- G-03: **không tải GLB props nào**.
- G-04: AO gần như vô hình (chân nhà, rào, gốc cây không tối đi rõ).

### Yêu cầu chung vòng 1
1. **Tự kiểm bằng trình duyệt** (Edge local được phép): `assets-loaded.mjs` phải liệt kê asset của ticket; `ingame-shots.mjs` với `TQA_QUALITY=high`; mở ảnh so với main. Dán danh sách asset + đường dẫn ảnh vào bàn giao.
2. Được nối tối thiểu trong `src/features/world/index.ts` hoặc `scene/compose.ts` nếu cần để asset được tải/áp dụng (ghi rõ dòng nào), ngoài ra giữ phạm vi ticket.
3. Mức thay đổi phải **thấy được bằng mắt** từ camera chơi (cách nhân vật 10–15 m) và trong intro, theo từng ticket dưới đây.

### Theo ticket
- **G-01:** texture phải tải và hiện: ở First Light/Roots/Workshop thấy rõ vân cỏ–rêu, đất lối đi có sỏi/vết, cát ven biển có hạt; biên độ chi tiết ±15–25 % độ sáng quanh màu gốc; không lộ lặp.
- **G-02:** dùng ngân sách (lá rộng ≤ 1 500, thông ≤ 1 200 tam giác): thân có cành chính nhìn thấy, tán nhiều thùy có khoảng hở, viền tán gợn; thông có tầng cành rủ. Trong intro 7/10 s và khi đứng cạnh cây phải nhận ra cây mới khác hẳn cây cũ. Chụp thêm ảnh cận: `goTo("roots")` rồi xoay camera về hàng cây.
- **G-03:** GLB phải tải và thay thế đá/khúc gỗ/ghế/rào ở các khu; chụp cận bằng `node tools/review/extras-shots.mjs` (sửa cổng) + ảnh khu Old Trail/Horizon.
- **G-04:** AO thấy được: vùng khe/chân vật tối hơn mặt đất thoáng 25–40 % (đo luma 2 vùng trên cùng ảnh), không viền quầng; bóng mềm. Ảnh cận chân nhà Workshop, rào Old Trail, gốc cây.
