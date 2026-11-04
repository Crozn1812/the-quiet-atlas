## TICKET L2-010 — Nháp nội dung từ tài liệu Duy gửi (case study, giới thiệu, liên hệ)

- Trạng thái: **Assigned → subagent L2** (2026-11-04, đợt 10), nhánh `lane/L2-010`, worktree `D:/tqa-worktrees/L2-010`
- Lane / milestone: L2 Content & CV / A1 (nháp) → A3 (công bố sau khi Duy duyệt)
- Ghi chú đánh số: từ đợt 10, lane L2 = Content & CV.
- Spec: §1.1 (không bịa), §2.2 (4 dự án), §4.1 (tách nháp khỏi public; repo public không chứa dữ liệu mật kể cả nháp), §4.3–4.5, §17 (PDG cần phạm vi công bố)

### Nguồn (chỉ đọc; nằm NGOÀI repo, không sao chép file vào repo)
- `<scratch>/duy-docs/pdg-doc.txt`, `pdg-slides.txt`, `cms-slides.txt`, `rag-slides.txt` (text trích từ docx/pptx Duy gửi)
- CV: `C:\Users\PC-LP\Downloads\CloudDevOps-NguyenHuuBaoDuy.pdf`
- README 3 repo public: `github.com/Crozn1812/{AWS-Sales-Data-Pipeline, insighthub_devops, azure-api-gateway-dsr-ai}` (đọc qua trang GitHub công khai; không clone vào repo)
- Dữ liệu hiện có: `src/content/index.ts`, `evidence.json`, `drafts.ts`, `schema.ts`

### Việc
1. **Nháp case study 4 dự án** (EN + VI) theo đúng các trường của schema hiện có (summary, status, context, problem, constraints, myRole, contributions, teamContext, architecture, decisions, alternatives, implementation, validation, results, lessons). Ghi vào `D:/the-quiet-atlas/content-private/drafts/<slug>.md` (thư mục **đã gitignore** ở checkout chính, để không mất khi xóa worktree — vì chưa duyệt). Mỗi câu khẳng định phải gắn nguồn `[src: tên file/slide/README]`; không có nguồn → `TBD`. Có mục "Cần Duy xác nhận" cuối mỗi file.
2. **Partner Data Gateway**: không nêu tên nội bộ (tên site/list SharePoint, tên phòng ban, mã khu vực, ID, URL nội bộ); được nêu tên công ty HPT (Duy đồng ý). Ghi rõ "PoC, chưa production-ready" như tài liệu. Bản demo public là repo `azure-api-gateway-dsr-ai` (mức Lab).
3. **CMS DevOps Platform**: không có repo → mức bằng chứng thấp (`Internal`/`TBD`), ghi câu hỏi Q-02 (DO2603 là gì, nhóm hay cá nhân, thời gian).
4. **Câu giới thiệu**: 3 phương án EN + VI (≤ 25 từ), dựa trên CV + định hướng Cloud/DevOps; ghi vào `content-private/drafts/intro.md`.
5. **Hồ sơ trong `src/content/`** (được commit vì Duy đã cho phép công khai các mục này):
   - Điện thoại theo CV (Duy chọn hiện cả web).
   - Kinh nghiệm: Intern tại HPT từ 07/2026 (đang làm; không ghi "6 tháng"); cập nhật `drafts.ts` `publicEmployerName: "HPT"` và đưa vào dữ liệu hồ sơ nếu schema đã có trường phù hợp.
   - Học vấn PTIT (dự kiến 2027) **chỉ nếu schema đã có trường**; nếu chưa có → KHÔNG sửa schema, viết đề xuất hợp đồng trong bàn giao (Lead duyệt trước).
   - Giữ `reviewStatus: "draft"`; LinkedIn vẫn `TBD` (Q-01).
   - CV PDF (`tools/cv/`) lấy dữ liệu từ đây → kiểm tra hiển thị điện thoại/kinh nghiệm.
- Được sửa: `src/content/` (trừ `schema.ts` — chỉ đề xuất), `tools/cv/`, `tools/og/`, `tests/unit/content/`, `tests/unit/tools-cv/`; tạo file trong `content-private/` (không commit).
- Không được sửa: `src/app/`, `src/components/`, `src/features/`, `tests/e2e/`, `package.json`, lockfile, config, `docs/`.
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test` (liên quan content/cv), `pnpm build:artifacts`, `pnpm check:cv`, `pnpm check:leaks` exit 0 (dán output tóm tắt). Không chạy full e2e. Không commit.
- Bàn giao: danh sách file nháp + số câu `TBD` mỗi file, thay đổi trong `src/content/`, đề xuất schema (nếu có), câu hỏi mới cho Duy.
