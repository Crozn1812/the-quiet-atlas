## TICKET REL-02 — rà Terraform `infra/` sẵn sàng cho A2 (không apply)
- Mục tiêu: Duy chạy `terraform init/plan/apply` theo runbook là có: S3 private + CloudFront (OAC) + ACM us-east-1 + Route 53 hosted zone `nhbduy.id.vn` + record alias + Budgets cảnh báo + monitoring tối thiểu. Không chạy apply, không credential.
- Đọc: `infra/**`, `docs/runbook/terraform.md`, `domain-and-acm.md`, `aws-budgets.md`, spec §11, ADR 0012 (credit 100 USD).
- Làm: rà từng module (static-site, dns, monitoring) so với spec; bổ sung thiếu (security headers response policy, HTTP→HTTPS, default root, 404 → `/404.html`, trailing-slash rewrite bằng CloudFront Function nếu static export cần, logging tắt mặc định để tiết kiệm); tag; output đủ cho REL-01 (bucket, distribution id, nameservers). Không hardcode account id.
- Được sửa: `infra/**`, `docs/runbook/terraform.md`. **Không** sửa `.github/` (REL-01).
- Điều kiện xong: `terraform fmt -check -recursive` + `terraform validate` trong `infra/envs/prod` với `-backend=false` (nếu không có binary terraform: ghi BLOCKED, kèm cách Duy cài). Không có lệnh nào gọi AWS thật.
- Bàn giao: bảng resource → mục đích → chi phí ước tính/tháng; các bước Duy làm thứ tự.
