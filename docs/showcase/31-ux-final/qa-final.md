# Kết quả cuối UX/UI — 08/11/2026

**Bản mã được kiểm tra:** main `7774ae8` (UI tại `f20147d`, sửa pause và locator tại `7774ae8`). Chưa push.

## Kết quả thực tế

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Strict gate trên main | PASS — lint 0 warning, typecheck, 1.697/1.697 unit | `test-results/ux-final/gate-{lint,tc,unit}-final.txt` |
| Production build sau merge | PASS | `test-results/ux-final/build-final-clean.txt` |
| Full e2e sau sửa | PASS — 151/151, 4,2 phút, exit 0 | `test-results/ux-final/e2e-final-clean.txt` |
| Audit UI tổng thể | PASS — 12/12, axe 0 critical/serious, focus trap và reflow | [ux-audit.json](ux-audit.json) |
| Welcome VI/EN, desktop/390/320 px | PASS — 6/6 audit trước merge | [Ảnh Welcome](welcome-contact.webp) |
| Overlay mobile | PASS — 4 khu đại diện, axe 0 critical/serious, nút Đóng khi cuộn | [Ảnh overlay](overlays-mobile-contact.webp), [review](review.md) |
| Tài nguyên và license | PASS — 8 ảnh khu đều dưới 60.000 byte; hero 57.032/22.232 byte | `assets/LICENSES.csv`, [ảnh 8 khu](postcards-contact.webp) |
| CPU gameplay | PASS — 2 lần mỗi bản, cùng Balanced và thời gian CDP thực; chênh −1/−7/−17 ms/s | [pause-fix.md](pause-fix.md) |
| Tải lạnh | PASS — 3 lần mỗi ngôn ngữ, 2/2 locale; worst 5,337 s, đạt cả gate 10 s và mục tiêu 6 s | [EN](load-en.md), [VI](load-vi.md), `test-results/ux-final/load-final.txt` |
| Lighthouse | PASS — 15 lượt / 3 URL, exit 0, không có assertion lỗi hoặc cảnh báo; accessibility 100 cả 15 lượt | [Tóm tắt 15 lượt](lhci-summary.json), `test-results/ux-final/lhci-final.txt` |

Lighthouse dùng **median-run đại diện do LHCI chọn** theo cấu hình, không lấy trung bình hay chọn riêng số đẹp của từng metric:

| Trang | LCP (ms) | TBT (ms) | CLS | Performance / Accessibility |
|---|---|---|---|---|
| Welcome EN | 2375,01 | 70 | 0,01829 | 98 / 100 |
| Quick EN | 1802,94 | 47 | 0,04453 | 99 / 100 |
| Case study | 2202,68 | 49 | 0,00932 | 99 / 100 |

Ngưỡng giữ nguyên: LCP ≤ 2500 ms, TBT ≤ 200 ms, CLS ≤ 0,1. LCP xấu nhất từng URL 2383,14 / 2209,70 / 2219,97 ms; TBT xấu nhất 78 / 59 / 67 ms, cũng trong ngưỡng. TBT là proxy lab, không phải INP đo từ người dùng thật. Toàn bộ 15 HTML/JSON và manifest nằm tại `test-results/lhci/`; upload chỉ filesystem. Healthcheck thiếu GitHub token không ảnh hưởng phép đo local và không cần cấp token.

## Lỗi đã sửa, không che kết quả cũ

Tải lạnh trên Edge / desktop RTX 3060: world tới playable 2.163.481 byte / 8 MiB; Welcome JS 140.811 byte, Quick JS 137.943 byte. Tổng tải ban đầu lớn nhất Welcome 248.733 byte, Quick 189.793 byte; 0 request 3D trước Enter World. Đây là số đo mạng thực (có thể khác tổng gzip bundle tĩnh), không thay cho T08/T09 trên Iris Xe.

Lượt e2e đầu trên `f20147d` có 149 PASS / 2 FAIL. Đã sửa locator khoảng trắng nhưng giữ đủ tên khu/chủ đề/trạng thái; sửa world dựng thêm chi tiết nền khi Menu mở bằng pause queue và giữ khung render. Phép thử ảnh tạm dừng vẫn so từng byte. Cả hai đã đạt trong full suite cuối 151/151.

Số đo CPU ban đầu không pin chất lượng có Roots +18,5 ms/s và không được ghi PASS. Đo đối chiếu có kiểm soát giữ nguyên ngưỡng +10 ms/s; lưu cả log cũ và log mới.

## Phạm vi nghiệm thu

Năm vai cuối đợt: tài nguyên/markup, e2e, đối chiếu báo cáo, load-budget, Lighthouse. Giới hạn hệ thống là 3 subagent cùng lúc với root; browser/GPU/perf chạy lần lượt để không nhiễu. Đây là QA trên desktop dev, không thay thế benchmark Iris Xe hoặc đánh giá thẩm mỹ/người dùng thật.

- T10 / playtest người thật: DEFERRED, Duy chấm theo [checklist](checklist.md).
- T08/T09 Iris Xe: NOT RUN.
- Không có cloud resource hoặc thao tác push trong đợt này.
