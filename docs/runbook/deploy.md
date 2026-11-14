# Deploy production — REL-01 / REL-03

Người thao tác: **Duy**. Ticket này chỉ viết cấu hình; worker/Lead không chạy workflow, deploy,
`plan`/`apply`, tạo resource hay cấu hình credential. Không có access key/secret key trong workflow.

```text
Duy → Actions / Deploy production → main → confirm=deploy
Node 24 → pnpm install --frozen-lockfile → build out/
check:bundle + check:licenses + check:assets → OIDC role giới hạn repo/main
S3: _next/static immutable + world revalidate trước → mutable/HTML sau → sửa MIME
CloudFront: invalidate HTML + /world/* → chờ Completed → Duy smoke test HTTPS/canonical/PDF/World
```

## Chuẩn bị một lần

Làm theo thứ tự trong [checklist phát hành đầu](release-checklist.md); chỉ Duy thực hiện các bước AWS/GitHub.

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
6. Mở run vừa tạo và chờ job xanh, bao gồm bước **Invalidate HTML and world and wait for completion**.

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

Trong DevTools → Network, lấy URL thật của một KTX2 texture, GLB, KTX2 environment, WASM decoder,
font và video/HDR nếu bản phát hành có dùng; chạy `curl.exe --fail --silent --show-error --head '<URL>'`.
Đối chiếu Content-Type/Cache-Control với bảng dưới; không dùng đường dẫn asset minh họa không tồn tại.
Kiểm nén bằng `curl.exe --fail --silent --show-error --head -H 'Accept-Encoding: gzip, br' '<URL-JS-hoặc-CSS>'`;
CloudFront có thể bỏ qua nén, chỉ kết luận sau khi kiểm response thật. WOFF2/KTX2/GLB/WebM không được gắn
Content-Encoding gzip/br nếu bytes origin chưa nén theo encoding đó.

Chỉ báo thành công sau khi tất cả kiểm tra đạt; gửi Lead link run, commit SHA, kết quả smoke test,
không gửi ARN/credential. Nếu canonical sai, sửa `SITE_URL` rồi chạy workflow lại để build lại HTML.

## Cache, xóa file và giới hạn

- `_next/static/`: `public, max-age=31536000, immutable`, upload trước HTML; tên hash đổi theo nội dung.
- `world/`: `no-cache, max-age=0, must-revalidate`, upload trước HTML và giữ các path của bản trước.
  Tên World hiện chưa đồng loạt có content hash nên không cache immutable. `cp` sửa cả metadata file không đổi.
  Khi thay nội dung tại URL cũ, phiên World đang mở vẫn có thể trộn asset giữa hai bản; cần version path để
  bảo đảm phiên cũ hoàn toàn. Browser đã nhận immutable từ bản deploy cũ vẫn cần URL mới để bỏ cache đó.
- Những file còn lại (gồm HTML, manifest CV, PDF, sitemap, robots): `no-cache, max-age=0, must-revalidate`.
  Bước `cp` upload lại mutable để sửa metadata cả khi `sync` bỏ qua file không đổi.
- `sync out/ ... --delete` loại trừ `_next/static/` và `world/` để giữ asset của phiên World đang mở (§11.6).
  Nó xóa mutable đã mất khỏi `out/`; không đồng bộ repo/state/credential. Chưa có job dọn asset cũ sau 7 ngày.
- Invalidation gửi `/`, `/world/*`, URL từng HTML và URL thư mục tương ứng từ `out/`, rồi chờ Completed.
  [CloudFront chỉ hiểu wildcard ở cuối path](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/invalidation-specifying-objects.html#invalidation-specifying-objects-paths);
  đã bỏ hai mẫu không có tác dụng `/*.html`, `/*/`. Ví dụ `/en/index.html` và `/en/` đều được gửi.
  Không có invalidation toàn bộ `/*`; `_next/static/` không bị invalidate.
- Prod hiện dùng managed `CachingOptimized`: CloudFront vẫn có thể giữ HTML ít nhất 1 giây dù header no-cache;
  xem [AWS managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policy-caching-optimized).
- Upload S3 nhiều file không nguyên tử. Chưa có release artifact/rollback tự động, build-info, smoke test tự động
  hoặc cleanup định kỳ trong REL-01. Không dùng tùy tiện ref nhánh khác để rollback vì trust chỉ nhận main;
  Lead chuẩn bị revert trên main rồi Duy chạy lại workflow.

SHA action mới được đối chiếu từ commit upstream:
[pnpm setup v6](https://github.com/pnpm/action-setup/commit/73e46992e05b19abd31f2f3c20e0e7370d762115),
[AWS credentials v5.1.1](https://github.com/aws-actions/configure-aws-credentials/commit/61815dcd50bd041e203e49132bacad1fd04d2708).
Checkout/Node dùng SHA đã có trong job Terraform của `pr.yml`.

## MIME và nén (REL-03)

`tools/checks/upload-asset-metadata.sh` upload lại các loại dưới bằng `aws s3 cp --content-type`, giữ nguyên bytes,
để MIME không phụ thuộc cơ sở dữ liệu `mimetypes` của runner và sửa được metadata của object không đổi.

| Đuôi | Content-Type origin | Cache-Control |
|---|---|---|
| `.ktx2` (texture và environment) | `image/ktx2` | revalidate trong World |
| `.glb` | `model/gltf-binary` | revalidate ngoài `_next/static/` |
| `.gltf` | `model/gltf+json` | revalidate ngoài `_next/static/` |
| `.hdr` (Radiance RGBE) | `application/octet-stream` (binary fallback) | revalidate ngoài `_next/static/` |
| `.webm` | `video/webm` | revalidate ngoài `_next/static/` |
| `.woff2`, `.woff`, `.ttf`, `.otf` | `font/woff2`, `font/woff`, `font/ttf`, `font/otf` | immutable chỉ trong `_next/static/` |
| `.eot` | `application/vnd.ms-fontobject` | immutable chỉ trong `_next/static/` |
| `.wasm` | `application/wasm` | immutable chỉ trong `_next/static/` |

HTML/JS/CSS/JSON/PDF/SVG dùng MIME do AWS CLI suy ra theo đuôi; HTML luôn revalidate ở origin.
Không tạo file `.gz`/`.br`, không đặt Content-Encoding khi upload. Terraform hiện có `compress = true` + managed
`CachingOptimized` (cache key có Accept-Encoding cho gzip/br): CloudFront tự thương lượng nén các MIME được hỗ trợ
như HTML/JS/CSS/JSON/SVG/WASM/TTF/OTF, với object 1.000–10.000.000 bytes. KTX2, GLB, HDR, WebM, WOFF/WOFF2
không nằm trong danh sách edge compression; giữ binary gốc, không đổi MIME để ép nén.
Nguồn: [AWS compression](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/ServingCompressedFiles.html),
[Khronos KTX2 media type](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html#_iana_media_type_registration_information).

Kiểm helper không chạm cloud: `node --test tools/checks/release-upload.test.mjs` (AWS được mock hoàn toàn).
