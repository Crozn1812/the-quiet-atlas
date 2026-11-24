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
