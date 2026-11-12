# Ticket vòng 2 (từ `R2-playtest-feedback.md`)

Chung cho mọi ticket:
- Áp `_common-b2.md`, `_review-common.md`, `_graphics-common.md`. Hướng R1 (khối mặt phẳng) giữ nguyên.
- Mỗi ticket chạy một worktree và cổng review riêng.
- Tự build, tự chụp **High** những chỗ mình sửa và đủ 8 khu (kèm `luma.mjs`); chạm logic mỗi khung thì đo thêm `cpu-compare`; chạy unit và e2e world (`--workers=2`).
- Nối vào `src/features/world/index.ts` thì giữ ngắn, gọi qua hàm trong module của ticket.

## FL-03: rừng bình minh rậm, tán kín trời, nắng lấp ló (cổng 4511)
- **First Light:** thay tảng đá nguồn suối bằng **sườn núi đá** cao (20–40 m) chạy ngang phía sau, che kín đường chân trời. Suối chảy ra từ chân núi (giữ thác nhỏ và vũng).
- **Toàn biome rừng** (First Light, Roots, Workshop, Milestones và hành lang giữa các khu):
  - cây **cao hơn**, tán **dày, nhiều cành**, chồng lên nhau để từ camera chơi **gần như không thấy trời**;
  - không khí **tối, mờ sương** đúng bình minh (luma rừng khoảng 0,20–0,26).
- **Tia nắng:** các vệt sáng thể tích mảnh **lọt qua khe lá, chiếu xiên từ trái sang phải**, lấp lánh nhẹ (lá rung). Không dùng một dải trắng to như bản dở.
- **Suối First Light:** nhân vật **lội xuống được** (lòng suối nông, có collider đáy), có **vài con cá** bơi (instanced, rẻ).
- **Ngân sách:** vào chơi ≤ 6 s; CPU ≤ main + 10 ms/s; tam giác High tăng ≤ 25 %.

## VH-02: lái xe đúng hướng, ghi-đông xoay, lên/xuống xe (cổng 4512)
- A rẽ trái, D rẽ phải (hiện đang ngược).
- Khi rẽ, ghi-đông và hai tay nhân vật xoay theo góc lái; thân xe nghiêng nhẹ.
- **Lên xe** (E): nhân vật bước tới, nhấc chân qua yên, gạt chân chống lên.
- **Xuống xe:** dừng hẳn, dựng chân chống, bước xuống, đứng thẳng (sửa lỗi người bị chúi về phía trước).
- reduced-motion: rút gọn chuyển động.
- Được sửa: `src/features/world/vehicle/*`, `src/features/vehicle/*`, `src/features/world/character/ride.ts`, test.

## MS-01: bỏ mascot (cổng 4513)
- Gỡ hẳn mascot (giọt nước), gồm gợi ý, cài đặt "Mascot" trong Menu, test liên quan.
- Thông tin mascot từng nói ra không được mất: chuyển sang hint HUD sẵn có (nếu cần).
- Không để lại code chết.

## UI-05: overlay dự án, kỹ năng, chứng chỉ, CV (cổng 4514)
- **Overlay dự án:**
  - sơ đồ kiến trúc to rõ (rộng ≥ 70 % cột nội dung, bấm để phóng to);
  - tên dự án có dạng liên kết rõ ràng, thêm nút "Read the full case study →".
- **Skills:** mỗi kỹ năng **một dòng** (danh sách, nhóm theo Cloud Platform AWS/Azure, Languages, Network and Systems, **Tools**). Nội dung lấy từ dự án thật trong `src/content`; không bịa.
- **Certificates:** thêm **CCNA, nhận tháng 3/2026** (Duy xác nhận).
- **CV PDF:** render lại VI và EN theo nội dung mới (`pnpm build:cv`), kiểm `tools/cv/check-output.mjs`.
- Được sửa: `src/components/portfolio/*`, `src/content/*`, `tools/cv/*`, test.

## SC-01: bí mật to hơn, mơ hồ, bí ẩn (cổng 4515)
- 4 landmark bí mật (gương/vòm, chuông gió, lối mòn không tên, băng ghế trang viết dở) phóng to 2–3 lần, đọc được từ 15 m.
- Mang vẻ mơ hồ, huyền bí: ánh sáng mờ, đốm sáng li ti, hơi sương quanh vật.
- Vẫn trong ngôn ngữ R1. Không chặn đường đi.
- Được sửa: `src/features/world/props/secrets.ts`, `src/features/story/*` (nếu cần bán kính), test.

## RT-02: cây cổ thụ elf ở Roots + bảng sơ đồ kỹ năng (cổng 4516)
- Thay cây phóng to hiện tại bằng **cây cổ thụ khổng lồ**:
  - thân to, rễ nổi ngoằn ngoèo;
  - nhiều nhánh lớn xoắn và chằng chịt;
  - **nhiều tầng tán**, như cây trong truyền thuyết elf;
  - cao 30–45 m, che bóng cả khu.
  Dùng script Blender (`tools/assets/blender/`) hoặc procedural; ≤ 6 000 tam giác.
- Chuyển bảng **sơ đồ tư duy kỹ năng** (hiện ở Workshop) sang Roots, đặt cạnh cây.
- Được sửa: `src/features/world/zones/roots.ts`, `zones/workshop.ts` (chỉ gỡ bảng), `props/lettering.ts`, `tools/assets/blender/`, `public/world/`, LICENSES, test.

## MS-02: tượng đá Duy đang ghép ở Milestones (cổng 4517)
- Thay các cục đá chứng chỉ bằng **tượng đá điêu khắc chân dung Duy chưa hoàn thiện**:
  - các mảnh đá vỡ lơ lửng hoặc dang dở, đang ghép dần vào tượng;
  - mỗi chứng chỉ là một mảnh đã vào chỗ (có khắc tên chứng chỉ, chữ tiếng Anh);
  - chỗ còn thiếu là khoảng trống.
- Số mảnh lấy theo dữ liệu chứng chỉ trong `src/content` (gồm CCNA).
- Không dùng ảnh hay pixel của Duy. Dáng tượng theo nhân vật hiện có.
- Được sửa: `src/features/world/zones/milestones.ts`, `tools/assets/blender/`, `public/world/`, LICENSES, test.

## WS-02: cổng đình làng có lửa ở Workshop (cổng 4518)
- Thay lều gỗ bằng **cổng tam quan / cổng đình làng** lớn (cao 8–12 m): mái cong ngói, cột gỗ, xà.
- Có **lửa đang cháy** (đuốc hoặc lư lửa hai bên): lửa sprite hoặc particle rẻ, có ánh sáng ấm hắt lên cột. Ý nghĩa: sức trẻ đang hoàn thiện bản thân.
- Không chữ Hán, không biểu tượng tôn giáo cụ thể, không logo.
- Được sửa: `src/features/world/zones/workshop.ts`, `tools/assets/blender/`, `public/world/`, LICENSES, test.

## HZ-02: ngồi ghế ngắm cảnh ở Horizon (cổng 4519)
- Bấm E ở băng ghế Horizon ("E — Sit and watch"): nhân vật ngồi xuống (pose ngồi bằng rig, như tư thế lái xe), camera chuyển sang khung ngắm đồi/biển, HUD ẩn.
- Thoát: E, Esc, hoặc phím di chuyển.
- Dùng lại khung tương tác của lan can (`src/features/interaction/lean.ts`) nếu hợp.
- Có e2e.
- Được sửa: `src/features/world/zones/horizon.ts`, `src/features/interaction/*`, `src/features/world/character/*`, `src/i18n/*`, `index.ts` (nối), test.

## RD-02: đầu đường và cuối đường (cổng 4520)
- **Đầu đường nhựa:** bỏ chóp nhọn; chuyển từ đường đất sang đường nhựa tự nhiên (mép vỡ, sỏi, vệt đất tràn lên mặt nhựa trong 10–20 m).
- **Cuối đường:** chân nhân vật không lọt xuống mặt đường (collider và mặt đường khớp nhau).
- **Lan can:** liền một hàng, cao đều.
- **Tựa lan can:** E "Look out to sea" phải hoạt động (e2e `world-railing.spec.ts`).
- Được sửa: `src/features/world/road/*`, `terrain/height.ts` (phần đường), `src/features/interaction/lean.ts`, test.
