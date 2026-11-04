# Runbook — Guardrail chi phí: Budgets, Cost Anomaly Detection, SNS email (Q25)

> Người làm: **Duy**. AI không đăng nhập AWS, không tạo resource.
> Spec: §11.4 ("Thứ tự bắt buộc trước khi tạo resource đầu tiên"), §13 Q25. Hàng đợi: **Q-07** (ngưỡng Budgets — Duy chốt).
> Làm **trước** mọi resource khác (S3, CloudFront, Route 53…) và **trước** khi nâng Paid plan (`aws-paid-plan.md`).
> Làm bằng user hằng ngày (xem `aws-account-and-credits.md` Bước 6–7), không dùng root nếu không bắt buộc.
> Nhãn nút trong ngoặc kép là theo hiểu biết lúc viết (2026-11-04); chỗ *(chưa chắc nhãn)* thì tìm mục tương đương, không thấy thì chụp màn hình gửi Lead.

## Đề xuất ngưỡng (Duy chốt — Q-07)

| Budget | Kỳ | Số tiền | Cảnh báo |
|---|---|---|---|
| `tqa-monthly-cost` | Hằng tháng | **10 USD** | Actual ≥ 10% (1 USD) · Actual ≥ 50% (**5 USD**) · Actual ≥ 100% (**10 USD**) · Forecasted ≥ 100% (10 USD) |

- Một budget 10 USD với 4 ngưỡng tương đương "cảnh báo 5 và 10 USD" của Q-07, cộng thêm mốc 1 USD (§11.4 gợi ý 1, 5, 10) để thấy sớm.
- Budget tính **chi phí trước credits** (§11.4): credits không được trừ, nên khi credits đang che chi phí bạn vẫn thấy mức tiêu thật.
- Nếu Duy chọn số khác: thay `10` và các phần trăm tương ứng; ghi quyết định vào DUY_QUEUE Q-07 (Lead ghi).

Chi phí của chính các guardrail: Budgets theo dõi (không gắn "budget action") và Cost Anomaly Detection hiện không tính phí; SNS email trong bậc miễn phí (§11.4 "~0 USD"). **Kiểm lại trang giá trước khi tạo** — không coi con số này là sự thật lâu dài.

---

## Bước 1 — Bật quyền xem Billing cho user hằng ngày (nếu chưa)

Xem `aws-account-and-credits.md` Bước 7.

**Kiểm tra đã đúng chưa:** đăng nhập user hằng ngày, mở **Billing and Cost Management** không bị "Access denied".

## Bước 2 — Bật Free Tier usage alerts

1. Billing and Cost Management → menu trái **Billing preferences** *(chưa chắc nhãn; có thể nằm trong "Preferences and Settings")*.
2. Mục **Alert preferences** → **Edit** → tick **Receive AWS Free Tier alerts**, email `<email-nhận-cảnh-báo>` → Update.

**Kiểm tra đã đúng chưa:** mở lại Billing preferences thấy ô Free Tier alerts đã tick, email đúng.

## Bước 3 — Tạo SNS topic + đăng ký email

Region: chọn **US East (N. Virginia) `us-east-1`** ở góc trên phải. Lý do: Billing/Budgets/Cost Anomaly Detection là dịch vụ toàn cầu, đặt chung với us-east-1 giảm rủi ro không tương thích region. *(Chưa chắc AWS có bắt buộc region này hay không; nếu bước 4/5 báo topic không hợp lệ thì đọc thông báo lỗi và gửi Lead.)*

1. Console → `Simple Notification Service` → **Topics → Create topic**.
2. Type: **Standard**. Name: `tqa-cost-alerts`. Các mục khác để mặc định (không bật mã hóa bằng KMS key riêng — §11.4 tránh KMS customer-managed key).
3. **Create topic**.
4. Trong topic → **Create subscription** → Protocol **Email** → Endpoint `<email-nhận-cảnh-báo>` → Create.
5. Mở hộp thư, bấm link **Confirm subscription** trong email của AWS Notifications.
6. Cho phép Budgets và Cost Anomaly Detection gửi vào topic: trong topic → **Edit** → **Access policy** → thêm statement sau vào mảng `"Statement"` (giữ nguyên statement mặc định), thay `<topic-arn>` bằng ARN hiện ở đầu trang topic **ngay trong console** (không chép ARN ra file/chat):

```json
{
  "Sid": "AllowBudgetsAndCostAnomalyPublish",
  "Effect": "Allow",
  "Principal": { "Service": ["budgets.amazonaws.com", "costalerts.amazonaws.com"] },
  "Action": "SNS:Publish",
  "Resource": "<topic-arn>"
}
```

*(Tên service principal của Cost Anomaly Detection là `costalerts.amazonaws.com` theo tài liệu AWS mà người viết biết; nếu console từ chối, xem trang "Using Amazon SNS with Cost Anomaly Detection" trong tài liệu AWS. Lưu ý bảo mật: có thể thêm điều kiện `aws:SourceAccount` = `<account-id>` theo hướng dẫn AWS — chỉ gõ trong console.)*

7. **Thử kênh SNS:** trong topic → **Publish message** → Subject `TQA test`, Body `test cost alert channel` → Publish.

**Kiểm tra đã đúng chưa:**
- Tab **Subscriptions** của topic: subscription email có Status **Confirmed** (không phải "Pending confirmation").
- Hộp thư nhận email "TQA test" trong vài phút (kiểm cả Spam; nếu ở Spam, đánh dấu "Not spam").

## Bước 4 — Tạo budget

1. Billing and Cost Management → **Budgets** → **Create budget**.
2. Chọn **Customize (advanced)** → Budget type **Cost budget** → Next.
3. Budget name: `tqa-monthly-cost`. Period: **Monthly**. Renewal: **Recurring budget**. Start month: tháng hiện tại. Budgeting method: **Fixed**. Amount: `10` (USD, hoặc số Duy chốt).
4. Budget scope: **All AWS services (Recommended)**.
5. **Advanced options** *(chưa chắc nhãn)* → mục loại chi phí (charge types): **bỏ chọn "Credits"** (và để nguyên "Refunds" bỏ chọn nếu có) → để budget tính chi phí trước credits (§11.4). Aggregate costs by: **Unblended costs**.
6. Next → **Add an alert threshold**, tạo 4 ngưỡng:
   | Threshold | Trigger |
   |---|---|
   | 10 % of budgeted amount | Actual |
   | 50 % | Actual |
   | 100 % | Actual |
   | 100 % | Forecasted |
   Mỗi ngưỡng: Email recipients `<email-nhận-cảnh-báo>` **và** Amazon SNS Alerts → chọn/nhập ARN topic `tqa-cost-alerts` (chọn trong console).
7. Next → **không** gắn Budget action (Actions có thể tính phí và tự động đổi quyền — chưa cần) → Next → Review → **Create budget**.

**Kiểm tra đã đúng chưa:**
- Danh sách Budgets có `tqa-monthly-cost`, Amount 10 USD, Period Monthly.
- Mở budget → tab Alerts: đủ 4 ngưỡng (3 Actual, 1 Forecasted), mỗi ngưỡng có email + SNS.
- Mục cấu hình/chi tiết budget cho thấy **Credits không được tính** *(chưa chắc nhãn: "Charge types" / "Cost aggregation")*. Nếu console không cho bỏ Credits trong chế độ Customize → ghi lại và báo Lead (không tự đổi sang cách khác).
- Nếu SNS bị từ chối khi lưu: quay lại Bước 3.6 (access policy).

## Bước 5 — Cost Anomaly Detection

Cost Anomaly Detection cần **Cost Explorer** đã bật. Lần đầu bật Cost Explorer có thể mất tới ~24 giờ mới có dữ liệu.

1. Billing and Cost Management → **Cost Explorer** → nếu thấy nút **Launch Cost Explorer** / "Enable" *(chưa chắc nhãn)* thì bấm. Chờ đến khi Cost Explorer mở được.
2. Billing and Cost Management → **Cost Anomaly Detection** → tab **Cost monitors** → **Create monitor**.
3. Monitor type: **AWS services** (theo dõi từng dịch vụ). Name: `tqa-services`.
4. Alert subscription → **Create a new subscription**:
   - Name `tqa-anomaly`.
   - Alerting frequency: **Individual alerts** (gửi ngay mỗi bất thường — loại này **chỉ gửi qua SNS**) → chọn topic `tqa-cost-alerts`.
   - Threshold: **Absolute** ≥ `1` USD (đề xuất; khớp mốc 1 USD của budget). *(Nhãn ngưỡng có thể là "Impact threshold"; nếu console chỉ cho phần trăm, chọn mức thấp nhất hợp lý và ghi lại.)*
   - Nếu muốn thêm bản tóm tắt qua email: tạo thêm subscription **Daily summaries** với Email `<email-nhận-cảnh-báo>`.
5. **Create monitor**.

**Kiểm tra đã đúng chưa:**
- Tab Cost monitors có `tqa-services` (Status Active / không báo lỗi).
- Tab Alert subscriptions có `tqa-anomaly`, kênh SNS `tqa-cost-alerts`, ngưỡng 1 USD.
- (AWS có thể đã tự tạo sẵn một monitor mặc định cho tài khoản mới — giữ cũng được, không tốn phí; ghi lại tên.)

## Bước 6 — Thử nhận cảnh báo (Q25)

Q25 yêu cầu "đã tạo và **nhận thử** cảnh báo trước resource khác". AWS Budgets không có nút "gửi thử" *(theo hiểu biết lúc viết)*, và khi chi phí thật đang 0 USD thì ngưỡng Actual chưa thể kích hoạt. Vì vậy chia 2 mức bằng chứng — ghi đúng mức đã đạt, không ghi PASS cho phần chưa xảy ra:

| Phép thử | Cách | Trạng thái ghi |
|---|---|---|
| Q25-a: kênh SNS → email | Bước 3.7 (Publish message) | PASS khi email tới hộp thư |
| Q25-b: Budget gửi được vào SNS | Lưu budget ở Bước 4 không báo lỗi quyền SNS; trang budget không có cảnh báo "SNS topic not accessible" *(chưa chắc nhãn)* | PASS cấu hình (chưa phải nhận thật) |
| Q25-c: Budget kích hoạt thật | Khi chi phí trước credits đầu tiên vượt 1 USD (thường sau khi có resource A2), email ngưỡng 10% tới | NOT RUN cho tới khi xảy ra — ghi ngày nhận |
| Q25-d: Anomaly alert | Chỉ phát khi AWS phát hiện bất thường | NOT RUN (không ép được) |

*(Tùy chọn để có bằng chứng Q25-c sớm: tạm tạo budget thứ hai `tqa-alert-test` kiểu Monthly, Amount `0.01` USD, ngưỡng Actual 100%, gửi email + SNS. Nếu tháng này đã có bất kỳ chi phí trước credits nào > 0,01 USD, cảnh báo sẽ tới trong vòng tối đa khoảng một ngày — Budgets cập nhật vài lần mỗi ngày. Nếu chi phí đang đúng 0 thì sẽ không có email; khi đó giữ NOT RUN. Nhận xong thì xóa budget test này. Chưa chắc AWS chấp nhận amount 0.01 — nếu không, bỏ qua.)*

**Kiểm tra đã đúng chưa:** có email "TQA test" (Q25-a); chụp màn hình (che ID/email) budget + alerts + monitor để làm bằng chứng — **không** commit ảnh có ID/ARN/email vào repo.

## Bước 7 — Báo lại cho Lead

```
Guardrail chi phí (L5-010 / Q25):
- Ngưỡng chốt (Q-07): budget <số> USD/tháng, alerts <danh sách>
- Free Tier alerts: bật / chưa
- SNS topic tqa-cost-alerts (us-east-1): subscription Confirmed / chưa
- Q25-a SNS test email: PASS <ngày> / FAIL / NOT RUN
- Budget tqa-monthly-cost: tạo <ngày>; Credits loại khỏi budget: có / không làm được (lý do)
- Q25-b budget→SNS cấu hình: PASS / FAIL
- Cost Explorer bật: <ngày>; Anomaly monitor + subscription: có / chưa
- Q25-c / Q25-d: NOT RUN (chờ chi phí thật / bất thường)
```

Sau khi xong mục này mới chuyển sang `aws-paid-plan.md`.
