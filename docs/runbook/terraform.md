# Runbook — Terraform (A2): validate tĩnh, thứ tự triển khai, ai được apply

> Spec: §11.2–§11.6, §17 "Trước A2". Ticket: L5-012 (bản nháp + `validate`).
> **`terraform apply` chỉ do Duy chạy, hoặc Lead khi Duy cho phép TỪNG LẦN** (CLAUDE.md §6). AI/lane không chạy
> `plan`/`apply`/`import`, không cấu hình credential AWS.

## 1. Cấu trúc

```
infra/
  bootstrap/            # chạy tay 1 lần; state LOCAL (không commit): bucket state, OIDC GitHub, 3 IAM role
  envs/prod/            # ghép module; backend "s3" partial (backend.hcl, không commit), use_lockfile = true
  modules/
    static-site/        # S3 private + OAC, CloudFront (managed CachingOptimized + SecurityHeadersPolicy),
                        # CloudFront Functions (viewer-request / viewer-response), WAF rate limit (us-east-1)
    dns/                # hosted zone, CAA, ACM us-east-1 (apex + www), ALIAS A/AAAA — domain_name rỗng → không tạo gì
    monitoring/         # SNS email, Budgets 10 USD (actual 10/50/100 % + forecast 100 %), Cost Anomaly Detection
```

Mỗi root có `.terraform.lock.hcl` (**commit**: ghim hash provider `hashicorp/aws` cho linux/windows/darwin) và
`*.example` cho biến/backend. `.terraform/`, `*.tfstate*`, `*.tfvars` không commit (`.gitignore`).

## 2. Kiểm tĩnh (ai cũng chạy được, không cần AWS)

```powershell
# PowerShell (Terraform cài qua winget: làm mới PATH trước)
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
node tools/checks/terraform.mjs
```

Script chạy `fmt -check -recursive` (bootstrap, envs/prod, modules), `init -backend=false -input=false`
(`-lockfile=readonly` khi đã có lockfile) và `validate` cho từng root; gỡ mọi biến `AWS_*`/`TF_VAR_*` khỏi môi trường
con và tắt IMDS. Exit: `0` PASS · `1` lỗi · `2` BLOCKED (không có terraform — không phải PASS).
Sửa định dạng: `terraform fmt -recursive infra`.

CI (`.github/workflows/pr.yml`, job `terraform`) chạy đúng script này khi `infra/**`, `tools/checks/terraform.mjs`
hoặc workflow đổi. Không có bước `plan`/`apply`, không `id-token`.

Nâng phiên bản provider: sửa `version = "~> 6.71"` ở cả 5 file `versions.tf`, chạy
`terraform init -upgrade -backend=false` rồi
`terraform providers lock -platform=linux_amd64 -platform=windows_amd64 -platform=darwin_amd64 -platform=darwin_arm64`
trong từng root, commit lockfile.

## 3. Thứ tự A2 (khi Duy giao A2 — §11.1, §11.4)

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Budgets + Free Tier alerts + Cost Anomaly + SNS email | Duy, tay | `aws-budgets.md`. **Trước mọi resource**, kể cả bucket state. |
| 2 | Nâng Paid plan | Duy | `aws-paid-plan.md` (cần cho flat-rate Free plan). |
| 3 | `infra/bootstrap` apply | Duy (hoặc Lead được cho phép lần này) | Xem §4. |
| 4 | `infra/envs/prod` apply (chưa có tên miền) | Duy / Lead được cho phép | `domain_name = ""` → site ở `*.cloudfront.net`. |
| 5 | Chạy lại bootstrap với `site_distribution_id` | như trên | Tạo role `site-deploy`. |
| 6 | Đăng ký CloudFront flat-rate **Free plan** | Duy, tay | §5. |
| 7 | Tên miền: điền `domain_name`, apply, đặt NS ở registrar | Duy / Lead được cho phép | `domain-and-acm.md` (Bước 1–4, 8 vẫn tay). |

Budgets đã tạo tay ở bước 1 nên `cost_guardrails_managed_by_terraform = false` (mặc định) để không tạo budget/topic
trùng. Muốn Terraform quản lý: Duy quyết định, Lead `terraform import` (khi được phép) hoặc xóa bản tay rồi bật `true`.

Nếu Duy làm Route 53/ACM bằng tay theo `domain-and-acm.md` thay vì Terraform: giữ `domain_name = ""` và báo Lead
(cần thêm biến nhận ARN chứng chỉ có sẵn — chưa có trong bản nháp này).

## 4. Chạy bootstrap / prod (CHỈ khi Duy cho phép — ghi lại ai, khi nào)

Credential: phiên SSO/IAM Identity Center ngắn hạn của Duy trên máy Duy (không access key dài hạn, không dán vào chat).

```powershell
cd infra/bootstrap
Copy-Item terraform.tfvars.example terraform.tfvars   # điền tên bucket thật — file KHÔNG commit
terraform init
terraform plan -out=bootstrap.tfplan                  # Duy đọc kỹ: chỉ S3 state, OIDC provider, IAM role
terraform apply bootstrap.tfplan
# Sao lưu terraform.tfstate của bootstrap ra nơi an toàn ngoài repo.

cd ../envs/prod
Copy-Item backend.hcl.example backend.hcl             # bucket = output state_bucket_name — KHÔNG commit
Copy-Item terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan -out=prod.tfplan
terraform apply prod.tfplan
```

Sau bootstrap: tạo GitHub Environment `production` (Settings → Environments) với **Required reviewers = Duy**;
`tf-apply` và `site-deploy` chỉ tin `sub = repo:Crozn1812/the-quiet-atlas:environment:production`,
`tf-plan` chỉ tin `repo:Crozn1812/the-quiet-atlas:pull_request` (khớp chính xác, `aud = sts.amazonaws.com`).
ARN role đặt vào biến (không phải secret) của repo/environment; không ghi account ID vào file commit.

## 5. Việc thủ công (provider chưa hỗ trợ / không nên tự động)

- **Đăng ký CloudFront flat-rate Free plan** (§11.2, §11.5): CloudFront console → distribution → mục pricing plan
  *(chưa chắc nhãn)* → chọn **Free**, gắn hosted zone. Lúc viết, bản nháp không quản lý subscription bằng Terraform.
  Sau khi đăng ký, chạy `plan` (khi được phép) và xem có drift nào (WAF, cache policy) — nếu có, chỉnh code theo
  cấu hình console thay vì để Terraform ghi đè.
- Xác nhận email SNS (link "Confirm subscription").
- Free Tier usage alerts (Billing preferences) — không có resource Terraform.

## 6. DEFERRED

| Kiểm tra | Trạng thái | Lý do / điều kiện mở |
|---|---|---|
| `tflint` | DEFERRED | Chưa cài trên máy/CI; thêm khi Lead duyệt công cụ (ghim phiên bản + SHA). |
| Checkov / Trivy config | DEFERRED | Như trên (§11.6 yêu cầu trước khi apply A2). |
| `terraform plan` (PR) | DEFERRED | Cần bootstrap đã apply + role `tf-plan`; chỉ khi Duy giao A2. |
| Flat-rate Free plan | Thủ công | §5. |
| Siết quyền `tf-apply` theo ARN | DEFERRED | Sau plan đầu tiên, đối chiếu AccessDenied/CloudTrail. |
