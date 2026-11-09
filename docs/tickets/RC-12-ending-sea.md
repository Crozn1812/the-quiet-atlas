## RC-12 — Mặt biển phủ hết khung cinematic
- Trạng thái: review (chưa commit/merge; chưa xác nhận hình sau sửa).
- Vùng file: src/features/world/water/sea.ts; tests/unit/world/water.test.ts, sea-sunset.test.ts.
- Bằng chứng trước: showcase35 ui-audit vi-ending-1794239751028.png và vi-ending-1794239759160.png có mảng xanh/tối lớn ngoài mặt biển; Ending mở camera far2000m nhưng quad biển cũ chỉ rộng800m, offshore800m.
- Giả thuyết: camera nhìn ra ngoài quad khiến lớp terrain chìm ở xa lộ ra. Chỉ được xác nhận sửa thị giác sau Lead render/xem ảnh.
- Sửa: SEA_RENDER_SIZE=6000 mở rộng geometry ngang6000m và offshore6000m, giữ nguyên mép inland250m. SEA_SIZE=800 chỉ phạm vi shore sampling như trước; không đổi109 mẫu, UV, normal, shader, clock hay chất lượng.
- Vẫn4 vertex/2 triangle/1 draw. Uniform shoreline fingerprint trước sửa (SHA256 của bounds+109 packed samples): fe664ac28b02b01c1055b02a57b351ea925165d1194ec046cbf2883d22608f39. Unit giữ chính xác fingerprint này.
- Unit mới: footprint seaward2000m từ3 điểm routevenbiển; raycast actual ending camera17/23/29/31s ở1600×900, có ray đi vào phần cũ chưa phủ. Thay expected geometry bounds trong test cũ có chủ đích, không đổi trần2 triangle.
- Đã chạy: water+sea-sunset95/95PASS, ESLint0warning/typecheck/diffcheck exit0. Worker không build/browser/CPU.
- Lead cần: chụp/xem ending từ tiếp cận ghế đúng, ảnh High8khu+luma và CPU khi kiểm bản tích hợp. Không ghi PASS hình ảnh hay hiệu năng từ unit.
