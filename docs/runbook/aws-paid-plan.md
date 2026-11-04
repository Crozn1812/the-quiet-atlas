# Runbook — Nâng tài khoản AWS từ Free plan lên Paid plan

> Người làm: **Duy** (chỉ chủ tài khoản được nâng; AI không làm). Spec: §11.1, §11.2, §11.4, §12 (A2). Hàng đợi: Q-07.
> Viết 2026-11-04 (L5-010). Dữ kiện về Free/Paid plan trong spec được kiểm ngày 03/11/2026 [S10][S11]; **đọc lại trang điều khoản AWS trên màn hình xác nhận trước khi bấm** — nếu khác những gì ghi ở đây, dừng và báo Lead.

## 1. Khi nào cần nâng

Nâng khi **cả ba** điều kiện sau đúng:

1. Duy đã giao A2 (phát hành portfolio) — trước đó dự án chỉ chạy local, chưa cần cloud (§11.1 quyết định 1).
2. Đã xong `aws-account-and-credits.md` (MFA root, user hằng ngày, đã ghi ngày đăng ký và hạn credits).
3. Đã xong `aws-budgets.md` (Budgets + SNS + Anomaly Detection; ít nhất Q25-a PASS) — §11.1 quyết định 2: "tạo AWS Budgets và cảnh báo, **rồi** nâng".

**Hạn chót cứng:** trước mốc 6 tháng kể từ ngày đăng ký (`<ngày đăng ký + 6 tháng>`), hoặc trước khi credits hết nếu sớm hơn. Quá mốc này khi vẫn ở Free plan, tài khoản bị đóng; dữ liệu giữ 90 ngày để nâng cấp và khôi phục (§11.1).

Vì sao A2 **bắt buộc** Paid plan (§11.1, §11.2):
- Free plan **không dùng được CloudFront flat-rate plans** — mà thiết kế V6 dựa trên CloudFront flat-rate **Free** plan (0 USD/tháng, kèm WAF, Route 53 hosted zone gắn plan).
- Free plan chỉ truy cập một nhóm dịch vụ; site trên Free plan sẽ bị đóng ở tháng thứ 6.
- (Có thể) cần Paid để bật AWS Organizations / IAM Identity Center — xem `aws-account-and-credits.md` 6A.

**Không** nâng sớm "cho chắc" khi chưa có A2: không có lợi ích, chỉ mở rủi ro bị tính phí vào thẻ.

## 2. Hậu quả với credits và chi phí

| Sau khi nâng | Ý nghĩa |
|---|---|
| Credits chưa dùng **vẫn còn** | Áp cho dịch vụ đủ điều kiện **tới 12 tháng kể từ ngày đăng ký** (§11.1) |
| Sau 12 tháng **hoặc** khi credits hết (cái nào trước) | Phí tính vào thẻ theo giá pay-as-you-go |
| Không còn giới hạn dịch vụ của Free plan | Có thể vô tình tạo dịch vụ đắt (EC2/NAT/EKS…) → đó là lý do phải có Budgets **trước** |
| Credits không trả mọi thứ | Không trả phí đăng ký tên miền qua Route 53 [S12]; model AI có thể không được trừ (§10.3, §11.4) |
| Quay lại Free plan | Theo hiểu biết lúc viết: **không** quay lại được. Kiểm tra câu chữ trên màn hình xác nhận |

Mục tiêu chi phí (§11.4): CloudFront + WAF + Route 53 (gắn plan) = 0 USD; tổng nền ≤ 1 USD/tháng sau khi credits hết (không tính tên miền và AI).

## 3. Các bước

### Bước 1 — Kiểm tra điều kiện

- Mở `docs/PROJECT_STATUS.md` (hoặc hỏi Lead): A2 đã được giao? Q25-a đã PASS?
- Console → **Budgets**: `tqa-monthly-cost` tồn tại, có alerts.
- Billing → **Credits**: ghi lại số credits còn `<số>` USD và hạn `<YYYY-MM-DD>` (để so sánh sau khi nâng).

**Kiểm tra đã đúng chưa:** cả 3 mục đều có; thiếu mục nào thì dừng, làm runbook tương ứng trước.

### Bước 2 — Kiểm tra phương thức thanh toán

Billing and Cost Management → **Payment preferences** / **Payment methods** *(chưa chắc nhãn)* → có thẻ mặc định còn hạn. Chi phí ngoài credits sẽ trừ vào thẻ này.

**Kiểm tra đã đúng chưa:** thẻ hiện là Default, chưa hết hạn.

### Bước 3 — Nâng cấp

Đăng nhập bằng **root** (có thể AWS chỉ cho root nâng plan — *chưa chắc*; nếu user hằng ngày thấy nút và làm được thì cũng được).

1. Tìm lời nhắc nâng cấp: banner trên trang chủ console hoặc trong Billing and Cost Management, nút dạng **Upgrade plan** / **Upgrade to paid plan** *(chưa chắc nhãn và vị trí — AWS mô tả trong tài liệu "AWS Free Tier / account plans"; nếu không thấy, tìm "upgrade" trong ô tìm kiếm console hoặc trong tài liệu AWS, không bấm vào trang bên thứ ba)*.
2. **Đọc** màn hình xác nhận: ghi lại (chụp màn hình, che ID) các câu về credits, thời hạn, quay lại Free plan.
3. Nếu câu chữ khớp mục 2 ở trên → xác nhận nâng cấp. Nếu khác → **dừng**, gửi Lead ảnh chụp (che ID/email).

**Kiểm tra đã đúng chưa:**
- Console không còn banner Free plan / số ngày còn lại của Free plan.
- Billing → **Credits**: số credits và ngày hết hạn **giống** Bước 1 (credits không mất khi nâng). Nếu credits biến mất hoặc hạn ngắn lại → báo Lead ngay.
- Budgets vẫn còn và vẫn ở trạng thái bình thường.

### Bước 4 — Sau khi nâng (cùng ngày)

1. Billing → **Bills**: tháng hiện tại 0 USD hoặc gần 0 (chưa có resource).
2. Nếu ở `aws-account-and-credits.md` đã dùng phương án 6B (IAM user) vì Free plan chặn Organizations → giờ làm lại **6A (IAM Identity Center)**; xong thì cân nhắc xóa IAM user 6B (chỉ khi user Identity Center đã đăng nhập được).
3. Kiểm tra nhắc việc mốc 12 tháng vẫn còn trong lịch.

**Kiểm tra đã đúng chưa:** Bills tháng này không có dòng lạ; nhắc việc 12 tháng còn.

## 4. Báo lại cho Lead

```
Paid plan (L5-010):
- Ngày nâng: <YYYY-MM-DD>
- Credits trước/sau khi nâng: <số>/<số> USD, hạn <YYYY-MM-DD> (khớp / không khớp)
- Câu chữ màn hình xác nhận khớp runbook: có / không (đính kèm ảnh đã che ID)
- Identity Center (6A) sau nâng: đã làm / chưa
```

Sau bước này Lead mới mở ticket Terraform bootstrap (state bucket, OIDC, role) theo §11.5 — vẫn chỉ `validate`, `apply` chỉ khi Duy duyệt riêng.
