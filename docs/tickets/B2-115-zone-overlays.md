## TICKET B2-115 — Overlay tạp chí cho cả 8 khu (dữ liệu thật; chỗ chưa có dữ liệu trình bày trung thực)

- Trạng thái: Assigned → Codex, đợt 21, nhánh `lane/B2-115`
- Đọc trước:
  - `_common-b2.md`
  - `src/components/portfolio/ZoneContent.tsx`: hiện chỉ First Light và Workshop có nội dung; 6 khu còn lại hiện "Đang xây dựng".
  - `WorldContent.tsx`, `worldContentData.ts`
  - `src/content/index.ts` + `schema.ts`: profile, introduction, experience, education, projects, email, githubUrl, linkedinUrl; `cvUrl` = TBD; trang `/cv/` có sẵn.
  - `src/components/portfolio/memory/` (B2-032): khung ảnh film, trang tạp chí.
  - `Portfolio.tsx` / `QuickPortfolio.tsx`: cách trang Quick trình bày cùng dữ liệu.
  - Spec §2, §2.1, §4.3 (quy tắc diễn đạt), §4.4 (liên hệ theo lớp: số điện thoại chỉ trong CV), §6.3.
  - Taste §5.5: tiêu đề lớn, nhiều khoảng trắng, chữ ít, một mảng minh họa.
  - **Luật cứng: không bịa nội dung.** Chỗ thiếu không được ghi "TBD" lên web.

### Việc

`ZoneContent.tsx` thành 8 trang tạp chí, mỗi trang có:
- kicker (tên khu);
- tiêu đề lớn (chủ đề);
- nội dung;
- một mảng minh họa màu nước bằng CSS/SVG trừu tượng (không ảnh, không người), màu PALETTE.

| Khu | Nội dung |
|---|---|
| **First Light** (About) | Giữ dữ liệu hiện có, trình bày lại kiểu tạp chí. Có link "Xem Quick Portfolio" và "Tải CV" (trang `/cv/`). |
| **Workshop** (Projects) | Danh sách dự án như hiện tại. Thêm mục cuối "The Making of The Quiet Atlas" chỉ khi dữ liệu có case study đó (kiểm `projects`); nếu không có thì không hiện. |
| **Old Trail** (Journey) | Dòng thời gian từ `experience` + `education` (đúng thứ tự, đúng chữ của content). |
| **Last Postcard** (Contact) | Email (mailto), GitHub, LinkedIn, trang CV `/cv/`. **Không hiện số điện thoại** (chỉ trong CV, §4.4). Bố cục như mặt sau tấm bưu thiếp. |
| **Roots / Milestones / Horizon / Quiet Shore** | Thêm **trường tùy chọn** vào `WorldContentData`: `skills?`, `certificates?`, `direction?`, `hobbies?` (kiểu đơn giản: danh sách mục có tiêu đề + mô tả ngắn). Có dữ liệu thì hiện. **Không có** thì hiện trang tạp chí trung thực: tiêu đề khu, một câu "Duy đang viết phần này." / "Duy is still writing this page.", kèm link sang trang dự án/Quick có thông tin liên quan. Không đoán nội dung. |

- Mỗi trang dùng `<article>` có heading đúng cấp: một `h1` trong overlay, `h2` cho mục.
- Link mở cùng tab.
- Font serif tự host. Chữ đủ dấu.

### Được sửa

- `src/components/portfolio/ZoneContent.tsx`
- `src/components/portfolio/worldContentData.ts`
- `src/components/portfolio/WorldContent.tsx` (chỉ phần truyền dữ liệu)
- CSS module mới cho overlay
- `tests/unit/portfolio/zone-content*.test.tsx`

**Không sửa `src/content/**`** (Lead nhập dữ liệu khi Duy gửi).

### Test

- 8 khu đều render có `h1`, không khu nào còn chữ "Under construction" hay "Đang xây dựng".
- Không chuỗi "TBD" xuất hiện.
- Last Postcard không chứa số điện thoại.
- Old Trail đúng số mục experience + education.
- 4 khu chưa có dữ liệu hiện câu trung thực; khi truyền dữ liệu giả thì hiện danh sách.
- EN/VI.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0. Không commit.
