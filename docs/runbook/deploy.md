# Deploy production — REL-01

Người thao tác: **Duy**. Ticket này chỉ viết cấu hình; worker/Lead không chạy workflow, deploy,
`plan`/`apply`, tạo resource hay cấu hình credential. Không có access key/secret key trong workflow.

```text
Duy → Actions / Deploy production → main → confirm=deploy
Node 24 → pnpm install --frozen-lockfile → build out/
check:bundle + check:licenses → OIDC role giới hạn repo/main
S3: immutable trước → mutable/HTML sau → xóa mutable thừa
CloudFront: invalidate HTML → chờ Completed → Duy smoke test HTTPS/canonical/PDF
```

## Chuẩn bị một lần

Điều kiện trước khi bắt đầu: Lead đã merge workflow vào `main`, PR checks của commit cần phát hành xanh;
Duy đã hoàn tất [tài khoản/MFA](aws-account-and-credits.md), [guardrail chi phí](aws-budgets.md),
[Paid plan](aws-paid-plan.md), [Terraform](terraform.md) và [DNS/ACM](domain-and-acm.md).
S3/CloudFront phải tồn tại; workflow không tạo chúng. Các lệnh dưới chạy tại gốc repo trên máy Duy,
với phiên AWS riêng của Duy đã được thiết lập theo runbook Terraform; không gửi output ARN/state qua chat.

1. Chạy `terraform -chdir=infra/envs/prod output -raw site_bucket_name`.
2. Trong `infra/bootstrap/terraform.tfvars` riêng trên máy Duy, đặt `site_bucket_name` bằng output bước 1.
3. Chạy `terraform -chdir=infra/envs/prod output -raw distribution_id`.
4. Trong cùng file tfvars riêng, đặt `site_distribution_id` bằng output bước 3.
5. Trong cùng file, kiểm tra `github_repository` đúng repo GitHub dạng `owner/repo` (mặc định `Crozn1812/the-quiet-atlas`).
6. Chạy `terraform -chdir=infra/bootstrap plan -out=deploy-role.tfplan`.
7. Đọc plan: role `site-deploy` phải tin đúng `repo:<owner>/<repo>:ref:refs/heads/main`, audience `sts.amazonaws.com`; policy chỉ ListBucket, PutObject/DeleteObject của bucket site, CreateInvalidation/GetInvalidation của distribution; không thay role Terraform ngoài dự kiến.
8. **Chỉ Duy** chạy `terraform -chdir=infra/bootstrap apply deploy-role.tfplan` sau khi đã duyệt plan.
9. Chạy `terraform -chdir=infra/bootstrap output -raw site_deploy_role_arn` (phải khác rỗng).
10. Tại GitHub repo → Settings → Secrets and variables → Actions → Variables → New repository variable, tạo `AWS_DEPLOY_ROLE_ARN` từ bước 9.
11. Tại cùng chỗ, tạo `SITE_BUCKET` từ bước 1.
12. Tại cùng chỗ, tạo `CF_DISTRIBUTION_ID` từ bước 3.
13. Tại cùng chỗ, tạo `SITE_URL` = HTTPS origin công khai, không path/query/fragment, ví dụ `https://nhbduy.id.vn`.

| GitHub repository variable | Nguồn |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `infra/bootstrap`: output `site_deploy_role_arn` |
| `SITE_BUCKET` | `infra/envs/prod`: output `site_bucket_name` |
| `CF_DISTRIBUTION_ID` | `infra/envs/prod`: output `distribution_id` |
| `SITE_URL` | `https://<domain_name>` đã có DNS/ACM; nếu chưa có domain, dùng `https://` + output `distribution_domain_name` của prod |

Region workflow cố định `ap-southeast-1`, khớp mặc định prod/bootstrap; không cần variable region.
Không tạo `AWS_ACCESS_KEY_ID` hoặc `AWS_SECRET_ACCESS_KEY`.
Không gắn job vào GitHub Environment: token environment có `sub` khác và sẽ bị trust main từ chối.
REL-01 thay trust environment của riêng `site-deploy` bằng trust main; `tf-apply` vẫn dùng environment `production`.
Giữ file plan/state/tfvars riêng ngoài commit (plan đã được `.gitignore` loại trừ).

## Mỗi lần phát hành

1. Mở GitHub → Actions → **Deploy production**.
2. Bấm **Run workflow** để mở form.
3. Chọn branch **main**.
4. Nhập chính xác `deploy` vào ô `confirm`.
5. Bấm **Run workflow** để phát hành.
6. Mở run vừa tạo và chờ job xanh, bao gồm bước **Invalidate HTML and wait for completion**.

Sai branch hoặc confirm → job skipped, không nhận credential AWS. Deploy được xếp hàng theo concurrency,
không hủy giữa lúc upload. Checkout giữ commit main tại thời điểm dispatch, không tự kéo commit mới giữa run.
Nếu build/check lỗi thì chưa assume role và chưa upload. Nếu upload/invalidation lỗi thì run đỏ;
site có thể đã nhận một phần file: đọc log rồi chạy lại sau khi sửa nguyên nhân, chưa báo phát hành thành công.

## Kiểm tra sau deploy (PowerShell trên máy Duy)

Mỗi mục là một lệnh hoặc một thao tác. Dùng đúng `SITE_URL` đã tạo ở trên.

1. Đặt origin: `$site = 'https://nhbduy.id.vn'` (thay bằng origin đang phát hành).
2. Kiểm tra trang gốc: `curl.exe --fail --silent --show-error --output NUL --write-out '%{http_code}\n' "$site/"` — phải in `200` và exit 0, không dùng `-k`.
3. Kiểm tra Quick: `curl.exe --fail --silent --show-error --output NUL --write-out '%{http_code}\n' "$site/en/quick/"` — phải in `200`.
4. Kiểm tra canonical: `(curl.exe --fail --silent --show-error "$site/en/quick/") | Select-String -AllMatches -Pattern '<link[^>]*rel="canonical"[^>]*>' | ForEach-Object { $_.Matches.Value }` — href phải là `$site/en/quick/`.
5. Kiểm tra canonical trang gốc: `(curl.exe --fail --silent --show-error "$site/") | Select-String -AllMatches -Pattern '<link[^>]*rel="canonical"[^>]*>' | ForEach-Object { $_.Matches.Value }` — href phải là `$site/en/`.
6. Lấy danh sách PDF hiện hành: `$cv = Invoke-RestMethod "$site/cv/manifest.json"`.
7. Tải CV EN: `curl.exe --fail --silent --show-error --dump-header - --output "$env:TEMP/tqa-cv-en.pdf" "$site$($cv.en)"` — phải HTTP 200, Content-Type `application/pdf`, exit 0.
8. Tải CV VI: `curl.exe --fail --silent --show-error --dump-header - --output "$env:TEMP/tqa-cv-vi.pdf" "$site$($cv.vi)"` — phải HTTP 200, Content-Type `application/pdf`, exit 0.
9. Mở PDF EN: `Start-Process "$env:TEMP/tqa-cv-en.pdf"` — đọc được trang CV.
10. Mở PDF VI: `Start-Process "$env:TEMP/tqa-cv-vi.pdf"` — đọc được tiếng Việt.
11. Mở `$site/cv/` trong trình duyệt và bấm link PDF EN.
12. Trên cùng trang, bấm link PDF VI.
13. Kiểm header HTML: `curl.exe --fail --silent --show-error --head "$site/en/quick/"` — có `no-cache, max-age=0, must-revalidate` và security headers.
14. Mở World trong trình duyệt, vào thế giới và kiểm tra asset tải được.

Chỉ báo thành công sau khi tất cả kiểm tra đạt; gửi Lead link run, commit SHA, kết quả smoke test,
không gửi ARN/credential. Nếu canonical sai, sửa `SITE_URL` rồi chạy workflow lại để build lại HTML.

## Cache, xóa file và giới hạn

- `_next/static/` và `world/`: `public, max-age=31536000, immutable`, upload trước HTML.
  Tên asset phải đổi khi nội dung đổi; riêng `world/` có đường dẫn ổn định thì client đã cache có thể giữ bản cũ
  một năm. Lead phải version tên/path trước khi thay nội dung tại URL đã phát hành.
- Những file còn lại (gồm HTML, manifest CV, PDF, sitemap, robots): `no-cache, max-age=0, must-revalidate`.
  Bước `cp` upload lại mutable để sửa metadata cả khi `sync` bỏ qua file không đổi.
- `sync out/ ... --delete` loại trừ hai prefix immutable để giữ chunk của phiên World đang mở (§11.6).
  Nó xóa mutable đã mất khỏi `out/`; không đồng bộ repo/state/credential. Chưa có job dọn asset cũ sau 7 ngày.
- Invalidation gửi `/*.html`, `/`, `/*/` theo ticket, cộng URL từng HTML và URL thư mục tương ứng từ `out/`,
  rồi chờ Completed. Lý do: [CloudFront chỉ hiểu wildcard ở cuối path](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/invalidation-specifying-objects.html#invalidation-specifying-objects-paths);
  hai mẫu có dấu `*` giữa path là literal, không tự bao phủ HTML. Ví dụ `/en/index.html` và `/en/` đều được gửi.
  Không có invalidation toàn bộ `/*`. URL immutable không được làm mới bằng lần phát hành này.
- Prod hiện dùng managed `CachingOptimized`: CloudFront vẫn có thể giữ HTML ít nhất 1 giây dù header no-cache;
  xem [AWS managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policy-caching-optimized).
- Upload S3 nhiều file không nguyên tử. Chưa có release artifact/rollback tự động, build-info, smoke test tự động
  hoặc cleanup định kỳ trong REL-01. Không dùng tùy tiện ref nhánh khác để rollback vì trust chỉ nhận main;
  Lead chuẩn bị revert trên main rồi Duy chạy lại workflow.

SHA action mới được đối chiếu từ commit upstream:
[pnpm setup v6](https://github.com/pnpm/action-setup/commit/73e46992e05b19abd31f2f3c20e0e7370d762115),
[AWS credentials v5.1.1](https://github.com/aws-actions/configure-aws-credentials/commit/61815dcd50bd041e203e49132bacad1fd04d2708).
Checkout/Node dùng SHA đã có trong job Terraform của `pr.yml`.
