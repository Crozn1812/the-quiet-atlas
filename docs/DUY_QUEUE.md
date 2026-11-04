# Hàng đợi việc của Duy

Mỗi dòng là một việc Duy cần làm hoặc trả lời. Việc chặn A1 nằm trên đầu. Lead cập nhật cuối mỗi đợt; mục đã xong chuyển xuống "Đã xong".

## Đang chờ

| ID | Việc | Lane chờ | Chặn milestone? | Hạn đề xuất | Hướng dẫn |
|---|---|---|---|---|---|
| Q-01 | **LinkedIn URL**: CV gửi ngày 2026-11-04 không có LinkedIn. Gửi URL, hoặc trả lời "không dùng" | L2 | A1 (mục liên hệ) — không chặn cứng, đang để TBD | Đợt 11 | Copy URL hồ sơ LinkedIn công khai |
| Q-02 | **CMS DevOps Platform (DO2603)**: có repo GitHub/demo công khai không? "DO2603" là mã khóa học/chương trình nào, làm một mình hay nhóm, thời gian? | L2 | A1 (case study CMS) | Đợt 11 | Trả lời 3 ý; không có repo thì ghi "không có" — case study sẽ để mức bằng chứng thấp hơn |
| Q-03 | **Duyệt câu giới thiệu**: 3 phương án A/B/C (EN + VI) ở `content-private/drafts/intro.md`; L2 đề xuất A. Ghi "sinh viên Mạng" hay "Network and Systems Engineer"? | L2 → L1 | A1 | Đợt 11 | Chọn A/B/C hoặc sửa chữ |
| Q-12 | **Trạng thái từng dự án** (đề xuất: PDG đang làm; RAG đang làm hoặc lưu trữ; AWS hoàn thành hoặc lưu trữ; CMS TBD) | L2 | A1 | Đợt 11 | Chọn 1 trạng thái/dự án |
| Q-13 | **PDG tên gọi**: "Partner Data Gateway Azure" hay "Secure Partner Data Sharing Portal" (tên trong CV)? Web, CV, AI phải giống nhau | L2 | A1 | Đợt 11 | Chọn 1 |
| Q-14 | **PDG mâu thuẫn trong tài liệu**: (a) slide ghi "Partner A không xem dữ liệu Partner B" đã đạt, slide khác ghi kiểm thử phân tách A/B chưa xong; (b) CV ghi đã làm key rotation/revoke, slide ghi quy trình chưa xong. Cái nào đúng? | L2 | A3 | Đợt 11 | Trả lời từng ý |
| Q-15 | **PDG công bố**: ai ở HPT duyệt nội dung public? Được nhắc giai đoạn 2 (Kong/on-prem) không? Repo demo có từ trùng tên list nội bộ — đổi tên repo trước khi public? README demo có vẻ bị cụt | L2 | A3 | Trước A3 | Trả lời + (tuỳ) đổi tên repo trên GitHub |
| Q-16 | **AWS Sales Pipeline**: CV ghi EventBridge kích hoạt xử lý, README ghi S3 kích hoạt Lambda — cái nào đúng? "Shopmart" là dữ liệu giả hay doanh nghiệp thật? | L2 | A1 | Đợt 11 | Trả lời 2 ý |
| Q-17 | **InsightHub RAG**: có 2 bối cảnh (môn CSDL — nhóm, Duy trưởng nhóm; và fork từ `congdinh2008/insighthub`). Case study trình bày bối cảnh nào? Phần nào Duy tự viết? Ghi công repo gốc được không? | L2 | A1 | Đợt 11 | Trả lời 3 ý |
| Q-18 | **CMS**: ngoài slide có bằng chứng nào (ảnh chụp đã che thông tin, video demo)? (gộp với Q-02) | L2 | A1 | Đợt 11 | Gửi file hoặc "không có" |
| Q-19 | **Cài Terraform** trên máy dev để L5 chạy `terraform validate` (chỉ validate, không apply) | L5 | A2 | Trước A2 | Đồng ý thì Lead cài bằng winget (bản ổn định) |
| Q-20 | **AWS bảo mật tài khoản**: bật MFA root, xác nhận không có access key root, tạo user dùng hằng ngày | L5 | A2 | Khi có credit | `docs/runbook/aws-account-and-credits.md` bước 4–7 |
| Q-04 | **Duyệt từng trang** (Welcome, Quick EN/VI, 4 case study, CV) trước khi gỡ nhãn Draft | L2 | A1 → A3 | Sau đợt 10–11 | Lead gửi link xem thử local + danh sách chỗ cần xác nhận |
| Q-05 | **Partner Data Gateway — giới hạn công bố**: Lead đề xuất KHÔNG công bố tên nội bộ (site/list SharePoint, tên phòng ban, mã khu vực), chỉ mô tả kiến trúc + kết quả PoC. Đồng ý? | L2 | A3 | Đợt 11 | Trả lời "đồng ý" hoặc liệt kê thứ được/không được nêu |
| Q-06 | **Xác nhận cách hiểu câu trả lời 13–16** ngày 2026-11-04 (xem bảng dưới) | Lead | Không | Khi tiện | Trả lời "đúng" hoặc sửa |
| Q-07 | **Budgets**: đề xuất 1 budget 10 USD/tháng, cảnh báo thực chi 1/5/10 USD + dự báo 10 USD. Đồng ý? Paid plan chỉ nâng khi giao A2 (hạn cứng: ngày đăng ký + 6 tháng) | L5 | A2 | Trước mọi resource | `docs/runbook/aws-budgets.md`, `aws-paid-plan.md` |
| Q-08 | **Ngày đăng ký AWS + số credit + ngày hết hạn credits** — khi tài khoản mới được cấp credit | L5 | A2 | Khi có | `docs/runbook/aws-account-and-credits.md` bước 1–3 |
| Q-09 | **Tên miền**: chưa mua. Khi nào mua, đuôi nào? Ghi giá gia hạn trước khi trả tiền; chưa tạo hosted zone | L5 | A2 (Q24) | Trước A2 | `docs/runbook/domain-and-acm.md` bước 1 |
| Q-10 | **Laptop iGPU** để nghiệm thu T08: có hay không? (chưa trả lời) | L3 | B1 — không chặn (ADR 0007 dùng máy dev có nhãn) | Khi tiện | Ghi CPU/iGPU/RAM/màn hình/OS/trình duyệt |
| Q-11 | **Bản thu đàn** cho âm thanh world (B2): "có" — khi nào gửi file, định dạng gốc? | L3 | B2 | Trước B2 | WAV/FLAC gốc; Duy giữ bản quyền |

### Cách Lead hiểu câu trả lời ngày 2026-11-04 (cần xác nhận — Q-06)

| Số Duy ghi | Lead hiểu là | Câu trả lời |
|---|---|---|
| 9 | AWS (tài khoản) | Đã tạo tài khoản mới, đang chờ credit free |
| (ảnh) | Repo GitHub | `github.com/Crozn1812/the-quiet-atlas`, public, đã tạo |
| 10 | Tên miền | Chưa mua |
| 11 | Font tự host + sự kiện ngôn ngữ world | Đồng ý |
| 12 | Art (B2) | Nhân vật là Duy; xe GD110 trắng, ghi-đông scrambler cao; ảnh tham khảo = mood |
| 13 | AI: ngân sách model | < 5 USD/tháng (có trừ vào credits không: chưa rõ) |
| 14 | AI: log câu hỏi ẩn danh | Có |
| 15 | Bật thống kê lượt xem tổng hợp | Có |
| 16 | Dùng staging riêng | Có |

## Đã xong

| ID | Việc | Ngày |
|---|---|---|
| D-01 | Câu giới thiệu: Lead soạn | 2026-11-04 |
| D-02 | Được nêu tên HPT công khai | 2026-11-04 |
| D-03 | Tài liệu PDG (docx + pptx), CMS (pptx), InsightHub (pptx), CV (pdf) — lưu ngoài repo | 2026-11-04 |
| D-04 | Nội dung dự án: Lead/L2 soạn nháp từ README + tài liệu, Duy duyệt | 2026-11-04 |
| D-05 | Điện thoại: theo CV, hiện cả web | 2026-11-04 |
| D-06 | Duyệt từng trang trước khi gỡ Draft | 2026-11-04 |
| D-07 | Repo GitHub `Crozn1812/the-quiet-atlas` (public) | 2026-11-04 |
| D-08 | Tổ chức 5 lane từ đợt 10 | 2026-11-04 |
