## TICKET L1-001 — Schema nội dung + Welcome/Quick khung

- Trạng thái: **Draft** — chờ P01-A nền (Next.js + lockfile) và Codex
- Lane / milestone: L1 / A0 → A1
- Mục tiêu (theo trải nghiệm người dùng): mở `/en/` hoặc `/vi/` thấy tên, vai trò, một câu giới thiệu, link CV và ba nút Enter World / Quick Portfolio / Sound; mở `/en/quick/` thấy khung Quick Portfolio. Mọi dữ liệu chưa xác minh hiển thị `TBD` và chỉ ở chế độ nháp.
- Spec liên quan: §3.1, §4.1, §4.2, §4.4, §5
- Được sửa: `src/content/`, `src/app/[locale]/page.tsx`, `src/app/[locale]/quick/`, `src/components/portfolio/`, `tests/unit/content/` (chỉ test của schema)
- Không được sửa: mọi thứ khác; đặc biệt lockfile, `package.json`, `docs/`, `infra/`, `src/features/`
- Ràng buộc:
  - Schema Zod cho project (đủ trường §4.1), evidence (§4.2), profile; validator chạy lúc build, fail khi: slug trùng, thiếu trường, thiếu khóa EN/VI, evidence ID không tồn tại, status sai, URL ngoài allowlist.
  - Dữ liệu nháp tách khỏi public; nháp không vào client bundle.
  - Không import `src/features/world`. Nút Enter World chỉ là placeholder chưa nạp gì.
  - Không bịa tên dự án/số liệu/URL ngoài các tên đã có trong §2.2; nội dung còn lại `TBD`.
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test` (có test fail cho từng luật validator), `pnpm build` pass; trang chạy khi tắt JS.
- Bàn giao: tóm tắt thay đổi, lệnh đã chạy + kết quả, việc chưa làm.
