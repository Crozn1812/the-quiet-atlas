# ADR 0017: Thu ngắn tuyến đi bộ

- Trạng thái: **Accepted** (2026-11-13). Duy, playtest vòng 2 (2026-11-12): "Map quá dài và rộng khi đi bộ → thu ngắn cho dễ tiếp cận". Lead chọn con số cụ thể theo quyền art/kỹ thuật (ADR 0012). Duy chỉnh lại được sau playtest.
- Thay spec V6 §7.1 (hành trình 5–7 phút) và mục tiêu thời gian tới từng khu ở §2.1. Đây là quyết định của chủ dự án; không phải nới ngưỡng sau khi đo thất bại.

## Quyết định

Đo theo tuyến chính, đi bộ 3 m/s, không sprint, không dừng đọc, không cinematic (cách đo cũ của §7.1):

| Chỉ số | Trước | Mới |
|---|---|---|
| Cả tuyến First Light → Last Postcard | 370 s (300–420) | **200–240 s** |
| Tới Workshop | 52 s (45–60) | **25–45 s** |
| Tới Roots, Milestones | ≤ 90 s | **≤ 60 s** |
| Khoảng cách giữa hai khu | ≥ 25 m | giữ ≥ 25 m |

- Thu cả chiều dài và chiều ngang. Tỷ lệ phải lấy từ **một hằng số kích thước world**, không rải số tuyệt đối (−900, 760, 680…) trong terrain, biển, sương, phong cảnh xa.
- Giữ nguyên thứ tự 8 khu, ba biome, cách chuyển bình minh → hoàng hôn theo tiến độ tuyến, hai cầu, đường nhựa ven biển, biển chỉ đường dịch chuyển và Sổ Atlas.
- Không đổi tốc độ đi bộ và chạy.

## Hệ quả

- Ticket MAP-01 làm một mình (dời vị trí mọi khu), sau khi các ticket vòng 2 đã merge.
- Test `layout.test.ts` đổi theo bảng trên. Bằng chứng đi bộ phím thật (RC-01: 367,91 s) phải đo lại.
- Tổng world có thể nhẹ hơn (ít ô terrain). Ngân sách ADR 0015 giữ nguyên.

## Cập nhật 16/11: Duy chấp nhận số đo đi bộ thật

Bot đi phím thật (B2-210) trên main bb4f4de đo cả tuyến 242,61 s, lố mục tiêu 200–240 s 2,6 s; Workshop 36,9 s, Roots 48,9 s, Milestones 59,7 s đạt, 0 lần kẹt. Duy chấp nhận kết quả này ("nếu vậy thì pass", Q-52). Tuyến giữ nguyên. Ngưỡng trong test giữ đúng bảng trên, nên test vẫn báo FAIL ở mục tổng; báo cáo ghi "FAIL theo test, Duy chấp nhận".
