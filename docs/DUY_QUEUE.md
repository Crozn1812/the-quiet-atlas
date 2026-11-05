# Hàng đợi việc của Duy

Mỗi dòng là một việc Duy cần làm hoặc trả lời. Việc chặn A1 nằm trên đầu. Lead cập nhật cuối mỗi đợt; mục đã xong chuyển xuống "Đã xong".

## Đang chờ

| ID | Việc | Lane chờ | Chặn milestone? | Hạn đề xuất | Hướng dẫn |
|---|---|---|---|---|---|
| Q-31 | **Chấm showcase đợt 17** (world hướng C, cinematic, Sổ Atlas): giữ/sửa/bỏ 6 dòng | L3 | Không | Khi rảnh | `docs/showcase/17-world-c/checklist.md` |
| Q-08 | **AWS credits**: tài khoản đăng ký sáng 2026-11-04, credit chưa duyệt. Khi duyệt: gửi số credit + ngày hết hạn | L5 | A2 | Khi có | `docs/runbook/aws-account-and-credits.md` bước 1–3 |
| Q-09 | **Tên miền đang mua**: khi mua xong, gửi tên miền, nhà đăng ký, giá gia hạn năm sau. Chưa tạo hosted zone | L5 | A2 (Q24) | Trước A2 | `docs/runbook/domain-and-acm.md` bước 1 |
| Q-20 | **AWS bảo mật tài khoản** (Duy tự làm): bật MFA root, xác nhận không có access key root, tạo user dùng hằng ngày. Xong thì báo "đã xong" | L5 | A2 | Khi có credit | `docs/runbook/aws-account-and-credits.md` bước 4–7 |

## Câu trả lời ngày 2026-11-04 (lượt 2) — Lead đã ghi nhận

| ID | Câu trả lời của Duy | Lead áp dụng thế nào |
|---|---|---|
| Q-01 | `https://www.linkedin.com/in/nguyenhuubaoduy` | L2 thêm vào liên hệ (web + CV) |
| Q-02 | Bỏ mã "DO2603"; đó là khóa **VTI DevOps**; CMS DevOps Platform là **bài tốt nghiệp khóa VTI DevOps**; làm **một mình**. Không có repo/demo công khai | L2 bỏ "DO2603" khỏi mọi nội dung; ghi bối cảnh "đồ án tốt nghiệp khóa VTI DevOps, cá nhân" |
| Q-18 | Chỉ có file (slide); VTI đã xóa toàn bộ data trên AWS sau khi nộp nên không còn demo | Case study CMS ghi rõ mức bằng chứng: tài liệu thiết kế/slide, môi trường đã gỡ |
| Q-03 | Chọn phương án **A**; ghi chức danh **"CloudDevOps Engineer"** | L2 chốt câu giới thiệu A với chức danh này (EN + VI) |
| Q-12 | **Tất cả dự án đã hoàn thành** | Trạng thái PDG, RAG, AWS, CMS = completed |
| Q-13 | Tên PDG: **"Secure Partner Data Sharing Portal"** | Web, CV, AI dùng chung tên này |
| Q-17 | Trình bày bối cảnh **bản fork**; Duy viết toàn bộ phần triển khai; repo gốc do thầy cung cấp; **chỉ ghi "InsightHub"**, không ghi tên repo gốc | Case study RAG: bối cảnh triển khai từ repo của giảng viên, không nêu `congdinh2008` |
| Q-05 | Đồng ý: không công bố tên nội bộ (site/list SharePoint, phòng ban, mã khu vực, ID, URL nội bộ) | Giữ quy tắc §6 cho PDG |
| Q-14 | (a) Phân tách Partner A/B **đã đạt**; (b) key rotation/revoke **đã xong** | Sửa mọi chỗ ghi "chưa xong" trong nháp PDG |
| Q-15 | (a) **Duy** là người duyệt nội dung công khai; (b) **được nhắc giai đoạn 2 (Kong/on-prem)**, đã hoàn thành; (c) không đổi tên repo demo; (d) không cần sửa README demo | L2 thêm giai đoạn 2 vào case study PDG; vẫn không nêu tên list nội bộ trong nội dung web |
| Q-06 | Xác nhận đúng cả 4: ngân sách model AI < 5 USD/tháng **không trừ vào credit AWS**; log câu hỏi ẩn danh; thống kê lượt xem tổng hợp; staging riêng | Ghi vào thiết kế A2/A4 |
| Q-07 | Đồng ý: 1 budget 10 USD/tháng, cảnh báo thực chi 1/5/10 USD + dự báo 10 USD; Paid plan chỉ nâng khi giao A2 | L5 làm theo `aws-budgets.md` khi có credit |
| Q-19 | Cho phép cài Terraform; Duy cho Lead quyền thao tác rộng để hoàn thành dự án | Đã cài Terraform v1.16.6 bằng winget (chỉ `validate`/`plan` cục bộ). Hành động tốn tiền hoặc không đảo ngược được trên cloud (apply, mua, nâng gói) **vẫn hỏi Duy từng lần** |
| Q-11 | Không cần bản thu đàn; Lead được chọn nhạc trên mạng **miễn phí bản quyền**, hợp vibe (art direction) | L3 (B2): chỉ nhận nhạc CC0 hoặc giấy phép rõ ràng cho phép dùng lại; mỗi file có dòng trong `assets/LICENSES.csv` |
| Q-22 | Tên trên thẻ Welcome: **đậm lại** | L1 khôi phục weight 700 mà không vượt ngưỡng Lighthouse (đo lại) |
| Q-23 | (a) "Kỹ sư Mạng và Hệ thống" đúng; (b) Công việc ở HPT: triển khai dịch vụ cloud Microsoft Azure — **APIM, Azure Functions, Microsoft Fabric, Power Automate** | L2 điền summary HPT (EN + VI) |

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
| D-09 | Q-21 gitleaks: Lead tải bản chính thức v8.28.0, CI xanh | 2026-11-04 |
| D-10 | Q-01, Q-02, Q-03, Q-05, Q-06, Q-07, Q-11, Q-12, Q-13, Q-14, Q-15, Q-17, Q-18, Q-19, Q-22, Q-23 — xem bảng "Câu trả lời ngày 2026-11-04 (lượt 2)" | 2026-11-04 |
| D-11 | Q-24: Lighthouse CI đo 5 lần, gate theo trung vị, ngưỡng giữ nguyên, lần xấu nhất vẫn in ra (ADR 0011) | 2026-11-04 |
| D-12 | Q-16: AWS Sales Pipeline dùng **EventBridge** kích hoạt xử lý; "Shopmart" là dữ liệu giả → case study cập nhật | 2026-11-04 |
| D-13 | Q-10: laptop iGPU Asus Vivobook Flip 15, i5-13500H (Iris Xe), 16 GB, OLED → ADR 0007 bổ sung; T08 iGPU chờ Duy chạy theo runbook | 2026-11-04 |
| D-14 | Q-04: Duy duyệt từng trang (lượt 1: chức danh CloudDevOps Engineer, AWS theo repo, bỏ 69/70, CMS theo slide, PDG chỉ nêu 2 luồng cloud/on-prem) → gỡ Draft | 2026-11-04 |
| D-15 | Email công khai giữ `duybao09012004@gmail.com` — Duy chủ ý, đã biết rủi ro spam | 2026-11-04 |
| D-16 | Chức danh "CloudDevOps Engineer · Fresher" trên Welcome, Quick, CV, JSON-LD, EN/VI | 2026-11-04 |
| D-17 | Hoãn A2, làm B2 + B3 local, Lead toàn quyền kỹ thuật/art (ADR 0012); taste brief + hướng art (ADR 0013); T08 chính thức trên laptop Iris Xe (ADR 0007) | 2026-11-04 |
| D-18 | Q-25: ghi đông GD110 thật là **scrambler** → làm scrambler (khớp spec) | 2026-11-04 |
| D-19 | Q-26: **không** thu được piano → chỉ dùng nhạc có giấy phép rõ ràng, bỏ slot bản thu | 2026-11-04 |
| D-20 | Q-27: ảnh nào dùng cũng được. Ảnh **biết người chụp** → dùng ảnh thật kèm credit, xóa EXIF/GPS; ảnh **không rõ người chụp** → Lead tự thiết kế minh họa dựa trên ảnh gốc (không đăng ảnh gốc). Không logo Chiefs/Suzuki trên bất kỳ bản nào | 2026-11-04 |
| D-21 | Q-28: Duy đã lưu 16 ảnh vào `docs/art-bible/refs/` (6 ảnh cá nhân + 10 ảnh tham chiếu; gitignore, không commit) | 2026-11-04 |
| D-22 | Q-29: Duy xem style frame đợt 16, **chốt sơ khởi là ổn**, không chọn hướng cụ thể → Lead (toàn quyền art, ADR 0012) chốt sơ khởi **hướng C** theo đề xuất Art Director; Duy có thể đổi khi xem cảnh chuẩn T10 | 2026-11-05 |
| D-23 | Q-30: turnaround nhân vật + GD110 — **giữ hết** 17 hạng mục (tỷ lệ, tóc, kính, mặt, áo, quần/tất/giày, tote, da, mức cách điệu; dáng xe, ghi đông scrambler, vành, gương/đèn, baga, phụ kiện, ống xả, không huy hiệu) → bước tiếp: rig + animation | 2026-11-05 |
