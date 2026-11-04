## TICKET L2-011 — Kinh nghiệm + học vấn theo ADR 0010 (schema, dữ liệu, CV)

- Trạng thái: **Assigned → subagent L2** (2026-11-04, đợt 11), nhánh `lane/L2-011`, worktree `D:/tqa-worktrees/L2-011`
- Lane / milestone: L2 Content & CV / A1
- Spec: §1.1, §4.1, §4.4; `docs/adr/0010-profile-experience-education.md` (đã duyệt — làm đúng kiểu)
- Việc:
  1. `src/content/schema.ts`: thêm `experience[]`, `education[]` đúng ADR 0010; validator + unit test (giá trị hợp lệ/không hợp lệ: tháng sai định dạng, end lạ).
  2. `src/content/index.ts`: EN + VI:
     - experience: HPT · Cloud & DevOps Intern · start `2026-07` · end `present` · summary `TBD` (chờ Duy duyệt mô tả) · evidence `[]`.
     - education: theo CV — PTIT, "Network and Systems Engineer" (VI: "Kỹ sư Mạng và Hệ thống" — ghi chú cần Duy xác nhận cách dịch), expectedGraduation `2027`, status `in-progress`.
  3. `src/content/drafts.ts`: bỏ phần đã chuyển sang dữ liệu chính, giữ ghi chú "không ghi 6 tháng trước 12/2026".
  4. `tools/cv/render.mjs`: thêm mục Experience/Kinh nghiệm và Education/Học vấn (khoảng thời gian `07/2026 – nay` / `07/2026 – present`), test render.
- Được sửa: `src/content/`, `tools/cv/`, `tools/og/`, `tests/unit/content/`, `tests/unit/tools-cv/`
- Không được sửa: `src/app/`, `src/components/`, `src/features/`, `tests/e2e/`, `package.json`, lockfile, config, `docs/`
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build:artifacts`, `pnpm check:cv`, `pnpm check:leaks` exit 0 — dán dòng tổng kết. Không chạy e2e. Không commit.
