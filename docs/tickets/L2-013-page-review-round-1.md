## TICKET L2-013 — Sửa nội dung theo lượt duyệt trang thứ nhất của Duy (Q-04)

- Trạng thái: **Assigned → subagent L2 (sonnet)** (2026-11-04, đợt 13), nhánh `lane/L2-013`, worktree `D:/tqa-worktrees/L2-013`
- Lane / milestone: L2 Content & CV / A1
- Spec: §1.1, §4.1, §4.3; ADR 0010
- Nguồn: Duy duyệt ngày 2026-11-04 (dưới đây); repo `https://github.com/Crozn1812/AWS-Sales-Data-Pipeline` (bản clone: `C:/Users/PC-LP/AppData/Local/Temp/claude/0fa2f3b7e932577a/8df7ab9d-792e-48b0-9ba4-5db2ee26ab9c/scratchpad/repo-aws/` — đọc `infrastructure/app_stack.py`, `src/`, `docs/`, KHÔNG dùng `cdk.out/` vì là bản build cũ); slide CMS `.../scratchpad/duy-docs/cms-slides.txt`; nháp `D:/the-quiet-atlas/content-private/drafts/`.

### Quyết định của Duy
1. **Chức danh chốt: "CloudDevOps Engineer"** (đúng chính tả này). Áp cho `profile.role` (EN + VI) và câu giới thiệu (thay "Cloud DevOps Engineer" / "Cloud & DevOps Engineer"). Chức danh công việc ở HPT (`experience[].title` "Cloud & DevOps Intern") **giữ nguyên** — đó là chức danh thực tập, Lead hỏi Duy riêng nếu cần.
2. **AWS Sales Data Pipeline: theo repo GitHub.** Code hiện tại dùng `S3EventSource` (sự kiện S3 `OBJECT_CREATED` gọi Lambda trực tiếp), **không** dùng EventBridge → bỏ mọi chữ EventBridge vừa thêm (contributions, architecture, decisions — EN + VI); mô tả đúng theo `app_stack.py` và README. Giữ câu "dữ liệu mẫu giả lập". Có thể bổ sung `alternatives`/`decisions` từ `docs/adrs.md` của repo nếu có nội dung thật (ghi nguồn trong nháp).
3. **InsightHub: bỏ chi tiết nghiệm thu 69/70 / 1 FAIL** khỏi mọi trường public (validation, results, lessons…). Không thay bằng số khác.
4. **CMS: viết theo slide.** Điền các trường còn `TBD` (context, problem, constraints, decisions, alternatives, implementation, validation, results, lessons) từ `cms-slides.txt` nếu slide có nội dung; slide không nói thì giữ `TBD`. Bỏ câu "Mức bằng chứng thấp: chỉ có slide thiết kế" khỏi `summary` (mức bằng chứng đã hiện ở dòng evidence). Không thêm số liệu không có trong slide. Không nhắc mã khóa học.
5. **PDG: chỉ nói có 2 luồng dữ liệu chính — cloud và on-premises.** Bỏ mọi chi tiết về nguồn dữ liệu (SharePoint, list, site, hệ thống nguồn…) khỏi các trường public EN + VI; mô tả: dữ liệu từ hai luồng cloud và on-prem được chia sẻ có kiểm soát cho đối tác qua Azure API Management / Azure Functions (giữ phần subscription key theo đối tác, lọc bản ghi/trường, hai giai đoạn đã hoàn thành).

- Được sửa: `src/content/`, `tests/unit/content/`, `tests/unit/tools-cv/`, `tools/cv/` (nếu cần), `content-private/drafts/`
- Không được sửa: `src/app/`, `src/components/`, `src/features/`, `tests/e2e/`, `package.json`, lockfile, config, `docs/`
- Test: cập nhật test L2-012/Q-16 trong `tests/unit/content/validation.test.ts` cho đúng quyết định mới (vd. role = "CloudDevOps Engineer"; AWS không chứa EventBridge; InsightHub không chứa "69/70"; PDG không chứa "SharePoint"; CMS summary không chứa "Mức bằng chứng thấp"/"Evidence level is low").
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build:artifacts`, `pnpm check:cv`, `pnpm check:leaks` exit 0 — dán dòng tổng kết. Không chạy e2e. Không commit.
- Bàn giao: thay đổi theo từng ý 1–5 (trường nào, nguồn nào); TBD còn lại của CMS.
