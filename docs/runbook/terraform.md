# Runbook — Terraform (A2): validate tĩnh, thứ tự triển khai, ai được apply

> Spec: §11.2–§11.7, §17 "Trước A2". Ticket: L5-012, REL-02 (rà soát A2, không apply).
> ADR 0012 cập nhật: credit thực tế **100 USD, hết hạn 2027-11-05**, không dùng giả định 200 USD trong spec.
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
    monitoring/         # SNS email, Budgets 10 USD, Cost Anomaly; alarm CloudFront 5xx độc lập với Budgets
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

Rà soát release gồm từng module riêng: `node tools/checks/release-terraform.mjs`. Lệnh này chạy checker trên,
rồi init/validate `dns`, `monitoring`, `static-site` trong thư mục tạm có provider mặc định + alias us-east-1;
copy lockfile prod ở chế độ readonly, xóa thư mục tạm sau khi kiểm. Child module có `configuration_aliases`
phải được validate qua provider harness; chạy trực tiếp `validate` trong module sẽ thiếu alias.
Máy offline có thể đặt `TF_CLI_CONFIG_FILE` trỏ tới cấu hình filesystem mirror cục bộ đã có provider đúng
hash lockfile; không thêm `direct {}` nếu muốn bảo đảm không tải ngoài. Không đổi lockfile để né lỗi checksum.

CI (`.github/workflows/pr.yml`, job `terraform`) chạy `node tools/checks/terraform.mjs` khi `infra/**`, `tools/checks/terraform.mjs`
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
| 4 | `infra/envs/prod` apply (zone trước, chưa ACM) | Duy / Lead được cho phép | `domain_name = "nhbduy.id.vn"`, `dns_certificate_enabled = false`; tạo zone/CAA, site ở `*.cloudfront.net`, alarm + SNS vận hành. |
| 5 | Chạy lại bootstrap với `site_distribution_id` | như trên | Tạo role `site-deploy`. |
| 6 | Đăng ký CloudFront flat-rate **Free plan** | Duy, tay | §5. |
| 7 | Đổi NS, đợi delegation, rồi bật ACM/alias | Duy / Lead được cho phép | Dùng output `name_servers` đặt NS ở registrar; kiểm public NS, CAA trước khi đặt `dns_certificate_enabled = true` và plan/apply lần hai. |

Budgets đã tạo tay ở bước 1 nên `cost_guardrails_managed_by_terraform = false` (mặc định) để không tạo budget/topic
trùng. Muốn Terraform quản lý: Duy quyết định, import các resource hiện có khi được phép rồi bật `true`;
không xóa guardrail đang hoạt động trước khi bản thay thế sẵn sàng. Module không tự quản lý Free Tier alerts.

Alarm vận hành **luôn tạo**, dù guardrail chi phí quản lý tay: điền `alert_email` để tạo topic
`tqa-site-alerts` và xác nhận subscription. Hoặc điền `operational_alert_topic_arn` của topic us-east-1 có
subscriber đã Confirmed; policy topic có sẵn phải cho `cloudwatch.amazonaws.com` publish và giới hạn
`aws:SourceAccount` đúng tài khoản (chỉ cấu hình giá trị thật ở máy Duy/console).
Alarm `AWS/CloudFront` / `5xxErrorRate`, `DistributionId`, `Region = Global`, ở us-east-1:
Average ≥ 1% trong 2 kỳ liên tiếp, mỗi kỳ 300 giây; thiếu dữ liệu coi không vi phạm. Gửi ALARM và OK qua SNS.
Budget/SNS email vẫn có độ trễ; đây không phải trần chi tiêu cứng.
Khi bật Terraform quản lý cost guardrails, `alert_email` cũng bắt buộc để tránh topic chi phí không có người nhận.

Nếu đã làm Route 53/ACM bằng tay theo `domain-and-acm.md`: báo Lead chuẩn bị import trước prod apply,
tránh zone/cert trùng. `domain_name = ""` chỉ dùng cho site tạm ở `*.cloudfront.net`;
prod chưa có biến nhận ARN chứng chỉ/hosted zone sẵn nên đặt rỗng không nối được custom domain.

## 4. Chạy bootstrap / prod (CHỈ khi Duy cho phép — ghi lại ai, khi nào)

Credential: phiên SSO/IAM Identity Center ngắn hạn của Duy trên máy Duy (không access key dài hạn, không dán vào chat).

```powershell
cd infra/bootstrap
Copy-Item terraform.tfvars.example terraform.tfvars   # điền tên bucket thật — file KHÔNG commit
terraform init
terraform plan -out=bootstrap.tfplan                  # Duy đọc kỹ: chỉ S3 state, OIDC provider, IAM role
terraform apply bootstrap.tfplan
# Sao lưu terraform.tfstate của bootstrap ra nơi an toàn ngoài repo.
# Điền alert_email hoặc operational_alert_topic_arn ở prod trước plan; mặc định rỗng sẽ bị precondition chặn.

cd ../envs/prod
Copy-Item backend.hcl.example backend.hcl             # bucket = output state_bucket_name — KHÔNG commit
Copy-Item terraform.tfvars.example terraform.tfvars
terraform init -reconfigure -backend-config=backend.hcl # cần -reconfigure sau lần init -backend=false
terraform plan -out=prod.tfplan
terraform apply prod.tfplan
```

Sau bootstrap: tạo GitHub Environment `production` (Settings → Environments) với **Required reviewers = Duy**;
`tf-apply` chỉ tin `sub = repo:Crozn1812/the-quiet-atlas:environment:production`,
`tf-plan` chỉ tin `repo:Crozn1812/the-quiet-atlas:pull_request` (khớp chính xác, `aud = sts.amazonaws.com`).
`site-deploy` theo REL-01 chỉ tin `repo:Crozn1812/the-quiet-atlas:ref:refs/heads/main`;
job deploy không gắn Environment vì sẽ đổi `sub`.
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

## 7. Checklist REL-02 và bàn giao REL-01

- S3 REST origin private, Block Public Access, BucketOwnerEnforced, SSE-S3; OAC ký SigV4 và bucket policy
  chỉ cho đúng distribution đọc, deny HTTP. Versioning có lifecycle giới hạn bản cũ.
- CloudFront redirect HTTP → HTTPS; root `index.html`; lỗi S3 403/404 → `/404.html` với status 404.
  Viewer-request 301 thêm slash, `www` → apex, rewrite `/en/quick/` → `/en/quick/index.html` phù hợp
  `next.config.ts` (`output: export`, `trailingSlash: true`). Query string giữ qua redirect.
- Managed SecurityHeadersPolicy + viewer-response bổ sung Permissions-Policy/CSP frame-ancestors.
  CloudFront viewer-response không chạy cho mọi origin error; kiểm headers trên 404 khi smoke test A2.
- Không cấu hình CloudFront/S3/WAF access logging, không tạo log bucket, custom metrics hay Route 53 health check.
  WAF metrics và metric CloudFront cơ bản bật; alarm Lambda/AI và kill switch đợi C1.
- Hai provider prod và provider bootstrap có default tags `Project`, `ManagedBy`, `Stack`;
  áp dụng cho resource hỗ trợ tag. Record DNS, OAC, Function, policy/subscription không hỗ trợ tag không được ép tag.
- ACM us-east-1 cho apex + www, DNS validation, CAA Amazon; alias A/AAAA chỉ tạo sau khi bật chứng chỉ.
  **Không đặt `dns_certificate_enabled = false` trên site đã live**: sẽ tháo cert/alias, hủy ACM validation/certificate.
  Nếu zone đã tạo tay: import trước; không tạo zone trùng rồi đổi NS tùy tiện.

Sau lần apply đầu (Duy chạy trong `infra/envs/prod`):

```powershell
terraform output -raw site_bucket_name         # REL-01: SITE_BUCKET
terraform output -raw distribution_id          # REL-01: CF_DISTRIBUTION_ID; bootstrap: site_distribution_id
terraform output -raw distribution_domain_name # SITE_URL tạm = https://<giá trị này>
terraform output -json name_servers            # 4 NS đặt ở registrar cho nhbduy.id.vn
terraform output -raw hosted_zone_id
terraform output -raw site_alarm_name
terraform output -raw site_alert_topic_arn
```

Thứ tự tên miền: lấy NS → đổi ở registrar → `Resolve-DnsName nhbduy.id.vn -Type NS` và
[lệnh Node kiểm CAA](domain-and-acm.md#bước-5--caa-chỉ-cho-amazon-cấp-chứng-chỉ)
(Windows có bản không hỗ trợ `Resolve-DnsName -Type CAA`) → sửa `.tfvars` bật cert →
`terraform plan -out=prod.tfplan` → đọc plan → `terraform apply prod.tfplan`.
Không đợi apply có ACM xong mới đổi NS: ACM cần delegation để validate.
Giữ record CNAME validation cho tự gia hạn; dùng `SITE_URL=https://nhbduy.id.vn` khi build release tên miền.
Xác nhận SNS, thử publish email; khi A2 được duyệt Duy có thể thử alarm bằng CloudWatch console
`Set alarm state` (thử kênh ALARM/OK, không chứng minh metric đã vượt ngưỡng).
Smoke test HTTPS apex/www, HTTP redirect, `/`, `/en/quick`, `/en/quick/`, một URL không tồn tại,
security headers và S3 URL trực tiếp bị chặn. Workflow hiện chỉ PR checks và deploy thủ công;
chưa có job uptime theo lịch, không xem đây là tính năng đã có của REL-01.

## 8. Ước tính chi phí A2 (USD/tháng, trước credit)

Giả định portfolio nhỏ, S3 tổng cả version < 5 GB, một zone gắn Free flat-rate plan.
Đây là dự trù, không phải bảo đảm giá; Duy kiểm lại ngay trước triển khai.

| Resource | Mục đích | Dự trù/tháng |
|---|---|---|
| S3 site + version/lifecycle | Artifact private và rollback | ~0 trong storage credit; dự phòng < 0,20 ngoài credit với < 5 GB, request nhỏ tính riêng |
| CloudFront + OAC + managed policies + 2 Functions | CDN, TLS, security headers, route static export | Free plan 0; request/edge compute theo điều kiện plan, dự phòng vài cent |
| WAF web ACL + rate rule | Giới hạn request/IP | 0 khi gắn Free plan; trước khi gắn plan PAYG khoảng 6 + 0,60/triệu request |
| Route 53 zone + CAA/CNAME/ALIAS | DNS nhbduy.id.vn, xác thực TLS | 0 khi zone gắn plan; nếu chưa gắn khoảng 0,50/zone + DNS query tính phí (ALIAS CloudFront miễn query) |
| ACM public certificate không export | TLS apex + www us-east-1 | 0 |
| CloudWatch 1 alarm, metrics cơ bản | Cảnh báo 5xx CloudFront | 0 nếu còn bậc miễn phí, dự phòng 0,10 |
| SNS topics/subscriptions email | Cảnh báo chi phí/vận hành | ~0 khi ít thông báo trong bậc miễn phí; email ngoài bậc miễn phí 2/100.000 |
| Budgets (không actions) + Cost Anomaly | Cảnh báo actual/forecast trước credit | 0 cho theo dõi ngân sách và anomaly; không gọi Cost Explorer API tính phí |
| S3 state + lockfile, OIDC/IAM | Terraform state, deploy không access key | S3 vài cent; IAM/OIDC 0 |
| Access logs / health check trả phí | Không tạo | 0 |

Tổng nền mục tiêu ≤ 1 USD/tháng **sau khi** gắn Free plan; khoảng thời gian PAYG có WAF có thể vượt mức này.
Không coi credit là miễn phí vận hành: budget 10 USD theo chi phí trước credit; credit 100 USD hết hạn
2027-11-05. Phí gia hạn tên miền nằm ngoài AWS; C1/AI không nằm trong ước tính A2.

Nguồn kiểm trước apply: [CloudFront](https://aws.amazon.com/cloudfront/pricing/),
[WAF](https://aws.amazon.com/waf/pricing/), [Route 53](https://aws.amazon.com/route53/pricing/),
[S3](https://aws.amazon.com/s3/pricing/), [ACM](https://aws.amazon.com/certificate-manager/pricing/),
[CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), [SNS](https://aws.amazon.com/sns/pricing/),
[Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/),
[CloudFront metrics us-east-1](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/monitoring-using-cloudwatch.html).

## 9. Kết quả kiểm cục bộ REL-02 (2026-11-13)

Terraform 1.16.6, AWS provider 6.71.0 từ filesystem mirror có sẵn trên máy (lockfile readonly),
không tải provider ngoài. Lần kiểm tiếp tục dùng PowerShell gọi Terraform trực tiếp, đã gỡ
`AWS_*`/`TF_VAR_*`/`TF_CLI_ARGS*`/`TF_WORKSPACE`/`TF_TOKEN_*`, đặt `AWS_EC2_METADATA_DISABLED=true`
và `CHECKPOINT_DISABLE=1`. Wrapper Node bị sandbox chặn tạo tiến trình con (`spawnSync terraform EPERM`);
không ghi PASS cho wrapper trong lần kiểm này.

```text
terraform fmt -check -recursive infra: exit 0
terraform -chdir=infra/bootstrap init -backend=false -input=false -lockfile=readonly -no-color: exit 0
terraform -chdir=infra/bootstrap validate -no-color: Success! The configuration is valid. (exit 0)
terraform -chdir=infra/envs/prod init -backend=false -input=false -lockfile=readonly -no-color: exit 0
terraform -chdir=infra/envs/prod validate -no-color: Success! The configuration is valid.
pnpm.cmd lint: exit 0, 0 warnings
pnpm.cmd typecheck: exit 0
pnpm.cmd test: exit 1 — config startup: spawn EPERM (Vite gọi tiến trình con net use)
pnpm.cmd test --configLoader native --pool threads: exit 1
  Test Files 6 failed | 146 passed (152); Tests 14 failed | 1760 passed (1774)
CloudFront Functions: PASS (9 assertions, Node VM cục bộ)
```

Init cho bootstrap/prod đều `-backend=false -input=false -lockfile=readonly`; không backend AWS,
credential, plan, apply, import hay lệnh AWS. Các kết quả này chỉ xác minh cấu hình cục bộ;
quyền IAM thực tế, Free plan, delegation, ACM Issued và nhận email cần Duy kiểm sau khi A2 được cho phép.

Đã thử `pnpm.cmd test --configLoader native --pool threads` để bỏ bước bundle config và dùng worker threads.
Các test CLI vẫn cần spawn nên bị EPERM; test CPU của Milestones còn đo CPU dùng chung giữa threads.
**Gate full unit test chưa đạt trong sandbox hiện tại**; Lead cần chạy lại `pnpm test` bằng runner mặc định
trên môi trường cho phép tiến trình con. Không sửa test/config, không bỏ test để ghi PASS.
Log có sẵn từ lượt trước báo 152 files / 1774 tests passed; đó không phải kết quả xác nhận lại ở lượt này.

## 10. File bàn giao REL-02

Toàn bộ diff nằm trong phạm vi cho phép, không đổi dependency, lockfile hay `.github/`:

- `infra/bootstrap/iam.tf`: quyền đọc/quản lý alarm cho role Terraform.
- `infra/envs/prod/main.tf`, `variables.tf`, `terraform.tfvars.example`, `outputs.tf`: nối alarm,
  chế độ tạo zone trước ACM và output cho REL-01.
- `infra/modules/dns/main.tf`, `variables.tf`, `outputs.tf`: tách zone/CAA khỏi cert/alias,
  dùng key DNS validation biết trước khi tạo ACM.
- `infra/modules/monitoring/main.tf`, `variables.tf`, `outputs.tf`, `site.tf`: alarm 5xx, SNS vận hành,
  yêu cầu người nhận cảnh báo, tách khỏi guardrail chi phí quản lý tay.
- `infra/modules/static-site/main.tf`: ghi rõ logging mặc định tắt; cấu hình OAC/headers/HTTPS/root/404/functions
  đã có và được rà lại.
- `docs/runbook/terraform.md`: thứ tự triển khai, chi phí, kiểm tra và giới hạn.

Lead không cần nối vào `src/features/world/index.ts` cho ticket hạ tầng này. REL-01 dùng output ở §7;
ARN role deploy lấy từ `infra/bootstrap` bằng `terraform output -raw site_deploy_role_arn` sau bước 5.
Không build ứng dụng hay chạy e2e vì diff chỉ có Terraform/runbook; smoke test trên AWS để Duy thực hiện ở A2.
