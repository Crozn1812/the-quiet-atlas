## TICKET L5-012 — Bản nháp Terraform A2 + `terraform validate` (KHÔNG apply, KHÔNG credential)

- Trạng thái: **Assigned → subagent L5 (opus)** (2026-11-04, đợt 12), nhánh `lane/L5-012`, worktree `D:/tqa-worktrees/L5-012`
- Lane / milestone: L5 Platform & A2 prep / chuẩn bị A2 (spec §17 "Trước A2": IaC draft/validate)
- Spec: §11.2, §11.3, §11.4 (thứ tự guardrail), §11.5, §11.6; Duy đã đồng ý Q-07 (budget 10 USD/tháng, cảnh báo actual 1/5/10 USD + forecast 10 USD)
- Công cụ: Terraform v1.16.6 đã cài (winget; cần refresh PATH từ registry). Không có tflint/checkov → ghi DEFERRED.
- Việc:
  1. `infra/bootstrap/`: bucket state (versioning, SSE-S3, block public access), GitHub OIDC provider, 3 role: `tf-plan` (chỉ đọc, trust `pull_request`), `tf-apply` (trust `environment:production`), `site-deploy` (chỉ ghi/xóa bucket site + `CreateInvalidation` distribution site; trust `environment:production`), repo `Crozn1812/the-quiet-atlas`. Region ap-southeast-1.
  2. `infra/modules/static-site/`: S3 private + OAC, CloudFront (managed `CachingOptimized`, managed `SecurityHeadersPolicy`), CloudFront Functions viewer-request (rewrite `index.html`, 301 thêm slash, `www` → apex) và viewer-response (Permissions-Policy, CSP `frame-ancestors 'none'`), WAF web ACL (scope CLOUDFRONT, us-east-1, luật rate-limit theo IP), S3 versioning + lifecycle giới hạn noncurrent. Ghi chú: đăng ký flat-rate Free plan làm thủ công (runbook).
  3. `infra/modules/dns/`: hosted zone, ACM us-east-1 (apex + www, DNS validation), ALIAS A/AAAA, CAA amazon.com. Mọi thứ phụ thuộc biến `domain_name` (rỗng → không tạo gì; tên miền đang mua).
  4. `infra/modules/monitoring/`: Budgets 10 USD/tháng, notifications actual 1/5/10 + forecast 10, SNS email (biến), Cost Anomaly Detection monitor + subscription.
  5. `infra/envs/prod/`: ghép module; `backend "s3" {}` partial (`backend.hcl.example`, giá trị thật không commit), `use_lockfile = true`; provider alias us-east-1; `required_version >= 1.10`, pin phiên bản provider; `terraform.tfvars.example`.
  6. `.gitignore`: nếu thiếu `*.tfstate*`, `.terraform/`, `*.tfvars` (giữ `*.example`) → ghi trong bàn giao, Lead sửa.
  7. `tools/checks/terraform.mjs`: với mỗi root (`infra/bootstrap`, `infra/envs/prod`) chạy `terraform fmt -check -recursive`, `terraform init -backend=false -input=false`, `terraform validate`; exit 0 PASS / 1 lỗi / 2 BLOCKED (không có terraform). Lead sẽ thêm script `check:terraform` vào package.json.
  8. `.github/workflows/pr.yml`: job `terraform` chạy khi `infra/**` hoặc `tools/checks/terraform.mjs` đổi: setup-terraform pin theo commit SHA, fmt/validate. **Không** có bước `plan`/`apply`.
  9. `docs/runbook/terraform.md`: cách chạy validate; thứ tự A2 (Budgets trước resource đầu tiên; bootstrap chạy tay; Free plan thủ công). Ghi rõ: apply chỉ do Duy, hoặc Lead khi Duy cho phép từng lần.
- Được sửa: `infra/`, `tools/checks/`, `.github/`, `docs/runbook/`, `tests/unit/tools/`
- Không được sửa: `src/`, `package.json`, lockfile, các file Lead giữ. Không chạy `terraform plan`/`apply`, không cấu hình credential AWS, không gọi AWS API.
- Điều kiện xong: `node tools/checks/terraform.mjs` exit 0 (dán output fmt/validate từng root), `pnpm lint`, `pnpm test` exit 0, `pnpm check:gitleaks` exit 0. Không commit.
- Bàn giao: cây file, output validate, việc DEFERRED (tflint, checkov, plan).
