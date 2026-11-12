# ADR 0015: Bỏ trần 8 MB lúc bắt đầu chơi để nâng đồ họa

- Trạng thái: **Accepted** (2026-11-12). Duy: "không cần giới hạn 8 MB, bỏ giới hạn để giải quyết đồ họa".
- Thay một phần spec V6 §8 và ADR 0014 mục 2 (quyết định của chủ dự án, không phải nới ngưỡng sau khi đo thất bại).

## Quyết định

1. Bỏ gate **3D bytes từ Enter World tới lúc chơi được ≤ 8 MB**:
   - `tools/load-budget` (`worldToPlayableBytes: null`) chỉ ghi số đo, không còn chặn;
   - `tools/assets/budgets.json` (`startBytes: null`).
2. **Giữ nguyên** các gate sau:
   - thời gian tới lúc chơi được ≤ 10 s (spec §8, mạng 10 Mbps / RTT 100 ms, lấy lần xấu nhất trong 3);
   - trang Welcome/Quick: tải ban đầu ≤ 1 MB, JS ≤ 150 KB, không có request 3D trước Enter World;
   - FPS Low trên Iris Xe (T08/T09);
   - tổng world ≤ 30 MB, cho tới khi Duy quyết khác.
3. Asset nặng (mô hình Blender/Poly Haven, texture PBR, HDRI) ưu tiên nạp **sau** khi đã chơi được (deferred), để giữ được mốc ≤ 10 s.
4. Trần tam giác và byte của từng loại asset (`asset-budgets.md`) chuyển thành mức tham khảo. Ticket đồ họa ghi rõ số đo trước/sau.

## Hệ quả

- Báo cáo `load-budget` vẫn in số byte để theo dõi.
- Nếu thời gian tới lúc chơi được hoặc FPS trên Iris Xe vượt ngưỡng, Lead báo Duy kèm số đo; không tự nới.
