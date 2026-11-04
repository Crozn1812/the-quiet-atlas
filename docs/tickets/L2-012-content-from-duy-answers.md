## TICKET L2-012 — Đưa câu trả lời của Duy vào nội dung (profile, 4 case study, CV, evidence song ngữ)

- Trạng thái: **Assigned → subagent L2 (sonnet)** (2026-11-04, đợt 12), nhánh `lane/L2-012`, worktree `D:/tqa-worktrees/L2-012`
- Lane / milestone: L2 Content & CV / A1
- Spec: §1.1 (không bịa), §2.2, §4.1, §4.3, §4.4; ADR 0010 (cả phần "Mở rộng đợt 12")
- Nguồn sự thật: `docs/DUY_QUEUE.md` bảng "Câu trả lời ngày 2026-11-04 (lượt 2)"; nháp `content-private/drafts/*.md` (gitignored, ở checkout chính `D:/the-quiet-atlas/content-private/`); text trích ở `C:/Users/PC-LP/AppData/Local/Temp/claude/0fa2f3b7e932577a/8df7ab9d-792e-48b0-9ba4-5db2ee26ab9c/scratchpad/duy-docs/` (pdg-doc, pdg-slides, cms-slides, rag-slides); CV `C:/Users/PC-LP/Downloads/CloudDevOps-NguyenHuuBaoDuy.pdf`. **Không** chép file nguồn vào repo.

### Việc
1. **Nháp** `content-private/drafts/*.md`: áp dụng câu trả lời (bỏ "DO2603", CMS = đồ án tốt nghiệp khóa VTI DevOps, làm một mình; tất cả dự án `completed`; PDG tên "Secure Partner Data Sharing Portal", phân tách A/B đã đạt, key rotation/revoke đã xong, có giai đoạn 2 Kong/on-prem đã hoàn thành; InsightHub: bối cảnh bản triển khai từ repo của giảng viên, Duy viết phần triển khai, chỉ ghi "InsightHub"). Xóa các câu hỏi đã được trả lời.
2. **`src/content/index.ts`**, EN + VI, `reviewStatus` vẫn `draft` (Duy sẽ duyệt từng trang — Q-04):
   - `linkedinUrl`: `https://www.linkedin.com/in/nguyenhuubaoduy`
   - `introduction`: phương án A trong `intro.md`, sửa để Duy được giới thiệu là **Cloud DevOps Engineer** (Duy ghi "CloudDevOps Engineer"); cấp độ hiện tại vẫn `Intern`. ≤ 25 từ.
   - experience HPT `summary` (EN + VI): triển khai dịch vụ cloud Microsoft Azure — API Management, Azure Functions, Microsoft Fabric, Power Automate. Không thêm số liệu.
   - 4 project: điền mọi trường từ nháp đã cập nhật (EN + VI), `status: "completed"`, title PDG = "Secure Partner Data Sharing Portal" (**giữ nguyên slug** `partner-data-gateway-azure`). Trường nào nguồn không có → giữ `TBD`.
   - AWS Sales Data Pipeline: **Q-16 chưa trả lời** → chỉ mô tả theo README (S3 kích hoạt Lambda), không nhắc EventBridge, không nêu "Shopmart".
   - CMS: ghi mức bằng chứng thấp (chỉ tài liệu/slide, môi trường AWS đã bị VTI gỡ sau khi nộp). Không có repoUrl.
3. **Evidence song ngữ** (ADR 0010 mở rộng): thêm `claimEn`/`scopeEn`/`descriptionEn` (optional) vào schema + superRefine (level khác TBD phải có claimEn và scopeEn) + unit test; điền cho mọi evidence. Cập nhật evidence PDG demo theo câu trả lời (Duy là người duyệt công bố). Chỉ thêm evidence mới cho CMS nếu schema cho phép mà không bịa publicUrl.
4. **PDG an toàn công bố (Q-05):** không tên site/list SharePoint, phòng ban, mã khu vực, ID, URL nội bộ. Grep kết quả cuối (src/content, tools/cv output) với các tên nội bộ có trong `pdg-doc.txt`/`pdg-slides.txt` để chắc không lọt.
5. **CV** `tools/cv/`: LinkedIn, tên PDG mới, bỏ DO2603, summary HPT; test render.

- Được sửa: `src/content/`, `tools/cv/`, `tools/og/`, `tests/unit/content/`, `tests/unit/tools-cv/`, `content-private/drafts/`
- Không được sửa: `src/app/`, `src/components/`, `src/features/`, `tests/e2e/`, `package.json`, lockfile, config, `docs/`
- Ràng buộc: không bịa số liệu/URL/thành tích; mọi câu public phải truy được về nguồn hoặc câu trả lời của Duy.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build:artifacts`, `pnpm check:cv`, `pnpm check:leaks` exit 0 — dán dòng tổng kết. Không chạy e2e. Không commit.
- Bàn giao: bảng trường → nguồn; danh sách TBD còn lại; kết quả grep tên nội bộ PDG.
