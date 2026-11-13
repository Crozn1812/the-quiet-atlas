# GFX-P1 — trả lại lượt 2 (lượt cuối)

Load-budget và GPU 43/43 đạt. Còn một chỗ chặn merge: **config e2e mặc định (SwiftShader) là config CI**, nên 2 timeout `data-world-build` "pending" sau 90 s = gate A đỏ. Main hiện qua các test này trên SwiftShader.

Sửa:
- `data-world-build="done"` không được chờ asset hay việc nào của hướng C: tải HDRI, tạo PMREM/IBL, compile shader hậu kỳ, shadow map. Tất cả chạy **sau** khi world đã done (deferred), và có thể hủy khi tab ẩn hoặc quality đổi.
- Ở **Low** (kể cả khi tự hạ xuống Low): không tải HDRI, không tạo PMREM, không bóng, không post; render thẳng như main.
- Nếu PMREM nặng: tạo một lần, cache, không tạo lại khi đổi giờ trong ngày (trộn hai env đã có).
- Không nới timeout, không đổi config Playwright.

Điều kiện xong: e2e world `--workers=2` bằng **config mặc định** (SwiftShader) 43/43 PASS (dán output), kèm lại load-budget EN/VI. Được thêm một lần build. Gate PASS. Không commit; cập nhật HANDOFF.
