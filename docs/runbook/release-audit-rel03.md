# Bàn giao REL-03 — 2026-11-14

Đã rà release kit sau đợt asset C. Không build Next, không gọi AWS, không cấu hình credential,
không Terraform plan/apply/import, không commit. Không thay `src/`, `public/`, dependency, lockfile,
config, ADR, STATUS hay DUY_QUEUE. Không có file nguồn ngoài phạm vi ticket.

| File | Thay đổi và lý do |
|---|---|
| `.github/workflows/deploy.yml` | Thêm check asset budget trước OIDC; World dùng revalidate và giữ path cũ; gọi helper MIME; invalidate `/world/*` và HTML cụ thể, bỏ wildcard giữa path không có tác dụng. |
| `tools/checks/upload-asset-metadata.sh` | MIME rõ cho KTX2/GLB/glTF/HDR/WebM/font/WASM; cp lại cả file không đổi để sửa metadata; giữ bytes origin và không gắn Content-Encoding sai. |
| `tools/checks/release-upload.test.mjs` | Kiểm Bash inline của workflow và thứ tự các bước; chạy helper thật với AWS mock, kiểm MIME/cache, tên có khoảng trắng, upload lại metadata, bytes không đổi và dừng khi AWS lỗi. |
| `tools/checks/release-terraform.mjs` | Giữ checker hai root hiện có; thêm init/validate riêng ba module bằng provider harness tạm có alias us-east-1 và lockfile readonly. |
| `docs/runbook/deploy.md` | Đồng bộ tên bước workflow, MIME/cache/nén, invalidation, smoke test và giới hạn cache/rollback. |
| `docs/runbook/terraform.md` | Thêm lệnh audit mọi module; sửa `CF_DISTRIBUTION_ID`, init backend sau kiểm tĩnh, biến email bắt buộc, import DNS có sẵn, cách kiểm CAA Windows và trạng thái uptime chưa có. |
| `docs/runbook/domain-and-acm.md` | Thêm luồng Terraform hiện tại: zone/CAA → NS → ACM/alias; tránh tạo zone/cert trùng; thay lệnh CAA không tương thích Windows bằng Node qua stdin. |
| `docs/runbook/aws-budgets.md` | Đối chiếu tên anomaly thực tế, guardrail tạo tay và topic vận hành riêng; nêu ngưỡng Terraform là GREATER_THAN. |
| `docs/runbook/aws-paid-plan.md` | Ghi credit thực tế 100 USD/hạn 2027-05-05 cần Duy kiểm lại; phân biệt account Paid và CloudFront Free; nối bootstrap/prod đã có. |
| `docs/runbook/full-check.md` | Thêm asset budget và lệnh build Windows dùng WASM/Webpack hiện tại để Lead chạy đúng một lần. |
| `docs/runbook/release-checklist.md` | 17 bước theo thứ tự, mỗi bước một dòng có link runbook, từ MFA/Budgets đến deploy/smoke test. |
| `docs/runbook/release-audit-rel03.md` | Bàn giao file, lý do, output thật và giới hạn của lượt audit. |

Không cần sửa Terraform resource: cấu hình hiện có dùng private S3/OAC, managed CachingOptimized,
`compress = true`, security headers và lifecycle versioning; vấn đề metadata/cache được sửa ở workflow.
Theo [AWS compression](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html),
nén edge dựa vào Content-Type/Accept-Encoding và kích thước; không ép gzip/br lên binary đã tối ưu bằng MIME giả.

Các lệnh kiểm bổ sung không cần out/:

```text
pnpm.cmd lint: exit 0, 0 warnings
pnpm.cmd typecheck: exit 0
pnpm.cmd test: exit 0
 Test Files  167 passed (167)
      Tests  1854 passed (1854)

node --test tools/checks/release-upload.test.mjs: exit 0
✔ deploy workflow: all inline Bash blocks parse; assets and checks precede invalidation/OIDC
✔ deploy metadata: real Bash helper, mocked AWS; MIME/cache, unchanged files, fail closed
ℹ tests 2
ℹ pass 2
ℹ fail 0

bash -n tools/checks/upload-asset-metadata.sh: exit 0 (no output)
terraform fmt -check -recursive -diff -no-color infra: exit 0 (no output)
actionlint availability check:
ACTIONLINT NOT RUN: executable not installed

pnpm.cmd check:assets: exit 0
status=PASS; worldBytes=15304082; startBytes=147096; errors=[]
pnpm.cmd check:licenses: exit 0
check-licenses (§7.3) — public files: 83 (excluding .gitkeep)
RESULT: PASS

bash tools/lead/gate.sh .: exit 0
GATE PASS: lint, typecheck,  Tests 1854 passed (1854)
git diff --check: exit 0 (no output)
```

`pnpm.cmd` dùng cùng package scripts với `pnpm`; PowerShell máy này chặn shim `pnpm.ps1` bằng execution policy.
Actionlint chưa cài trên PATH, không tải thêm công cụ; kiểm Bash không thay thế kiểm YAML/Actions bằng actionlint.
Log chi tiết cục bộ (không commit): `tmp/rel03/terraform.log`, `tmp/rel03/unit.log`.

Giới hạn: chưa smoke test cloud/HTTPS/MIME thực tế; Duy làm theo [checklist](release-checklist.md).
CloudFront CachingOptimized giữ HTML tối thiểu 1 giây. World dùng URL ổn định nên phiên cũ có thể trộn
asset khi nội dung bị thay; cần version path để giữ phiên cũ hoàn toàn, và để bỏ cache browser đã nhận
immutable từ lần deploy cũ. Upload không nguyên tử, chưa có cleanup asset cũ/rollback tự động hay uptime job.
Tflint/Checkov/Trivy còn DEFERRED theo runbook Terraform, cần Lead/Duy giải quyết trước apply A2.

Lead không cần nối `src/features/world/index.ts`; không có API World mới hay đoạn code tích hợp cho ticket này.
Workflow đã gọi helper trực tiếp; chỉ cần review/merge bộ file trên rồi Duy làm theo checklist.

Terraform dùng 1.16.6 và provider AWS 6.71.0 sẵn trên máy. Lần init mặc định đầu tiên thất bại vì sandbox
chặn kết nối registry.terraform.io; sau đó đặt `TF_CLI_CONFIG_FILE` trỏ tới filesystem mirror cục bộ
không có `direct {}` và chạy lại thành công. Không tải provider ngoài; dòng Terraform "Downloading D:/..."
trong output dưới là copy child module từ source local sang harness tạm. Các dòng "unauthenticated" là nhãn
provider từ mirror; init vẫn dùng hash trong lockfile readonly, không sửa lockfile. Output thành công nguyên văn:

```text
Terraform v1.16.6 (TERRAFORM_BIN=terraform)

$ (infra/bootstrap) terraform fmt -check -recursive -diff -no-color
PASS: fmt infra/bootstrap

$ (infra/envs/prod) terraform fmt -check -recursive -diff -no-color
PASS: fmt infra/envs/prod

$ (infra/modules) terraform fmt -check -recursive -diff -no-color
PASS: fmt infra/modules

$ (infra/bootstrap) terraform init -backend=false -input=false -no-color -lockfile=readonly
Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Installing hashicorp/aws v6.71.0...
- Installed hashicorp/aws v6.71.0 (unauthenticated)

Terraform has been successfully initialized!
PASS: init infra/bootstrap

$ (infra/bootstrap) terraform validate -no-color
Success! The configuration is valid.

PASS: validate infra/bootstrap

$ (infra/envs/prod) terraform init -backend=false -input=false -no-color -lockfile=readonly
Initializing modules...

Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Installing hashicorp/aws v6.71.0...
- Installed hashicorp/aws v6.71.0 (unauthenticated)

Terraform has been successfully initialized!
PASS: init infra/envs/prod

$ (infra/envs/prod) terraform validate -no-color
Success! The configuration is valid.

PASS: validate infra/envs/prod

terraform: PASS (7/7)

$ (infra/modules/dns, temporary provider harness) terraform init -backend=false -input=false -lockfile=readonly -no-color
Initializing modules...
Downloading D:/tqa-worktrees/W-B/infra/modules/dns for subject...
- subject in .terraform\modules\subject

Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Installing hashicorp/aws v6.71.0...
- Installed hashicorp/aws v6.71.0 (unauthenticated)

Terraform has been successfully initialized!

$ (infra/modules/dns, temporary provider harness) terraform validate -no-color
Success! The configuration is valid.


$ (infra/modules/monitoring, temporary provider harness) terraform init -backend=false -input=false -lockfile=readonly -no-color
Initializing modules...
Downloading D:/tqa-worktrees/W-B/infra/modules/monitoring for subject...
- subject in .terraform\modules\subject

Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Installing hashicorp/aws v6.71.0...
- Installed hashicorp/aws v6.71.0 (unauthenticated)

Terraform has been successfully initialized!

$ (infra/modules/monitoring, temporary provider harness) terraform validate -no-color
Success! The configuration is valid.


$ (infra/modules/static-site, temporary provider harness) terraform init -backend=false -input=false -lockfile=readonly -no-color
Initializing modules...
Downloading D:/tqa-worktrees/W-B/infra/modules/static-site for subject...
- subject in .terraform\modules\subject

Initializing provider plugins...
- Reusing previous version of hashicorp/aws from the dependency lock file
- Installing hashicorp/aws v6.71.0...
- Installed hashicorp/aws v6.71.0 (unauthenticated)

Terraform has been successfully initialized!

$ (infra/modules/static-site, temporary provider harness) terraform validate -no-color
Success! The configuration is valid.


release terraform: PASS (roots + 3/3 modules)
```
