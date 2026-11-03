# ADR 0007 — Máy tham chiếu cho benchmark (T08)

- Trạng thái: **Accepted** (Duy đồng ý 2026-11-04)
- Spec: §8, §13.1 T08, §16.3 P01-B, §17 ("Trước P01-B")
- Ghi **trước** mọi benchmark T08 — §8 cho phép sửa phương pháp bằng quyết định ghi rõ trước khi đo.

## Bối cảnh

§8 thiết kế ngân sách quanh một laptop dùng GPU tích hợp (iGPU). Duy không có máy như vậy. Máy có sẵn:

| Thành phần | Giá trị |
|---|---|
| CPU | Intel Core i5-14400F (không có iGPU) |
| GPU | NVIDIA RTX 3060 12 GB (GPU rời) |
| RAM | 36 GB |
| Lưu trữ | SSD 512 GB |
| Màn hình, OS build, trình duyệt/phiên bản | TBD — ghi lúc đo |

## Quyết định

1. Máy desktop trên là **máy tham chiếu chính thức của T08**, gắn nhãn **"desktop dGPU RTX 3060"** trong mọi kết quả. Không gọi là "máy iGPU".
2. Mọi tuyên bố hiệu năng công khai ghi rõ máy đo; không viết "chạy mượt trên laptop".
3. **Không nâng ngưỡng §8.** Vì máy mạnh hơn mục tiêu gốc, ngưỡng giữ nguyên là mức tối thiểu; FPS cao trên máy này không chứng minh trải nghiệm tốt trên laptop phổ thông.
4. Giảm rủi ro cho người xem dùng laptop yếu:
   - Mỗi lần đo T08 ghi thêm số liệu ở chất lượng **Low** với DPR 1.0 và CPU throttling 4× của DevTools (nhãn "mô phỏng máy yếu", chỉ tham khảo, không phải gate).
   - Ngân sách tải (§8: ≤ 8 MB bắt đầu chơi, ≤ 30 MB toàn world, time-to-playable với mạng giả lập 10 Mbps/RTT 100 ms) không phụ thuộc GPU nên vẫn là gate đầy đủ.
   - Fallback HTML (Q15) và adaptive quality vẫn bắt buộc.

## Hệ quả

- T08 chuyển từ **BLOCKED** sang **NOT RUN** (đo được khi tới P01-F).
- Bỏ chặn P01-B.

## Xem xét lại khi

- Có laptop iGPU để mượn/thuê đo — khi đó chạy thêm T08 trên máy đó và báo song song.
- Người thử (Q22) báo giật trên laptop thật.
