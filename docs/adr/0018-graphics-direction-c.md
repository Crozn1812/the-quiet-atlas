# ADR 0018: Hướng đồ họa C (gần thực)

- Trạng thái: **Accepted** (2026-11-13). Duy chọn "C" sau khi xem bảng so sánh A/B/C (`docs/showcase/37-aaa/abc-sheet.webp`, GFX-01). Lead đề xuất B; Duy chọn C.
- Thay một phần ADR 0013 (bức tranh vẽ) và hướng R1 (khối mặt phẳng): world chuyển sang gần thực. **Giữ** bảng màu bình minh → hoàng hôn, suối là trục, ký ức là ảnh film, overlay tạp chí.

## Quyết định

- **Vật liệu:** PBR từ **ảnh texture CC0 thật** (Poly Haven, ambientCG), không procedural. KTX2: High 2K, Balanced 1K, Low 512. Chống lặp texture (triplanar hoặc trộn 2 tỷ lệ + biến thiên màu theo vùng).
- **Ánh sáng:** IBL từ HDRI CC0, bóng đổ mềm (CSM hoặc PCF), AO (GTAO), bloom nhẹ, color grading theo taste brief.
- **Cây:** mô hình CC0 (kho `public/world/lib`, GFX-02), lá **alpha-cutout có translucency**, tán khối nhiều lớp. Không còn lá thành tấm phẳng.
- **Nước:** phản chiếu trời + Fresnel, suối và biển.
- **DOF nhẹ:** chỉ High; tắt khi người chơi điều khiển nếu làm mờ đường đi.
- **Chất lượng:** Low = không hậu kỳ, texture 512, không bóng, phải giữ T08 trên Iris Xe. Balanced/High tăng dần.

## Ngân sách (giữ ADR 0015)

- Thời gian tới lúc chơi được ≤ 10 s; **asset C nạp deferred** sau khi chơi được.
- **Tổng world ≤ 30 MB.** C High lúc spike là +12,69 MB: phải nén, chọn lọc để còn trong trần.
- CPU ≤ main + 10 ms/s (ABBA). Tam giác C spike +49 % so với A: dùng LOD và cull.

## Hệ quả

- Đợt sản xuất GFX-P* (`docs/tickets/GFX-PROD.md`), chia theo hệ: hậu kỳ/ánh sáng, vật liệu đất-đá, cây, nước, rồi từng khu.
- Duy chấm một lần khi đồ họa hoàn thành.
