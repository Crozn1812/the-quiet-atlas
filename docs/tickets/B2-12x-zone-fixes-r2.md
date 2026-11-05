## Sửa dựng cảnh vòng 2 theo Art Director (đợt 22). Mỗi mục là 1 ticket; đọc kèm `_zone-common.md`

Quy tắc chung vòng 2:

- **Nét mực:** khoảng 10 % mỗi cảnh dùng tông mực đậm (`ink` #2B2A26, hoặc `ink` lerp `forestDeep` 0,3), ví dụ chân thân cây, mặt dưới mái, khe hộp thư. Mục đích: silhouette đọc được qua sương.
- **Điểm nhấn:** mỗi khu có 1–3 chấm `flower` #D9822B, mỗi chấm khoảng 0,1–0,15 m: hoa dại, nơ dây, đèn.
- Mọi test cũ của khu vẫn pass: ngân sách, hành lang, nước, palette, dispose. Interactable phải nhìn thấy được, không bị vật khác che từ phía đường.
- Xem kết quả bằng: `pnpm exec vite tools/styleframes` rồi mở `/zones.html?zone=<id>&view=front|side`. Không bắt buộc chụp ảnh; Lead sẽ chụp.

### B2-121 `first-light`

- Vệt nắng: opacity khoảng 0,25, màu `dusk`×0,4 + `paper`.
- Thêm 2–3 bông hoa cam nhỏ quanh khúc gỗ.
- Chân cột đặt sổ màu mực.

### B2-122 `roots`

- 7 rễ dài 2–6 m, **cong chữ S, bất đối xứng**, nửa chìm xuống y ≈ 0,1. Thêm 2–3 rễ nối ngang giữa các rễ.
- **Mọi đầu rễ cách hành lang ≥ 1 m** (hiện có một rễ chạm hành lang).
- Mặt dưới gốc và các khe rễ màu mực.

### B2-123 `workshop`

- Mái dốc 15–20°, có mảng rêu `forestDeep`.
- Mái khác màu với hiên của Quiet Shore. Dùng `ink` lerp `paper` 0,55 (gỗ xám) hoặc `forestDeep`, không dùng teal.
- Ngoài chái thêm 2 thùng gỗ và 1 cuộn dây.
- Trên bàn thợ thêm vài dụng cụ: hộp nhỏ, cuộn, giấy.

### B2-124 `milestones`: bỏ hẳn cảm giác nghĩa trang

- Thay bia tròn bằng **đá đứng tự nhiên, thô, không đều**: 6 khối cao 0,9–1,6 m, mặt vát lệch, nghiêng 3–8°, xếp lỏng chứ không vòng cung đều.
- **Đá giữa cao khoảng 2 m**, rộng hơn hẳn: đây là interactable.
- Đặt trên **gò thấp 0,8 m** dạng mesh gò mềm. Gò không được cao quá đường đi: phải nằm ngoài hành lang và dốc nhẹ.
- 2 "slot tương lai": đá thấp, mặt phẳng nhạt, đặt hơi tách ra.
- Dời cây thông ra **sau** cụm đá (xa đường), để không che đá khi nhìn từ đường.

### B2-125 `old-trail`: bỏ thanh ngang hình thánh giá

- Cột mốc: **cột trơn**, có đai dây thừng hoặc nắp gỗ, **không có thanh ngang**.
- Cổng gãy to gấp 1,5 lần.
- Thêm **1 cây thông nghiêng** (thân mực, tán ngọc) ở mép.
- Đèn bão có chấm `flower`.

### B2-126 `horizon`

- 2–3 tuabin **cao 12–15 m**, đặt **khoảng 25 m về phía biển** (local +X hoặc −X tùy hướng biển; đọc từ `heightAt` để chọn phía thấp dần). Phải **nằm trong tầm nhìn từ đường đi**: góc nhìn từ (0, 1,6, −8) về phía tuabin không bị vật khác che.
- **Bỏ đĩa xanh 10 cạnh.** Thay bằng gò cỏ mép mềm cao 1–1,5 m, hoặc không có gò (địa hình B2-109 đã có mỏm).
- Thêm chấm cam ở ống nhòm.

### B2-127 `quiet-shore`

- Hoa trên hàng rào: 10–12 chấm `flower` khoảng 0,12 m, **nhìn thấy được**.
- Máy hát to gấp 1,5 lần.
- Mặt dưới mái hiên màu mực.

### B2-128 `last-postcard`

- Cột đèn **cao 3,2 m**, chụp đèn 0,35 m màu `dusk`.
- Hộp thư to gấp 1,3 lần, khe màu mực.
- **Gom 3 vật lên một bệ gỗ chung 3 × 2 m**.
- Thêm 1–2 chấm cam trên bưu thiếp.

### B2-129 Thông Đà Lạt cao hơn (`foliage/shapes.ts`)

- Biến thể thông: tổng chiều cao **14–18 m**, **thân trần khoảng 2/3**, tán cao hẹp. Hiện tại khoảng 7–8 m, dáng thông Noel.
- **Collider thân giữ nguyên** (`colliders.ts`).
- Cập nhật kỳ vọng bounding box trong `foliage-shapes.test.ts`, có ghi lý do.
- Mỗi biến thể vẫn ≤ 300 tam giác.
- Kiểm `crown-fade` / `camera.ts`: cây cao hơn nên việc làm mờ tán khi che camera vẫn phải đúng. Nếu cần sửa ngưỡng thì ghi rõ.
- Chỉ sửa `src/features/world/foliage/shapes.ts`, `instances.ts` và test của chúng.
