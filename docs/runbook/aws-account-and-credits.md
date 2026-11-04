# Runbook — Tài khoản AWS, credits, MFA root, người dùng hằng ngày

> Người làm: **Duy** (chủ tài khoản). AI không đăng nhập, không tạo gì trên AWS.
> Spec: §11.1, §11.6. Liên quan hàng đợi: Q-07, Q-08.
> Viết ngày 2026-11-04 (L5-010). Giao diện console AWS thay đổi thường xuyên: tên nút ghi trong ngoặc kép là tên **theo hiểu biết lúc viết**; chỗ ghi *(chưa chắc nhãn)* thì tìm mục tương đương, đừng đoán bừa — nếu không thấy, chụp màn hình gửi Lead.

## Quy tắc chung (đọc trước)

- **Không** gửi qua chat, không ghi vào repo: ID tài khoản (12 số), email root, mật khẩu, mã MFA, access key, ARN. Repo này public; CI có luật quét ID tài khoản và ARN (`.gitleaks.toml`).
- Mọi chỗ cần giá trị thật trong runbook ghi `<...>`; bạn điền **trong đầu / trong trình quản lý mật khẩu**, không điền vào file.
- Chỉ gửi Lead: **ngày** (đăng ký, hết hạn credits) và kết quả "đã làm / chưa làm" của từng bước.

---

## Bước 1 — Ghi ngày đăng ký tài khoản

1. Đăng nhập console bằng root (`https://console.aws.amazon.com/`).
2. Tìm ngày tạo tài khoản: email chào mừng của AWS ("Welcome to Amazon Web Services") trong hộp thư root là nguồn chắc nhất. Trong console, thông tin gói Free plan (số ngày còn lại) thường hiện ở trang chủ console hoặc trong **Billing and Cost Management** *(chưa chắc vị trí widget)*.
3. Ghi lại: `Ngày đăng ký: <YYYY-MM-DD>`.

**Kiểm tra đã đúng chưa:** ngày bạn ghi khớp ngày của email chào mừng. Từ ngày đó tính ra:
- Mốc 6 tháng (Free plan hết hạn nếu chưa nâng Paid): `<ngày đăng ký + 6 tháng>`.
- Mốc 12 tháng (credits còn lại hết hiệu lực sau khi đã nâng Paid): `<ngày đăng ký + 12 tháng>`.

## Bước 2 — Ghi số credits và ngày hết hạn credits

1. Console → ô tìm kiếm gõ `Billing` → **Billing and Cost Management**.
2. Menu trái → **Credits**.
3. Bảng credits có cột số tiền còn lại và ngày hết hạn (Expiration date). Ghi: `Credits còn: <số> USD, hết hạn: <YYYY-MM-DD>`.
4. Nếu bảng **trống**: credit chưa được cấp (DUY_QUEUE ghi "đang chờ credit free"). Ghi "chưa có", làm lại bước này sau vài ngày.

**Kiểm tra đã đúng chưa:** ngày hết hạn credits không muộn hơn mốc 12 tháng ở Bước 1 (theo §11.1). Nếu khác → báo Lead (spec dựa trên dữ kiện ngày 03/11/2026, có thể AWS đã đổi).

**Gửi Lead (Q-08):** chỉ 3 thông tin: ngày đăng ký, số credits, ngày hết hạn credits. Lead ghi vào `docs/PROJECT_STATUS.md`.

## Bước 3 — Đặt nhắc việc

Trong lịch cá nhân (Google Calendar / điện thoại), tạo 2 nhắc việc:

- `<mốc 6 tháng − 30 ngày>`: "AWS: phải nâng Paid plan trước <mốc 6 tháng> nếu chưa nâng" (xem `aws-paid-plan.md`).
- `<mốc 12 tháng − 30 ngày>`: "AWS: credits hết hiệu lực <mốc 12 tháng>; kiểm tra chi phí sau credits".

**Kiểm tra đã đúng chưa:** mở lịch, thấy 2 sự kiện đúng ngày, có bật thông báo.

## Bước 4 — Bật MFA cho root

1. Console (đăng nhập root) → bấm tên tài khoản góc trên phải → **Security credentials**.
2. Mục **Multi-factor authentication (MFA)** → **Assign MFA device**.
3. Đặt tên thiết bị `<tên-thiết-bị>`, chọn loại:
   - **Passkey or security key** (khuyến nghị nếu có khóa vật lý / passkey), hoặc
   - **Authenticator app** (Google Authenticator, Microsoft Authenticator, 1Password…).
4. Làm theo hướng dẫn (quét QR, nhập 2 mã liên tiếp với app).
5. Lưu mã khôi phục / thông tin MFA ở nơi an toàn ngoài máy tính (trình quản lý mật khẩu). Nên đăng ký **2 thiết bị MFA** (AWS cho phép nhiều thiết bị cho root) để không bị khóa khi mất điện thoại.

**Kiểm tra đã đúng chưa:**
- Trang Security credentials liệt kê thiết bị MFA của bạn.
- Đăng xuất, đăng nhập lại bằng root: AWS **phải hỏi MFA**. Hỏi → đạt. Không hỏi → làm lại bước 4.

## Bước 5 — Không có access key cho root

1. Vẫn ở **Security credentials** của root → mục **Access keys**.
2. Phải trống. Nếu có key (kể cả "Inactive") → **Actions → Delete**. (Đây là xóa *khóa truy cập* của chính bạn, không phải dữ liệu.)

**Kiểm tra đã đúng chưa:** mục Access keys hiện "No access keys" *(chưa chắc nhãn)* hoặc không còn dòng nào.

## Bước 6 — Tạo người dùng cho công việc hằng ngày (không dùng root)

Spec §11.1 mục 4: "IAM Identity Center hoặc ít nhất MFA cho root". Thứ tự đề xuất:

### 6A — IAM Identity Center (ưu tiên, nhưng có thể chưa làm được trên Free plan)

Để Identity Center cấp quyền vào **chính tài khoản AWS**, cần *organization instance* (bật Identity Center sẽ tạo AWS Organizations với tài khoản của bạn là management account). *Account instance* chỉ dùng cho ứng dụng, **không** cấp quyền vào console AWS. **Chưa chắc** tài khoản Free plan có được tạo AWS Organizations hay không — nếu console báo không được, chuyển sang 6B và làm lại 6A sau khi nâng Paid plan.

1. Console → tìm `IAM Identity Center` → chọn region `ap-southeast-1` (Singapore) ở góc trên phải trước khi bật (region này là nơi lưu danh tính; khó đổi về sau).
2. **Enable** → chọn bật cùng AWS Organizations (organization instance).
3. **Users → Add user**: username `<tên-đăng-nhập>`, email `<email-của-bạn>` → gửi lời mời qua email; đặt mật khẩu qua link trong email.
4. **Permission sets → Create permission set** → **Predefined permission set** → `AdministratorAccess` (giai đoạn A2 một người làm; sau A2 có thể thu hẹp). Session duration để mặc định.
5. **AWS accounts** → chọn tài khoản của bạn → **Assign users or groups** → chọn user ở bước 3 → chọn permission set ở bước 4 → Submit.
6. **Settings → Authentication**: bật yêu cầu MFA khi đăng nhập *(chưa chắc nhãn: "Configure multi-factor authentication" — chọn "Every time they sign in")*.
7. Lấy **AWS access portal URL** ở trang Dashboard/Settings (dạng `https://<...>.awsapps.com/start`) — lưu vào bookmark, **không** gửi vào chat/repo.

**Kiểm tra đã đúng chưa:**
- Mở access portal URL trong cửa sổ ẩn danh, đăng nhập user mới → bị hỏi MFA → thấy tài khoản AWS và role `AdministratorAccess` → bấm vào được console.
- Góc trên phải console hiện tên dạng `AWSReservedSSO_AdministratorAccess_<...>/<tên-đăng-nhập>` (không phải "root").

### 6B — Phương án dự phòng: IAM user có MFA, không access key

Chỉ dùng khi 6A chưa làm được.

1. Console → `IAM` → **Users → Create user** → tên `<tên-đăng-nhập>` → tick **Provide user access to the AWS Management Console** → chọn "I want to create an IAM user" → mật khẩu tự đặt (mạnh, lưu trong trình quản lý mật khẩu).
2. Quyền: **Attach policies directly** → `AdministratorAccess` (hoặc tạo group `admins` gắn policy này rồi thêm user vào group).
3. **Không** tạo access key (bỏ qua mọi gợi ý "Create access key"). CI sau này dùng OIDC (§11.6), không cần key dài hạn.
4. Đăng nhập bằng user mới (URL đăng nhập IAM dạng `https://<account-id-hoặc-alias>.signin.aws.amazon.com/console`) → góc trên phải → **Security credentials** → **Assign MFA device** như Bước 4.

**Kiểm tra đã đúng chưa:**
- Đăng nhập user mới phải hỏi MFA.
- IAM → Users → user này: cột MFA có thiết bị; mục Access keys trống.

## Bước 7 — Cất root

Từ nay chỉ dùng root cho việc bắt buộc root (nâng Paid plan nếu AWS yêu cầu, đổi thông tin thanh toán, đóng tài khoản). Mọi việc khác (Budgets, Route 53, ACM…) làm bằng user ở Bước 6.

Lưu ý: với IAM user / Identity Center, mục Billing có thể bị chặn cho đến khi root bật **"IAM user and role access to Billing information"** (root → tên tài khoản → **Account** → mục *IAM user and role access to Billing information* → Edit → Activate). Cần bật để làm `aws-budgets.md` bằng user hằng ngày.

**Kiểm tra đã đúng chưa:** đăng nhập user hằng ngày → mở Billing and Cost Management → thấy được trang Bills/Credits (không bị "Access denied").

---

## Báo lại cho Lead (copy, điền, gửi)

```
AWS account (L5-010):
- Ngày đăng ký: <YYYY-MM-DD>
- Credits: <số> USD, hết hạn <YYYY-MM-DD>  (hoặc: chưa có)
- Nhắc việc 6 tháng / 12 tháng: đã đặt / chưa
- MFA root: đã bật (đã thử đăng nhập lại) / chưa
- Access key root: không có / đã xóa
- User hằng ngày: Identity Center / IAM user (6B) / chưa — MFA: có/không
- Billing access cho IAM: đã bật / chưa
```
