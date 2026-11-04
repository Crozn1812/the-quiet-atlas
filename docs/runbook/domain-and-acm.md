# Runbook — Tên miền, Route 53 hosted zone, ACM (us-east-1), CAA, `www` → apex (Q24)

> Người làm: **Duy** mua tên miền và trỏ nameserver; các bước Route 53/ACM Duy làm tay **hoặc** giao Terraform (L5) khi A2 được duyệt (§11.3, §11.5). AI không mua, không tạo resource.
> Spec: §11.2 (TLS, Route 53 trong flat-rate plan), §11.3, §13 Q24. Hàng đợi: **Q-09**.
> Điều kiện trước: `aws-budgets.md` xong (Budgets có trước mọi resource — hosted zone là resource). Nên đã nâng Paid plan (`aws-paid-plan.md`) vì hosted zone chỉ miễn phí khi **gắn vào CloudFront flat-rate Free plan** (§11.2), mà Free account plan không dùng được flat-rate plan.
> Nhãn nút trong ngoặc kép theo hiểu biết lúc viết (2026-11-04); *(chưa chắc nhãn)* = tìm mục tương đương.

Ký hiệu: `<domain>` = tên miền apex Duy mua (ví dụ dạng `baoduy.<tld>` — Duy chọn), `www.<domain>` = bản www.

---

## Bước 1 — Chọn TLD và registrar (Q-09)

Tiêu chí (§11.3):

| Tiêu chí | Vì sao |
|---|---|
| **Giá gia hạn** (năm 2, 3…), không chỉ giá năm đầu | Portfolio giữ nhiều năm |
| WHOIS privacy miễn phí | Không lộ địa chỉ/số điện thoại |
| Cho **đổi nameserver** sang nameserver ngoài | Bắt buộc: V6 dùng Route 53 hosted zone gắn vào CloudFront plan. Tránh registrar ép dùng DNS của họ |
| Hỗ trợ DNSSEC | Bật sau khi ổn định (tùy chọn) |
| Có email forwarding | Dùng cho `hello@<domain>` (§11.3 mục 5), không dựng mail server trên AWS |

TLD:
- `.com`: dễ nhận biết nhất.
- `.dev` / `.app`: bắt buộc HTTPS (nằm sẵn trong HSTS preload) — hợp CloudFront; chỉ truy cập được sau khi có chứng chỉ.
- `.vn`: phải qua nhà đăng ký trong nước + hồ sơ cá nhân.
- Route 53 cũng bán tên miền, nhưng **credits AWS không trả phí đăng ký tên miền** [S12] — so giá như registrar khác.

Tên: ngắn, dễ đọc qua điện thoại (`baoduy.<tld>`, `nguyenhuubaoduy.<tld>`…). Duy chọn; Lead không chọn thay.

**Kiểm tra đã đúng chưa:** trước khi trả tiền, ghi ra: registrar `<tên>`, giá năm đầu `<...>`, **giá gia hạn** `<...>`, WHOIS privacy có/không, đổi nameserver có/không. Thiếu một ô → chưa mua.

## Bước 2 — Mua tên miền

Duy tự mua ở registrar đã chọn. Bật WHOIS privacy, bật tự gia hạn (auto-renew) nếu muốn, bật khóa chuyển (transfer lock).

**Kiểm tra đã đúng chưa:** trang quản lý tên miền ở registrar hiện `<domain>` trạng thái Active, ngày hết hạn `<YYYY-MM-DD>`. Ghi ngày hết hạn vào lịch (nhắc 30 ngày trước).

## Bước 3 — Tạo Route 53 public hosted zone

1. Console (user hằng ngày) → `Route 53` → **Hosted zones** → **Create hosted zone**.
2. Domain name: `<domain>` (apex, không có `www`). Type: **Public hosted zone**. → Create.
3. Mở hosted zone: có sẵn record **NS** (4 nameserver dạng `ns-<...>.awsdns-<...>.<com|net|org|co.uk>`) và **SOA**. **Không** sửa/xóa 2 record này.

Chi phí: hosted zone tính phí theo tháng **cho tới khi** được gắn vào CloudFront flat-rate Free plan (§11.2: gắn plan thì miễn phí, tối đa 50 record). *(Mức phí và cách gắn plan — kiểm lại trang giá Route 53 và trang flat-rate plan lúc làm.)* Vì vậy chỉ tạo hosted zone khi sắp làm CloudFront trong A2, không tạo sớm rồi để đó.

**Kiểm tra đã đúng chưa:** hosted zone `<domain>` có đúng 2 record NS và SOA, Type Public.

## Bước 4 — Đặt 4 nameserver ở registrar

1. Registrar → `<domain>` → mục Nameservers / DNS → chọn **Custom nameservers** *(nhãn tùy registrar)*.
2. Nhập đúng 4 giá trị NS từ Bước 3 (bỏ dấu chấm cuối nếu registrar không nhận).
3. Lưu. Thay đổi lan truyền có thể mất vài phút đến 48 giờ.

**Kiểm tra đã đúng chưa** (PowerShell, trên máy Duy):

```powershell
Resolve-DnsName -Name <domain> -Type NS -Server 8.8.8.8
```

Kết quả phải là **đúng 4** nameserver `awsdns` của hosted zone ở Bước 3. Còn nameserver cũ của registrar → chờ thêm, kiểm lại.

## Bước 5 — CAA: chỉ cho Amazon cấp chứng chỉ

Tạo **trước** khi yêu cầu chứng chỉ ACM (Bước 6). Route 53 → hosted zone `<domain>` → **Create record**:

- Record name: để trống (apex). Type: **CAA**. TTL: 300 (lúc đầu; tăng lên 3600 khi ổn định).
- Value (mỗi dòng một giá trị — theo danh sách CA của Amazon trong tài liệu ACM "CAA records"; kiểm lại tài liệu lúc làm):

```
0 issue "amazon.com"
0 issue "amazontrust.com"
0 issue "awstrust.com"
0 issue "amazonaws.com"
0 issuewild ";"
```

`issuewild ";"` = không cho cấp chứng chỉ wildcard (V6 không cần wildcard). CAA ở apex áp dụng luôn cho `www` nếu `www` không có CAA riêng.

**Kiểm tra đã đúng chưa:**

```powershell
nslookup -type=CAA <domain> 8.8.8.8
```

(Nếu `nslookup` của Windows không hiện CAA, dùng `Resolve-DnsName -Name <domain> -Type CAA -Server 8.8.8.8`; nếu cả hai đều không hỗ trợ, dùng một trang tra DNS công khai và chỉ nhập tên miền.) Phải thấy đủ các dòng ở trên, không có CA khác.

## Bước 6 — Chứng chỉ ACM ở **us-east-1**

CloudFront chỉ dùng chứng chỉ ACM ở **US East (N. Virginia) us-east-1** — kể cả khi S3 ở ap-southeast-1 (§11.5).

1. Góc trên phải console → chọn region **US East (N. Virginia)**. (Sai region là lỗi thường gặp nhất: chứng chỉ ở region khác sẽ không hiện khi gắn CloudFront.)
2. `Certificate Manager` → **Request a certificate** → **Request a public certificate** → Next.
3. Fully qualified domain names: `<domain>` → **Add another name to this certificate** → `www.<domain>`.
4. Validation method: **DNS validation (recommended)**. Key algorithm: để mặc định **RSA 2048** *(chưa chắc mặc định hiện tại; RSA 2048 tương thích rộng nhất)*. Nếu có mục "Allow export" → **Disable export** (chứng chỉ export được có tính phí).
5. **Request**.
6. Mở chứng chỉ (Status **Pending validation**) → mục Domains → **Create records in Route 53** → chọn cả 2 tên → Create records. (Tạo record CNAME `_<...>.<domain>` trong hosted zone.)
7. Chờ (thường vài phút đến ~30 phút).

**Kiểm tra đã đúng chưa:**
- ACM (us-east-1) → chứng chỉ Status **Issued**; cả `<domain>` và `www.<domain>` đều **Success**.
- Route 53 hosted zone có 2 record CNAME bắt đầu bằng `_` — **không xóa** (ACM dùng để tự gia hạn).
- Nếu kẹt Pending > 72 giờ: kiểm CAA (Bước 5) và NS (Bước 4).

## Bước 7 — `apex` + `www` trỏ về CloudFront, `www` → apex 301 (làm trong A2, cùng CloudFront)

Bước này cần distribution CloudFront đã có (ticket Terraform `static-site` + `dns` trong A2). Ghi ở đây để Duy biết đích đến; **không** làm trước khi có distribution.

1. Distribution: Alternate domain names (CNAMEs) = `<domain>` và `www.<domain>`; Custom SSL certificate = chứng chỉ ở Bước 6.
2. Route 53: record **A** và **AAAA** kiểu **Alias** cho `<domain>` → distribution; tương tự A/AAAA Alias cho `www.<domain>` → cùng distribution (§11.3 mục 3).
3. Redirect `www` → apex **301** do CloudFront Function viewer-request (L5 viết, §11.2) — không dùng bucket S3 redirect riêng.
4. HTTP → HTTPS: Viewer protocol policy **Redirect HTTP to HTTPS**.
5. HSTS: theo managed `SecurityHeadersPolicy`; **chưa** đăng ký HSTS preload (§11.3 mục 6).
6. `SITE_URL` của build đổi sang `https://<domain>` (Lead/L2 — canonical, sitemap).

**Kiểm tra đã đúng chưa (Q24)** — chạy trên máy Duy hoặc trong CI sau A2:

```powershell
curl.exe -sI https://<domain>/en/quick/          # HTTP/1.1 200 (hoặc HTTP/2 200), có strict-transport-security
curl.exe -sI https://www.<domain>/en/quick/      # 301, location: https://<domain>/en/quick/
curl.exe -sI http://<domain>/en/quick/           # 301, location: https://<domain>/en/quick/
```

Và: trình duyệt mở `https://<domain>` không cảnh báo chứng chỉ; xem chứng chỉ có cả `<domain>` và `www.<domain>`; `sitemap.xml` và thẻ canonical dùng `https://<domain>`.

## Bước 8 — Email (tùy chọn, §11.3 mục 5)

- `hello@<domain>`: dùng email forwarding của registrar (hoặc dịch vụ email riêng). Không dựng mail server trên AWS.
- Khi email đi qua dịch vụ nào thì thêm SPF theo hướng dẫn **của dịch vụ đó** (record TXT ở apex), và DMARC `_dmarc.<domain>` TXT `v=DMARC1; p=none; rua=mailto:<email-nhận-báo-cáo>` lúc đầu.
- Lưu ý: nameserver đã chuyển về Route 53, nên record MX/TXT cho forwarding phải tạo **trong Route 53**, không phải trong DNS của registrar.

**Kiểm tra đã đúng chưa:** gửi thư từ một hộp thư khác tới `hello@<domain>` → nhận được ở hộp thư đích.

---

## Báo lại cho Lead

```
Tên miền (L5-010 / Q-09 / Q24):
- Registrar: <tên>; TLD: <.tld>; giá gia hạn: <...>/năm; hết hạn <YYYY-MM-DD>
- Tên miền: <domain>  (được công khai — sẽ nằm trong SITE_URL)
- Hosted zone tạo: <ngày>; NS ở registrar đã đổi; Resolve-DnsName ra 4 NS awsdns: có/không
- CAA: đã tạo, kiểm bằng nslookup: có/không
- ACM us-east-1: Issued cho apex + www: có/không (ngày)
- Bước 7 (CloudFront/alias/redirect): chờ A2
```
