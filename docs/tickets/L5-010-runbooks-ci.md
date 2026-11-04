## TICKET L5-010 — Runbook việc Duy tự làm (A2 prep) + kiểm CI trên GitHub

- Trạng thái: **Assigned → subagent L5** (2026-11-04, đợt 10), nhánh `lane/L5-010`, worktree `D:/tqa-worktrees/L5-010`
- Lane / milestone: L5 Platform & A2 prep / chuẩn bị A2 (**không** chạm cloud)
- Spec: §11 (hosting, guardrail chi phí, §11.1 điều kiện trước A2, §11.4 danh sách resource), §11.6 (CI), Q23–Q26

### Việc
1. **Runbook từng bước** cho việc chỉ Duy được làm (tiếng Việt, mỗi bước có "kiểm tra đã đúng chưa"), trong `docs/runbook/`:
   - `aws-account-and-credits.md`: ghi ngày đăng ký, ngày hết hạn credits, bật MFA root, tạo IAM Identity Center user cho công việc hằng ngày, không tạo access key cho root.
   - `aws-budgets.md`: Budgets cảnh báo 5 và 10 USD/tháng (đề xuất, Duy chốt — Q-07), anomaly detection, SNS email, thử nhận cảnh báo (Q25).
   - `aws-paid-plan.md`: khi nào cần nâng (theo §11), hậu quả với credits.
   - `domain-and-acm.md`: chọn registrar/TLD, Route 53 hosted zone, ACM ở `us-east-1` cho CloudFront, CAA, `www` → apex (Q24).
   - Không ghi bất kỳ ID tài khoản, email, key nào; chỗ cần giá trị dùng `<...>`.
2. **Terraform**: kiểm `infra/` hiện có; nếu máy chưa có `terraform` thì ghi BLOCKED (không tự cài công cụ hệ thống); có thì `terraform fmt -check` + `terraform validate` (không `init` với backend thật — dùng `-backend=false`), không `plan/apply`.
3. **CI trên GitHub**: repo đã push (`github.com/Crozn1812/the-quiet-atlas`, workflow `.github/workflows/pr.yml` chạy khi push `main`). Đọc trạng thái lần chạy đầu ở trang Actions công khai (chỉ đọc, không đăng nhập, không đổi cài đặt). Lỗi do môi trường CI (ví dụ thiếu Edge trên ubuntu, gitleaks) → sửa workflow trong vùng `.github/`; lỗi sản phẩm → báo Lead.
- Được sửa: `.github/`, `infra/` (chỉ viết + validate), `tools/checks/`, `docs/runbook/`
- Không được sửa: `src/`, `tests/`, `package.json`, lockfile, config gốc, các docs khác. Không `terraform apply/plan`, không tạo resource, không đăng nhập AWS/GitHub, không push (Lead push).
- Điều kiện xong: runbook đủ 4 file; kết quả validate (hoặc BLOCKED + lý do); trạng thái CI lần đầu kèm log tóm tắt các bước fail; nếu sửa workflow: giải thích từng thay đổi. Không commit.
