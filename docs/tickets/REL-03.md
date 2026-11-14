## TICKET REL-03 — Kiểm tra bộ phát hành trước gate cuối

- Lane / milestone: L5 Platform / release kit (Definition of Done: Terraform validate, deploy workflow, runbook).
- Bối cảnh: REL-01 (`9195129`, deploy workflow OIDC) và REL-02 (`4b6e8a0`, Terraform validate) đã merge trước đợt đồ họa C. Từ đó world thêm `public/world/{tex,env,lib,character}` (KTX2, GLB, HDRI) và tổng world ~15 MB.
- Việc (không build Next, không chạm cloud, **không `terraform apply`/`plan` với credential**):
  1. `terraform -chdir=infra/... init -backend=false && terraform validate` cho mọi module; `terraform fmt -check`. Dán output.
  2. Đọc workflow deploy trong `.github/workflows/`: MIME/Content-Type và Cache-Control cho `.ktx2`, `.glb`, `.hdr`/`.ktx2` env, `.webm`, font; nén (gzip/br) đúng loại; không cache dài cho HTML. Nếu thiếu: sửa workflow hoặc cấu hình S3/CloudFront trong `infra/` (chỉ file, không apply). Có `actionlint` thì chạy.
  3. Đối chiếu runbook trong `docs/runbook/` (deploy, Budgets, tên miền, ACM, nâng Paid plan) với script/lệnh hiện tại: lệnh nào sai tên, đường dẫn nào không còn. Sửa runbook.
  4. Danh sách việc Duy phải tự làm trước lần deploy đầu, theo thứ tự, ghi vào `docs/runbook/release-checklist.md` (mới): mỗi bước 1 dòng, link runbook.
- Được sửa: `.github/workflows/**`, `infra/**`, `docs/runbook/**`, `tools/checks/**`.
- Không được sửa: `src/**`, `public/**`, lockfile, `package.json`, `docs/adr/`, STATUS, DUY_QUEUE.
- Xong: validate/fmt/actionlint output thật; bàn giao liệt kê từng thay đổi + lý do. `bash tools/lead/gate.sh .` → GATE PASS. Không commit.
