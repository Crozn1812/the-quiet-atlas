## TICKET REL-01 — workflow deploy (chỉ viết, không chạy)
- Mục tiêu: Duy bấm một nút trên GitHub Actions là bản `out/` lên S3 + CloudFront. Lead/worker **không** chạy deploy, không tạo resource, không đụng credential.
- Đọc: `infra/envs/prod/*.tf` (tên bucket, distribution qua output), `docs/runbook/aws-*.md`, `docs/runbook/domain-and-acm.md`, `.github/workflows/pr.yml`, spec §11.
- Làm:
  - `.github/workflows/deploy.yml`: chỉ `workflow_dispatch` (input `confirm: deploy`), Node 24, `pnpm install --frozen-lockfile`, build, chạy lại check:bundle/check:licenses, rồi `aws-actions/configure-aws-credentials` qua **OIDC** (`role-to-assume` từ `vars.AWS_DEPLOY_ROLE_ARN`, không secret key), `aws s3 sync out/ s3://${{ vars.SITE_BUCKET }} --delete` với cache-control đúng loại file (HTML no-cache; `_next/static`, `world/` immutable 1 năm), rồi `aws cloudfront create-invalidation` cho `/*.html`, `/`, `/*/` (dùng `vars.CF_DISTRIBUTION_ID`). Ghim action theo commit SHA.
  - Nếu `infra/` chưa có OIDC role cho GitHub: thêm module/resource trong `infra/` (role + trust `token.actions.githubusercontent.com` giới hạn repo + nhánh main, policy tối thiểu S3 put/delete/list bucket đó + CloudFront invalidation distribution đó) và output ARN.
  - `docs/runbook/deploy.md`: các bước Duy làm, theo thứ tự, mỗi bước một lệnh/1 chỗ bấm, có bước kiểm tra sau deploy (curl HTTPS 200, canonical, /cv/ PDF tải được).
- Được sửa: `.github/workflows/deploy.yml` (mới), `infra/**`, `docs/runbook/deploy.md` (mới).
- Điều kiện xong: `actionlint` nếu có, nếu không thì kiểm YAML parse bằng node; `terraform fmt -check`/`validate` nếu máy có terraform (không có thì ghi NOT RUN); lint/typecheck không đổi.
- Bàn giao: sơ đồ luồng 5 dòng, danh sách biến GitHub cần Duy tạo (tên, lấy từ output nào), việc chưa làm.
