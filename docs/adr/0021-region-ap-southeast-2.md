# ADR 0021 — Region chính đổi từ ap-southeast-1 sang ap-southeast-2

- Ngày: 2026-11-24
- Trạng thái: Chấp nhận (Lead)
- Liên quan: spec §11.5, ADR 0012, DUY_QUEUE Q-55

## Bối cảnh

Tài khoản AWS cũ (org corateam) bị khóa xác minh sau khi nâng Paid plan và đã bỏ. Tài khoản mới
(2026-11-24) là kiểu tổ chức có project. Project dùng cho website chỉ cho phép 3 region:
us-east-1, us-west-2, ap-southeast-2. Singapore (ap-southeast-1) thuộc nhóm "Restricted Regions".

## Quyết định

- Region chính (state bucket, S3 site, tài nguyên khu vực): **ap-southeast-2 (Sydney)**.
- us-east-1 giữ nguyên cho ACM (CloudFront), WAF scope CLOUDFRONT và alarm.
- Không mở khóa Singapore qua "Manage Regions": thay đổi cấp tài khoản, hậu quả chưa rõ.

## Hệ quả

- Người xem nhận nội dung từ edge CloudFront; origin ở Sydney chỉ ảnh hưởng lần lấy cache đầu.
- Giá S3 ở Sydney chênh không đáng kể với quy mô site tĩnh; budget 10 USD/tháng giữ nguyên.
- Đã đổi: `infra/**/variables.tf`, `*.tfvars.example`, `backend.hcl.example`, `.github/workflows/deploy.yml`,
  runbook deploy/domain-and-acm/aws-account-and-credits.

## Bổ sung 2026-11-24: SCP chặn SNS ở us-east-1

Prod apply lần đầu (Duy, CloudShell) tạo 14/18 resource; `SNS:CreateTopic` ở us-east-1 bị SCP của tổ chức
chặn (explicit deny). Alarm CloudFront 5xx bắt buộc ở us-east-1 và chỉ gửi được SNS cùng region.
Quyết định: thêm biến `site_alarm_notifications_enabled` (mặc định true). Tài khoản project đặt `false`:
alarm vẫn tạo, trạng thái xem trong CloudWatch console, **không gửi email** (DEFERRED: tìm kênh thông báo
được SCP cho phép, ví dụ AWS User Notifications). Không sửa SCP.

Cùng ngày: `PutMetricAlarm` ở us-east-1 cũng bị từ chối (AccessDenied). Thêm biến prod `site_monitoring_enabled`;
tài khoản project đặt `false` → không có alarm 5xx. Giám sát lỗi website: **DEFERRED** (smoke test sau deploy +
CloudFront console). Rủi ro cần theo dõi: ACM ở us-east-1 (bắt buộc cho HTTPS tên miền) có thể bị chặn tương tự —
kiểm khi bật `dns_certificate_enabled`.
