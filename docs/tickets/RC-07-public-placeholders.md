## RC-07 — Không công bố placeholder trong Quick / case study / evidence
- Trạng thái: review (chưa commit/merge).
- Vùng file: src/components/portfolio/CaseStudy.tsx, QuickPortfolio.tsx, ProjectLinkViews.tsx, published.ts; tests/unit/portfolio/pages.test.ts, published.test.ts.
- Lỗi: dữ liệu nháp TBD được in nguyên trong trang case study, contact và nhãn evidence; trái CLAUDE §6.
- Không sửa src/content, không bổ sung câu chuyện hay số liệu.
- Cách sửa: giữ nguyên field đã đủ; với field hỗn hợp chỉ loại câu còn TBD, giữ nguyên các câu đầy đủ và qualification. Bỏ section chỉ còn nháp, nguồn/evidence chưa có URL, metric còn thiếu bất cứ trường nào. Lab/demo và phạm vi bằng chứng vẫn hiện nguyên.
- Phép thử: unit published + pages + quick-editorial + zone-content; ESLint các file thay đổi; typecheck riêng do Lead chạy.
- Giới hạn: không render browser/build lúc Lead đang audit. Source nháp vẫn nguyên để Duy bổ sung sau.

- Kiểm tra đã chạy: Vitest 4 file / 68 test PASS; ESLint 0 warning exit 0; tsc --noEmit exit 0; git diff --check exit 0. Chạy Node trực tiếp do pnpm store lock của sandbox.
