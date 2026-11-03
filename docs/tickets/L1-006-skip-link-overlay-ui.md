## TICKET L1-006 — Skip link mọi trang + khung overlay nội dung trong world (ADR 0008 mở rộng)

- Trạng thái: **Done — merged vào main** (2026-11-04)
- Lane / milestone: L1 / A1 + P01-E (phần UI)
- Mục tiêu (theo trải nghiệm người dùng):
  - Mọi trang HTML: phím Tab đầu tiên hiện link "Skip to content" / "Bỏ qua đến nội dung" dẫn tới `<main id="content">` (T11, WCAG 2.4.1).
  - Trong world, khi world yêu cầu mở nội dung một khu (sự kiện `tqa:open-content`), một overlay kiểu tạp chí hiện ra (~85–90 % màn hình desktop), dùng **cùng renderer** với trang case study/khu nội dung; Esc/X đóng, focus trả lại, world chạy tiếp tại đúng vị trí.
- Spec liên quan: §2.1 (8 địa điểm), §6.2 mục 1, §6.3 (overlay tái dùng renderer, nút "Copy project link", "Đọc bản đầy đủ" mở tab mới), §9, ADR 0008 (đọc cả phần "Mở rộng 2026-11-04")
- Được sửa: `src/app/`, `src/components/portfolio/`, `src/i18n/`, `tests/unit/portfolio/`, `tests/unit/i18n/`
- Không được sửa: mọi thứ khác; đặc biệt `src/features/`, `src/state/`, `src/content/index.ts`, `evidence.json`, `tests/e2e/` (Lead bỏ `test.fail()` skip link sau), `package.json`, lockfile, config gốc, `docs/`, `tools/`. Không `pnpm add/install`.
- Ràng buộc:
  - Skip link: phần tử đầu tiên trong `<body>`, ẩn trực quan tới khi focus, hiện rõ khi focus; mọi `<main>` có `id="content"` và `tabIndex={-1}`.
  - Overlay nạp lazy giống menu (file riêng, `import()` sau khi world mount); JS ban đầu không tăng quá 0,5 KB.
  - Nội dung overlay lấy từ `src/content` public theo `zoneId`. Hiện có 8 khu (§2.1) nhưng chỉ khu **The Workshop** (`workshop` → danh sách 4 dự án, mỗi dự án link sang case study) và **The First Light** (`first-light` → profile: tên, vai trò, giới thiệu) có dữ liệu; khu khác hiển thị "Đang xây dựng" + link Quick Portfolio. Không bịa nội dung.
  - Mở overlay → dispatch `tqa:pause` `{reason:"overlay", paused:true}`; đóng → `paused:false` rồi dispatch `tqa:content-closed` `{ zoneId }`. Focus vào tiêu đề overlay khi mở; trả về canvas/vùng world khi đóng. Esc: overlay mở thì đóng overlay (menu không mở chồng).
  - Nút "Copy project link" chép URL tuyệt đối của case study (dùng `location.origin`); "Read full version" mở case study ở tab mới (`target="_blank" rel="noopener"`).
  - Không `history.pushState` ở ticket này (để sau, cần e2e riêng).
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle`, `pnpm check:leaks` exit 0; unit test: skip link có mặt và đứng đầu ở mọi layout; overlay chọn đúng nội dung theo `zoneId`, khu chưa có dữ liệu ra "đang xây dựng"; dispatch đúng event. Không commit; Lead commit.
- Bàn giao: tóm tắt, JS ban đầu trước/sau, lệnh + exit code, việc chưa làm.
