# Checklist lần deploy đầu — Duy thực hiện theo thứ tự

Mỗi bước chỉ đánh dấu xong khi có kết quả thật; các bước cloud dưới đây không được chạy trong lượt audit REL-03.

1. [Tài khoản/MFA](aws-account-and-credits.md): kiểm MFA, user/SSO hằng ngày, Billing access và credit thực tế 100 USD hết hạn 2027-05-05 trên console.
2. [Budgets](aws-budgets.md): chốt ngưỡng, bật Free Tier alerts, tạo Budgets trước credit + Cost Anomaly + SNS và xác nhận email thử Q25-a tới hộp thư.
3. [Paid plan](aws-paid-plan.md): đọc điều khoản hiện tại, kiểm phương thức thanh toán, tự nâng account và kiểm credit/Budgets sau nâng.
4. [Tên miền](domain-and-acm.md): kiểm `nhbduy.id.vn` Active, quyền sửa NS, ngày gia hạn; thống nhất Terraform quản lý zone/cert, chuẩn bị import nếu đã tạo tay.
5. [Terraform kiểm tĩnh](terraform.md#2-kiểm-tĩnh-ai-cũng-chạy-được-không-cần-aws): chạy `node tools/checks/release-terraform.mjs`, chỉ tiếp tục khi fmt/init/validate hai root và ba module đạt.
6. [Terraform kiểm trước apply](terraform.md#6-deferred): cùng Lead giải quyết tflint/Checkov hoặc Trivy còn DEFERRED và xem quyền IAM trước khi cho phép apply A2.
7. [Bootstrap](terraform.md#4-chạy-bootstrap--prod-chỉ-khi-duy-cho-phép--ghi-lại-ai-khi-nào): dùng phiên SSO ngắn hạn, điền tfvars riêng, duyệt plan/apply bootstrap và sao lưu state local ngoài repo.
8. [Prod lần đầu](terraform.md#4-chạy-bootstrap--prod-chỉ-khi-duy-cho-phép--ghi-lại-ai-khi-nào): điền backend, bucket, `domain_name`, `dns_certificate_enabled=false`, email/topic vận hành; init backend thật bằng `-reconfigure`, duyệt plan/apply tạo zone/CAA/site/alarm.
9. [SNS vận hành](terraform.md#3-thứ-tự-a2-khi-duy-giao-a2--111-114): xác nhận subscription `tqa-site-alerts` hoặc topic có sẵn và thử kênh email ALARM/OK.
10. [CloudFront Free plan](terraform.md#5-việc-thủ-công-provider-chưa-hỗ-trợ--không-nên-tự-động): tự đăng ký flat-rate Free, gắn distribution/hosted zone và cùng Lead kiểm drift trước apply tiếp.
11. [DNS delegation](domain-and-acm.md#bước-4--đặt-4-nameserver-ở-registrar): lấy output `name_servers`, đổi đúng bốn NS ở registrar và kiểm NS/CAA công khai.
12. [ACM/alias](domain-and-acm.md#luồng-release-hiện-tại-rel-02--rel-03): chỉ sau delegation hoạt động mới bật `dns_certificate_enabled=true`, duyệt prod plan/apply lần hai, đợi ACM us-east-1 Issued cho apex/www và kiểm HTTPS/redirect.
13. [Role deploy OIDC](deploy.md#chuẩn-bị-một-lần): lấy bucket/distribution output prod, điền bootstrap, duyệt plan/apply tạo `site-deploy` chỉ tin repo/main đúng audience.
14. [GitHub variables](deploy.md#chuẩn-bị-một-lần): đặt `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET`, `CF_DISTRIBUTION_ID`, `SITE_URL=https://nhbduy.id.vn`; không gắn GitHub Environment vào job deploy.
15. [Gate cuối](full-check.md): cùng Lead xác nhận commit main cần phát hành có PR checks/gate xanh, kiểm kết quả build/e2e/perf do Lead phụ trách và ghi nhận các giới hạn release.
16. [Deploy thủ công](deploy.md#mỗi-lần-phát-hành): Actions → Deploy production → main → `confirm=deploy`, chờ upload/MIME và invalidation HTML/World Completed.
17. [Smoke test](deploy.md#kiểm-tra-sau-deploy-powershell-trên-máy-duy): kiểm HTTPS/canonical/CV, World, MIME/cache/nén/security headers, URL S3 bị chặn rồi gửi Lead run URL + commit SHA + kết quả đã che thông tin riêng.
