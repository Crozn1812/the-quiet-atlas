# CONTENT-01 — TBD / chỗ trống trước phát hành

Rà ngày 2026-11-13. Chỉ tạo báo cáo, không điền dữ liệu, không commit. `content/evidence.json` trong ticket thực tế là `src/content/evidence.json`.

## Kiểm chứng render

`out/` chưa có khi bắt đầu. Build WASM + webpack đúng một lần đã exit 0, tạo 22 trang và PDF EN 49,400 bytes / VI 56,841 bytes (2026-11-13). Đã mở toàn bộ HTML trong Edge headless bằng Playwright, chặn network, lấy `body.innerText`: tất cả **19 HTML có 0 TBD hiển thị**. Các câu “chưa đo / chưa có bằng chứng” vẫn hiện ở cả tám case study. Kiểm tra này xác nhận HTML render tĩnh, không khẳng định đã thao tác hết overlay tương tác.

EN/VI cùng hàng là cùng vấn đề, không cần hỏi hai lần. Ví dụ chỉ là định dạng trả lời, không phải dữ kiện để xuất bản.

Ký hiệu trang: C = `/en/projects/cms-devops-platform-aws-eks/` và `/vi/projects/cms-devops-platform-aws-eks/`; P = hai locale của `/projects/partner-data-gateway-azure/`; I = hai locale của `/projects/insighthub-rag/`; A = hai locale của `/projects/aws-sales-data-pipeline/`. CV = hai PDF tải từ `/cv/`.

## TBD trong câu nguồn

Các dự án đều approved/completed; chỉ phần câu còn TBD được giữ trong nguồn và lọc khỏi UI. `CaseStudy.tsx` gọi `published()`; CV cũng lọc câu TBD ở các trường được chọn. Không coi toàn bộ dự án là bản nháp.

| File:dòng EN / VI | Trường | Hiện trên trang nào | Câu hỏi ngắn cho Duy (có ví dụ) |
| --- | --- | --- | --- |
| `src/content/index.ts:34`, `:51` | C.constraints: ngân sách, thời gian | C ẩn câu TBD; CV không lấy trường | Ngân sách và thời gian làm CMS là bao nhiêu? Ví dụ: “4 tuần; không theo dõi chi phí”. |
| `src/content/index.ts:36`, `:53` | C.contributions: phần khóa học cung cấp | C/CV ẩn câu TBD, giữ câu đã biết | Khóa học cung cấp sẵn phần nào của CMS? Ví dụ: “Ứng dụng có sẵn; em viết Terraform và pipeline”. |
| `src/content/index.ts:40`, `:57` | C.alternatives: đã thử phương án khác chưa | C ẩn câu TBD; CV không lấy trường | Các phương án trên slide có được thử thật không? Ví dụ: “Chỉ so sánh, chưa triển khai”. |
| `src/content/index.ts:41`, `:58` | C.implementation: mã/pipeline | C ẩn câu TBD; CV không lấy trường | Mã và pipeline CMS còn giữ và được phép chia sẻ không? Ví dụ: “Còn bản riêng, không công khai”. |
| `src/content/index.ts:42`, `:59` | C.validation: bản ghi demo | C ẩn câu TBD; CV không lấy trường | Có bản ghi demo CMS được phép công khai không? Ví dụ: “Không ghi hình”. |
| `src/content/index.ts:44`, `:61` | C.lessons: suy ngẫm cá nhân | C ẩn câu TBD; CV không lấy trường | Bài học cá nhân lớn nhất từ CMS là gì? Ví dụ: “Kiểm tra state sau apply bị ngắt”. |
| `src/content/index.ts:71`, `:88` | P.myRole: phân chia công việc | P/CV ẩn câu TBD | Em trực tiếp làm phần nào của Partner Gateway? Ví dụ: “Em viết Function/test; đồng đội cấu hình APIM”. |
| `src/content/index.ts:73`, `:90` | P.teamContext: số người/vai trò | P bỏ toàn bộ câu; CV không lấy trường | Nhóm có bao nhiêu người và vai trò nào? Ví dụ: “3 người: mentor, backend, thực tập sinh”. |
| `src/content/index.ts:76`, `:93` | P.alternatives: đánh đổi chi tiết | P ẩn câu TBD; CV không lấy trường | Đánh đổi chính khi dùng JWT tự cấp là gì? Ví dụ: “Phải tự quản lý vòng đời token”. |
| `src/content/index.ts:78`, `:95` | P.validation: log/ảnh kiểm thử | P ẩn câu TBD; CV không lấy trường | Có log/ảnh đã che dữ liệu được phép công khai không? Ví dụ: “Chỉ có log demo dùng dữ liệu giả”. |
| `src/content/index.ts:80`, `:97` | P.lessons: suy ngẫm cá nhân | P ẩn câu TBD; CV không lấy trường | Bài học cá nhân lớn nhất là gì? Ví dụ: “Test quyền từng dòng dữ liệu từ đầu”. |
| `src/content/index.ts:108`, `:125` | I.contributions: khác repo giảng viên | I/CV ẩn câu TBD | Module/file nào do em viết so với repo gốc? Ví dụ: “Em viết worker và Helm; UI có sẵn”. |
| `src/content/index.ts:112`, `:129` | I.alternatives: phương án khác | I ẩn câu TBD; CV không lấy trường | Ngoài LLM-only/RAG, em cân nhắc phương án nào? Ví dụ: “Không có”. |
| `src/content/index.ts:116`, `:133` | I.lessons: suy ngẫm cá nhân | I ẩn câu TBD; CV không lấy trường | Bài học cá nhân lớn nhất là gì? Ví dụ: “Đo token trước khi chọn chunk size”. |
| `src/content/index.ts:142`, `:159` | A.constraints: ngân sách/quy mô | A ẩn câu TBD; CV không lấy trường | Ngân sách và quy mô dữ liệu là bao nhiêu? Ví dụ: “Chỉ file mẫu 103 dòng; chưa theo dõi chi phí”. |
| `src/content/index.ts:148`, `:165` | A.alternatives: phương án khác | A ẩn câu TBD; CV không lấy trường | Ngoài EC2/ECS/Lambda, có phương án khác không? Ví dụ: “Không có”. |
| `src/content/index.ts:152`, `:169` | A.lessons: suy ngẫm cá nhân | A ẩn câu TBD; CV không lấy trường | Bài học cá nhân lớn nhất là gì? Ví dụ: “Thiết kế idempotency trước retry”. |

## Placeholder, mảng trống, bản nháp

| File:dòng | Trường | Hiện trên trang nào | Câu hỏi cho Duy / xử lý |
| --- | --- | --- | --- |
| `src/content/index.ts:176` | C.repoUrl = TBD, dùng chung EN/VI | Link bị ẩn ở C/CV; giá trị thô xuất ở `/en/world-content.json`, `/vi/world-content.json` | CMS có repo được phép công khai không? Ví dụ: “Không có; chỉ còn slide”. |
| `src/content/index.ts:283` | profiles[en,vi].cvUrl = TBD | Trường legacy; không dùng trong renderer CV; tải PDF dùng `cvFiles()` qua `/cv/` | Không cần Duy điền URL giả; Lead cân nhắc xử lý trường legacy ở ticket riêng. |
| `src/content/index.ts:294` | experience[0].evidence = [], cả EN/VI | Kinh nghiệm HPT vẫn hiện; không có liên kết bằng chứng từ trường này | Có bằng chứng công khai cho kỳ thực tập không? Ví dụ: “Không, chỉ có tự mô tả đã duyệt”. |
| `src/content/index.ts:320` | projects[*].metrics = [], 4 dự án × 2 locale | Case study không có hàng metric; CV dùng results bằng chữ | Có phép đo thật kèm giá trị, đơn vị, cách đo, môi trường, ngày và nguồn công khai không? Ví dụ: “Chưa đo; giữ nguyên”. |
| `src/content/evidence.json:51` | CMS slides.level = TBD | EvidenceView lọc toàn bộ evidence này; level thô trong world-content.json | Slide hiện đủ căn cứ phân loại evidence chưa? Ví dụ: “Chỉ tự mô tả; chưa có bằng chứng độc lập”. |
| `src/content/evidence.json:54` | CMS slides.publicUrl = TBD | Không có link UI; giá trị thô trong world-content.json | Có URL slide được phép công khai không? Ví dụ: “Không; chỉ giữ riêng”. |
| `src/content/evidence.json:59` | CMS slides.approvedBy = TBD | Metadata nguồn; không render trong UI/CV, không xuất trong world-content.json | Ai duyệt công khai tài liệu CMS? Ví dụ: “Duy chỉ duyệt mô tả, chưa duyệt slide”. |
| `src/content/evidence.json:60` | CMS slides.approvedAt = TBD | Metadata nguồn; không render trong UI/CV, không xuất trong world-content.json | Ngày thực sự duyệt công khai tài liệu là ngày nào? Ví dụ: “2026-11-13”, chỉ khi đã duyệt. |
| `src/content/drafts.ts:7` | experienceDraft.evidence = TBD | Chỉ draft; CV loader không tải drafts | Không bắt buộc phát hành; nếu muốn dùng claim, có bằng chứng được phép chia sẻ không? Ví dụ: “Không; giữ draft”. |

## Khoảng thiếu viết bằng chữ còn public

| File:dòng EN / VI | Trường | Hiện trên trang nào | Câu hỏi ngắn cho Duy (có ví dụ) |
| --- | --- | --- | --- |
| `src/content/index.ts:43`, `:60` | C.results: chưa có bằng chứng độc lập; chưa đo | C và CV EN/VI | CMS có ảnh/log đã che hoặc phép đo công khai mới chưa? Ví dụ: “Chưa; giữ giới hạn hiện tại”. |
| `src/content/index.ts:79`, `:96` | P.results: latency, volume, cost, adoption chưa đo | P và CV EN/VI | Đã có phép đo Partner Gateway được phép công khai chưa? Ví dụ: “Chưa đo”. |
| `src/content/index.ts:115`, `:132` | I.results: chất lượng câu trả lời chưa đo | I và CV EN/VI | InsightHub đã có bộ đánh giá chất lượng chưa? Ví dụ: “Chưa benchmark, chỉ kiểm tra end-to-end local”. |
| `src/content/index.ts:151`, `:168` | A.results: throughput, latency, cost chưa đo | A và CV EN/VI | Đã có số đo hiệu năng/chi phí chưa? Ví dụ: “Chưa; 99/4 chỉ là kết quả file mẫu”. |
| `src/content/index.ts:241`, `:235` | certificates: AWS SAA dự định, stone blank | CV; dữ liệu overlay `/en/`, `/vi/` qua world-content.json | AWS SAA vẫn dự định hay đã thi? Ví dụ: “Chưa thi, giữ Planned”. |
| `src/content/index.ts:242`, `:236` | certificates: Linux hoặc CEH dự định, stone blank | CV; dữ liệu overlay `/en/`, `/vi/` qua world-content.json | Em đã chọn Linux hay CEH chưa? Ví dụ: “Chưa chọn, giữ dự định”. |

Chứng chỉ dự định là chỗ trống có chủ ý, không phải chứng chỉ đã đạt. Các tính năng chưa làm của Sales Pipeline, AWS runtime chưa chạy của InsightHub và môi trường CMS đã gỡ là giới hạn đã mô tả, không tự lấp bằng kết quả giả.

## Không phải thiếu nội dung

- `schema.ts:4,26,36,77,125,133,162,166`: literal TBD trong validation; `:65–70`: default mảng rỗng, không phải dữ liệu thực tế thiếu.
- `index.ts:5`: comment quy tắc giữ unknown; không render.
- `tools/cv/render.mjs:5,28`: lọc TBD/ẩn điện thoại TBD; điện thoại thực tế đã có. Chuỗi rỗng fallback/join và metadata PDF bị xóa có chủ ý không phải ô cần Duy điền.
- `tools/cv/README.md:30–31` mô tả “unchanged TBD placeholders” đã lệch renderer hiện tại; không sửa vì ngoài phạm vi. CV không có nguồn nội dung độc lập: loader đọc public index/schema/evidence và không đọc drafts.

## Lệnh và bàn giao

- Build: `$env:NEXT_TEST_WASM_DIR='C:\Users\PC-LP\AppData\Local\next-swc\wasm\package'; $env:NEXT_BUILD_WEBPACK='1'; pnpm.cmd build` — exit 0; `✓ Compiled successfully in 11.6s`; `✓ Generating static pages using 12 workers (22/22) in 5.6s`.
- `pnpm.cmd lint` — exit 0, 0 warning (`$ eslint .`). `pnpm.cmd typecheck` — exit 0 (`$ tsc --noEmit`).
- `pnpm.cmd test` — exit 1: `Test Files 7 failed | 145 passed (152)`; `Tests 10 failed | 1764 passed (1774)`; duration 149.77s. Có timeout 15s trong world tests, ngoài phạm vi báo cáo; chạy lại giới hạn 2 workers để kiểm tra tải máy.
- Dùng `pnpm.cmd` vì execution policy chặn `pnpm.ps1`, không đổi policy/config.
- File bàn giao duy nhất: `tools/review/CONTENT-01-report.md`. `out/` chỉ là artifact build. Không cần nối vào `src/features/world/index.ts`, không có code tích hợp. Không sửa nội dung nguồn hay các tests thất bại.
- Trích text hai PDF build thật bằng hàm `extractText` sẵn có trong `tools/cv/verify.mjs`: EN và VI đều `TBD=false, blank=true, metrics=true`; xác nhận không có TBD, có câu chứng chỉ còn trống và giới hạn chưa đo. Không chỉ dựa vào HTML mẫu của CV.
- Đọc hai file `out/{en,vi}/world-content.json` thật: mỗi locale chứa CMS `repoUrl: TBD`, evidence `level: TBD`, `publicUrl: TBD`, cùng hai mô tả chứng chỉ blank. Đây là payload truy cập public dù UI lọc placeholder.
- Duyệt đệ quy dữ liệu runtime qua `readContent()`: không có string rỗng/whitespace, null hay undefined; mảng rỗng chỉ gồm 2 experience.evidence và 8 project.metrics đã liệt kê.
- `git status --short`: chỉ `?? tools/review/CONTENT-01-report.md`.
- Chạy lại `pnpm.cmd test --maxWorkers=2` — **exit 0**: `Test Files 152 passed (152)`; `Tests 1774 passed (1774)`; `Duration 235.36s`. Không sửa test/config; kết quả phù hợp giả thuyết lần đầu bị ảnh hưởng tải máy, không khẳng định nguyên nhân tuyệt đối.
- Tổng kết: lint **exit 0, 0 warning**; typecheck **exit 0**; toàn bộ test với 2 workers **exit 0, 1774/1774 passed**; build **exit 0**. Lần test mặc định đầu tiên vẫn được ghi nhận thất bại ở trên.
