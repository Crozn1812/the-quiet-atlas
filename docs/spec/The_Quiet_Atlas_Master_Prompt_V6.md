# THE QUIET ATLAS — MASTER PROMPT & PROJECT SPECIFICATION V6.0

**Chủ sở hữu:** Nguyễn Hữu Bảo Duy
**Ngày hợp nhất:** 03/11/2026
**Nguồn hợp nhất:** V4.0 (khóa quyết định sáng tạo), V5.0 bản rà soát (Claude), V5.0 Master Prompt (chủ dự án)
**Mục đích:** Đặc tả độc lập để thiết kế, xây dựng, kiểm thử và triển khai portfolio Cloud/DevOps có thế giới 3D.
**Trạng thái:** Đặc tả hoàn chỉnh để sử dụng; chưa phải bằng chứng sản phẩm đã được xây dựng, kiểm thử hoặc triển khai.

> Có thể giao toàn bộ tài liệu này cho AI triển khai mà không cần đính kèm các bản cũ. Mọi ngưỡng hiệu năng, usability và chi phí là **yêu cầu kiểm thử**, không phải kết quả đã đạt. Dữ kiện cá nhân, dự án, chứng chỉ và quyền công bố chưa có bằng chứng vẫn phải xác minh.

### Thay đổi chính của V6 so với các bản V5

| Chủ đề | V6 |
|---|---|
| Tài nguyên vận hành | Ràng buộc mới: chỉ có **200 USD AWS Free Tier credits**; kiến trúc, gói CloudFront và ngân sách được thiết kế quanh ràng buộc này (§1.3, §11) |
| Tài khoản AWS | Bắt buộc nâng lên Paid plan trước khi public, vì Free account plan tự đóng sau 6 tháng và không dùng được CloudFront flat-rate (§11.1) |
| CloudFront Free plan | Cấu hình cụ thể theo giới hạn thật của gói: managed cache/headers policy, CloudFront Function, 5 cache behaviors, 5 luật WAF, không có access logs (§11.2) |
| Tên miền | Mục mới về chọn registrar, DNS, TLS, email và redirect; credits AWS không trả được phí đăng ký tên miền (§11.3) |
| Routes | `/en/`, `/vi/` vừa là Welcome vừa là shell thế giới, không có route `/world/` riêng; đổi ngôn ngữ trong game không điều hướng (§5, §6.3) |
| Điều hướng thế giới | Thêm Atlas Journal và biển chỉ đường làm điểm dịch chuyển, vẫn giữ nguyên tắc không minimap (§7.2) |
| Lộ trình | Hai track có timebox; Track World không bao giờ vượt Track Portfolio (§12) |
| Nghiệm thu | Thêm Q23–Q26 cho headers/CSP, tên miền/TLS, guardrail chi phí và ngân sách tải (§13) |

---

## 1. Vai trò, mục tiêu và nguyên tắc thực hiện

Bạn là kỹ sư phụ trách The Quiet Atlas, kết hợp tư duy sản phẩm, frontend, web 3D, khả năng tiếp cận và vận hành Cloud/DevOps. Triển khai theo từng milestone có thể chạy và kiểm chứng, giữ đúng quyết định sáng tạo và phạm vi công việc được giao.

Sản phẩm là một thế giới duy nhất có câu chuyện ẩn, đi từ rừng bình minh ra biển hoàng hôn, mang tinh thần hồi tưởng, hy vọng, độc lập và khám phá. Người xem tìm hiểu con người và năng lực của Nguyễn Hữu Bảo Duy qua tám địa điểm, đồng thời luôn có đường truy cập nhanh vào hồ sơ nghề nghiệp.

Đối tượng gồm nhà tuyển dụng, khách hàng, giảng viên và bạn bè. Vai trò hiển thị là "Cloud & DevOps Engineer" kèm cấp độ đúng thực tế (ví dụ Intern/Fresher nếu đã xác nhận); không tự gán Senior hoặc kinh nghiệm chưa có. Tiếng Anh mặc định, tiếng Việt tùy chọn.

**Thứ tự ưu tiên khi có đánh đổi:**

1. Nội dung đúng, được phép công khai; liên hệ/CV truy cập được.
2. Portfolio HTML hoạt động độc lập, dễ đọc và dễ sử dụng.
3. Trải nghiệm ổn định trên cấu hình mục tiêu, có đường phục hồi khi lỗi.
4. Bản sắc hình ảnh, nhịp khám phá và cảm xúc của thế giới.
5. Xe, secrets, mascot và AI mở rộng trải nghiệm sau khi nền tảng đạt yêu cầu.

**Nguyên tắc sản phẩm:**

- **Recruiter-first.** Khi trải nghiệm game và tốc độ tiếp cận thông tin mâu thuẫn, tốc độ tiếp cận thắng. Quick Portfolio là sản phẩm chính; thế giới 3D là lớp trải nghiệm phía trên.
- **Quy tắc 30 giây.** Từ lúc mở link, trong 30 giây người xem biết được tên, vai trò/cấp độ, năng lực cốt lõi, dự án nổi bật, nút CV và cách liên hệ mà không cần bấm Enter World.
- **Chính sản phẩm là bằng chứng.** Sau khi làm thật, hạ tầng, pipeline, chi phí và hiệu năng của website được công bố như một case study vận hành.
- **Mọi tuyên bố truy được nguồn.** Mỗi số liệu, chứng chỉ, kết quả dự án gắn với một mục bằng chứng (§4).
- **Ra mắt dần.** Mỗi mốc kết thúc bằng một phiên bản dùng được, không chờ thế giới hoàn chỉnh.

Hai mốc phát hành chính: **A — Editorial/Quick Portfolio dùng để ứng tuyển**; **B — thế giới 3D đầy đủ**. AI thật có gate riêng (C1), không chặn A và B. Một nguồn nội dung đã duyệt dùng chung cho website, overlay, CV và chatbot.

### 1.1 Cách làm việc bắt buộc

- Đọc repo, quy tắc dự án và `PROJECT_STATUS` trước khi sửa; không tạo lại từ đầu nếu đã có phần đúng.
- Phân biệt yêu cầu, giả định, dữ kiện đã xác minh, nội dung nháp và kết quả thực đo.
- Tự quyết định chi tiết nhỏ, có thể đảo ngược, nằm trong phạm vi milestone. Ghi quyết định kiến trúc quan trọng vào ADR ngắn.
- Chỉ hỏi khi thiếu thông tin ảnh hưởng tính đúng, quyền công bố, chi phí hoặc quyết định sáng tạo đã xác lập; tiếp tục phần độc lập trong lúc chờ.
- Không tự thay concept để dễ code; không tự thêm tài khoản người xem, CMS, multiplayer hoặc hạ tầng phức tạp.
- Không tự tạo thành tích, số liệu, URL, chứng chỉ, quyền dùng asset hoặc câu chuyện đời tư.
- Nhiệm vụ thiết kế/code local không tự bao gồm mua tên miền, nâng cấp tài khoản, đăng ký dịch vụ trả phí hoặc tạo tài nguyên cloud. Chỉ làm khi phạm vi giao việc bao gồm và điều kiện ở §11 đã đủ.
- Không ghi PASS nếu chưa chạy phép thử tương ứng. Không gọi placeholder, mock hoặc screenshot là sản phẩm hoàn thiện.
- Không yêu cầu gửi token, secret, mật khẩu hay thông tin đăng nhập vào chat.

### 1.2 Phạm vi lưu dữ liệu

Tiến trình chơi chỉ tồn tại trong memory của lượt chơi: vị trí, secret, xe, overlay và ending. Không lưu progress vào localStorage, sessionStorage, cookie, URL hay backend. Tùy chọn ngôn ngữ/âm thanh/chất lượng cũng chỉ tồn tại trong memory.

Đường dẫn locale và URL chia sẻ dự án là địa chỉ nội dung, không phải dữ liệu progress. Cache tài nguyên trình duyệt/CDN được phép. Bộ đếm quota AI, bộ đếm sự kiện tổng hợp (nếu bật) và log vận hành tối thiểu có thể tồn tại theo chính sách riêng, không chứa tiến trình chơi hay định danh người xem.

### 1.3 Ràng buộc tài nguyên vận hành

- **Ngân sách cloud:** 200 USD AWS Free Tier credits. Không có ngân sách tiền mặt bổ sung cho AWS trừ khi chủ dự án xác nhận.
- **Mục tiêu kiến trúc:** chi phí nền (không tính tên miền và model AI) gần 0 USD/tháng, để site vẫn chạy được sau khi credits hết hạn.
- **Tên miền:** chủ dự án tự mua bằng tiền riêng; credits AWS không dùng được cho phí đăng ký tên miền qua Route 53 [S12].
- **Hệ quả thiết kế:** mọi lựa chọn hạ tầng phải nằm trong giới hạn tính năng của CloudFront flat-rate Free plan (§11.2) hoặc có lý do ghi trong ADR nếu vượt ra ngoài.

---

## 2. Bản sắc sáng tạo và phạm vi sản phẩm

- Một thế giới duy nhất từ rừng bình minh ra biển hoàng hôn; painterly organic, editorial retro, cinematic atmospheric; xanh rừng, xanh nước, kem ngà, vàng hoàng hôn.
- Tám địa điểm và nội dung giữ nguyên (§2.1).
- Nhân vật stylized tóc đen, kính tròn, áo trắng, quần short, tỷ lệ không chibi; Suzuki GD110 trắng, ghi đông scrambler cao; Manual/Auto Cruise; E lên/xuống xe.
- WASD, camera xoay ngang 360°, zoom giới hạn; không minimap, không compass; bảng chỉ đường vật lý.
- Welcome có Enter World, Quick Portfolio, Sound; cinematic cận cảnh lá, nước, sương rồi lộ nhân vật, có Skip; âm thanh chỉ phát sau thao tác bật của người xem.
- Overlay phong cách tạp chí/triển lãm số, chiếm khoảng 85–90% màn hình desktop; thích ứng trên màn hình nhỏ và khi phóng to chữ; chuyển cảnh bằng sương.
- Secrets: Reflection, Forgotten Sound, Unmarked Road (tùy thứ tự); The Unwritten Page tại ghế gỗ mở ending 30–45 giây sau khi đủ ba secret. Nội dung ẩn dụ, không tiết lộ chuyện riêng, không khóa nội dung nghề nghiệp.
- Mascot là phân thân cảm xúc (rừng + nước + công nghệ), bay theo nhân vật, có avatar mini ở chat, gợi ý theo khu vực, có thể tắt.
- Âm thanh: indie mộc kết hợp môi trường rừng/suối/biển, chuyển mềm theo vùng; chỉ dùng nguồn được phép. Ưu tiên cân nhắc bản thu piano/guitar do chủ dự án tự chơi cho Forgotten Sound.
- AI thật chỉ trả lời dữ liệu được duyệt; fallback FAQ. Mobile mặc định Editorial Portfolio.
- Không CMS; không lưu tiến trình qua reload/phiên mới. Không mặc định thêm tài khoản, multiplayer, leaderboard, nhiệm vụ hằng ngày hoặc hệ thống phần thưởng.
- Email, GitHub, LinkedIn, điện thoại và CV chỉ công khai sau kiểm tra phạm vi (§4.4). Không tự thêm thông tin cá nhân khác từ lịch sử trò chuyện.

### 2.1 Tám địa điểm chính

| Địa điểm | Nội dung | Dàn cảnh |
|---|---|---|
| The First Light | About Me | Điểm spawn trong rừng, giới thiệu ngắn và lời mời khám phá |
| The Roots | Skills | Bộ rễ kết nối, biểu trưng nền tảng mạng và hạ tầng |
| The Workshop | Selected Projects | Xưởng cạnh suối, gần spawn; có góc "The Making of The Quiet Atlas" (§2.3) |
| The Milestones | Certificates & Learning | Bia đá trên đồi; chứng chỉ có thật, slot tương lai không ghi là đã đạt |
| The Old Trail | Journey | Các mốc học tập, công việc đúng dữ kiện |
| The Horizon | Future Direction | Mỏm cao hướng biển; phân biệt nguyện vọng với thành tựu |
| The Quiet Shore | Hobbies & Personality | Ghế gỗ, xe máy, nhạc indie, piano/guitar, biển và khám phá |
| The Last Postcard | Contact, CV & Links | Điểm kết nối với các đường dẫn công khai đã duyệt |

Bảng chỉ đường vật lý và dấu mốc địa hình hỗ trợ định hướng; suối là trục chính. Bốn địa điểm bí mật không có bảng chỉ đường. Không thêm icon UI lớn phủ lên thế giới.

### 2.2 Bốn dự án mục tiêu

| Dự án | Nội dung cần thu thập, không mặc định đã hoàn thành |
|---|---|
| CMS DevOps Platform AWS EKS | Bài toán CMS, phạm vi EKS thực tế, CI/CD, hạ tầng, quan sát và phần đóng góp cá nhân |
| Partner Data Gateway Azure | Bài toán tích hợp, luồng dữ liệu, kiểm soát truy cập, kiểm thử và phạm vi được phép công khai |
| InsightHub RAG | Dữ liệu nguồn, retrieval, cách đánh giá câu trả lời, hạn chế và chi phí đã đo nếu có |
| AWS Sales Data Pipeline | Nguồn/đích dữ liệu, các bước xử lý thực tế, kiểm tra chất lượng, lỗi và cơ chế phục hồi |

Tên dự án không chứng minh đã dùng mọi công nghệ liên quan. Điền nội dung từ tài liệu và bằng chứng thực tế; còn thiếu thì ghi TBD trong bản nháp và không đưa giả định lên public.

### 2.3 Case study thứ năm: The Making of The Quiet Atlas

Chỉ công bố **sau khi đã làm thật**: ADR, IaC đã làm sạch, pipeline CI/CD, phép đo hiệu năng, chi phí thực tế theo tháng, lần diễn tập rollback. Trong thế giới, góc này là một bàn bản vẽ kỹ thuật trong The Workshop, hiển thị dữ liệu sinh lúc build vào `build-info.json` (phiên bản, commit SHA, ngày deploy, dung lượng tải Quick/World). Không cần backend runtime. Với vai trò Cloud/DevOps, đây là bằng chứng gần nhất với chính sản phẩm.

---

## 3. Luồng người xem và mục tiêu sử dụng

### 3.1 Luồng tuyển dụng

Welcome → Quick Portfolio → case study → GitHub/CV/liên hệ. Mọi bước dùng được khi WebGL lỗi hoặc JavaScript tắt. Trang dự án mở từ liên kết bên ngoài hiển thị trực tiếp nội dung, không ép quay lại Welcome.

Welcome hiển thị sẵn tên, vai trò/cấp độ, một câu giới thiệu và link CV, ngoài ba nút Enter World, Quick Portfolio, Sound.

Màn hình đầu của Quick Portfolio gồm: tên, vai trò/cấp độ, giới thiệu ngắn, hai dự án nổi bật, nút CV và liên hệ. Mỗi dự án có bản đọc nhanh trước phần kỹ thuật dài.

Mục tiêu thử nghiệm: ít nhất 4/5 người chưa biết sản phẩm tìm được dự án, CV và liên hệ trong 60 giây mà không cần hướng dẫn. Đây là phép thử usability nhỏ, không phải bằng chứng thống kê.

### 3.2 Luồng khám phá

Enter World → tải phần rừng đầu tiên → cinematic có Skip → khám phá → mở nội dung → trở về vị trí cũ. Menu luôn có "Mở Quick Portfolio". The Workshop đến được trong khoảng 45–60 giây đi theo bảng sau khi nhận quyền điều khiển (mục tiêu thiết kế, cần playtest). Atlas Journal (§7.2) cho phép mở nội dung bất kỳ khu nào mà không cần đi tới.

### 3.3 Luồng dự phòng

WebGL không khả dụng, tải asset thất bại hoặc renderer lỗi → thông báo ngắn → thử lại hoặc Quick Portfolio. Không có vòng lặp retry vô hạn. Không cần AI, âm thanh hay secret để tải CV.

### 3.4 Chọn trải nghiệm theo năng lực thiết bị

Không dựa vào user-agent. Nút Enter World chỉ hiện khi đủ: WebGL2 khả dụng, `(pointer: fine)` và chiều rộng viewport ≥ 1024 px. Không đủ thì nút đổi thành "Xem bản Editorial" kèm một dòng lý do. Tablet đủ WebGL2 có thêm lựa chọn "Thử 3D" kèm cảnh báo. Bản đầu không hứa hỗ trợ điều khiển game 3D trên mobile.

---

## 4. Nội dung, bằng chứng và hợp đồng dữ liệu

### 4.1 Hợp đồng dữ liệu

Tách bản nháp khỏi tập dữ liệu công khai. Tập public là nguồn duy nhất cho build HTML, overlay, CV PDF và knowledge package AI. Dữ liệu nháp không được import vào client bundle, static JSON hoặc asset public. Nếu repository public thì không lưu dữ liệu mật trong repository, kể cả dưới dạng bản nháp.

Các trường tối thiểu cho project:

| Trường | Ý nghĩa |
|---|---|
| `id`, `slug`, `locale` | Định danh ổn định và ngôn ngữ |
| `title`, `summary`, `status` | Trạng thái: planned / in-progress / completed / archived |
| `context`, `problem`, `constraints` | Bài toán và phạm vi |
| `myRole`, `contributions`, `teamContext` | Phần Duy trực tiếp thực hiện và phần thuộc nhóm |
| `architecture`, `decisions`, `alternatives` | Cách làm và đánh đổi |
| `implementation`, `validation`, `results`, `lessons` | Triển khai, phép thử, kết quả và bài học |
| `evidence[]` | ID bằng chứng (tham chiếu ledger §4.2) |
| `metrics[]` | Giá trị, đơn vị, phương pháp đo, môi trường, thời điểm, nguồn; thiếu thì không tạo số |
| `reviewStatus`, `publicApproval`, `lastReviewedAt` | Duyệt nội dung, quyền công bố, ngày rà soát |
| `translationStatus`, `contentVersion` | Kiểm soát dịch và phiên bản |

Validator chạy tại build (ví dụ Zod), không chỉ dựa vào TypeScript. Build fail khi: slug trùng, thiếu trường bắt buộc, thiếu khóa ở một ngôn ngữ, tham chiếu evidence không tồn tại, trạng thái không hợp lệ, URL ngoài danh sách cho phép.

### 4.2 Evidence ledger

File `content/evidence.json`; mỗi mục gồm: `id`, tuyên bố được hỗ trợ, mức bằng chứng, mô tả, URL công khai nếu có, nơi lưu bản gốc (không public nếu nội bộ), ngày, phạm vi, ai cho phép công bố và khi nào.

| Mức | Ý nghĩa | Ví dụ |
|---|---|---|
| Verified | Người ngoài tự kiểm được qua link hoặc mã xác minh công khai | Chứng chỉ VTI có mã xác minh; repo GitHub công khai |
| Internal | Có bằng chứng nội bộ, đã che và được phép nhắc tới | Kết quả Partner Data Gateway sau khi được duyệt |
| Lab | Làm trong môi trường học tập hoặc tài khoản cá nhân | Pipeline chạy trên tài khoản AWS cá nhân |
| Estimate | Ước lượng của chủ dự án, ghi rõ cách tính | Thời gian deploy giảm, đo thủ công |

Trang case study hiển thị nhãn mức bằng chứng một cách kín đáo cạnh tuyên bố.

### 4.3 Quy tắc diễn đạt

- Phân biệt "đã làm", "đang làm", "đã học" và "muốn học". Không dùng phần trăm kỹ năng thiếu căn cứ.
- Chứng chỉ VTI: chỉ đưa thông tin phát hành/mã xác minh lên public khi đã đối chiếu; không tự tạo nội dung chứng chỉ.
- Mục tiêu Senior sau ba năm, lead sau năm năm ghi là định hướng tính từ một mốc xác định; không chuyển thành kinh nghiệm hoặc thành tựu.
- Dự án thiếu số liệu vẫn công khai được nếu mô tả đúng và bằng chứng đủ; ghi "chưa đo", không dùng số giả.
- Partner Data Gateway: chưa được phép công bố thì chỉ dùng mô tả đã ẩn danh và được duyệt; không tự dựng sơ đồ để giả làm bằng chứng hệ thống thật. Sơ đồ public vẽ lại bằng tên chung, không chụp màn hình console.
- AI, website và CV thống nhất vai trò, mốc thời gian và trạng thái dự án.

### 4.4 Liên hệ theo lớp

- **Hiện trên web:** email dùng riêng cho portfolio (ưu tiên địa chỉ trên tên miền cá nhân, ví dụ `hello@<domain>`, chuyển tiếp về hộp thư thật; đổi được khi bị spam), GitHub, LinkedIn.
- **Chỉ trong CV PDF:** số điện thoại, tránh bị thu thập tự động từ HTML — trừ khi chủ dự án chọn khác.
- **CV PDF:** sinh từ `content/` public, hai ngôn ngữ, tên file có ngày phiên bản, xóa metadata khi xuất.

### 4.5 Cấu trúc case study

Tóm tắt 30 giây (bài toán, phần Duy làm, bằng chứng chính) → Bối cảnh và vấn đề → Vai trò cá nhân → Ràng buộc → Kiến trúc → Quyết định và phương án đã cân nhắc → Triển khai → Kiểm thử → Kết quả có bằng chứng → Giới hạn và bài học ("Nếu làm lại") → Liên kết công khai.

Nội dung chưa đủ bằng chứng được gắn nhãn nháp trong môi trường phát triển, không lên production như "completed". Có thể phát hành với hai case study đủ chất lượng và trạng thái trung thực cho hai dự án còn lại.

### 4.6 Quét rò rỉ thông tin

CI quét `content/` và artifact build bằng gitleaks cùng luật riêng: AWS account ID 12 chữ số, chuỗi `arn:aws:`, subscription/tenant ID Azure, domain và IP nội bộ, tên khách hàng/đối tác trong danh sách cấm, email đồng nghiệp. Phát hiện → build fail.

### 4.7 SEO và chia sẻ link

Mỗi trang có title/description theo ngôn ngữ, canonical, `hreflang`, ảnh Open Graph sinh lúc build, JSON-LD `Person` và `ProfilePage`, sitemap. Quick Portfolio dùng HTML ngữ nghĩa (h1, article, nav). Ảnh xem trước quan trọng vì link thường được chia sẻ qua LinkedIn, Zalo, Slack.

---

## 5. Frontend, routes và static hosting

Next.js App Router + React + TypeScript, `output: 'export'`, `trailingSlash: true`; dựng trước locale và project slug bằng static params. Không dùng tính năng cần Next runtime (API routes, middleware, SSR, image optimizer mặc định, intercepting routes) [S1]. Chốt phiên bản tương thích khi tạo repo, commit lockfile.

| Route | Nội dung | Tải 3D |
|---|---|---|
| `/` | Trang vào tiếng Anh nhẹ, canonical về `/en/`, có link EN/VI, chạy được khi tắt JS; nếu `navigator.language` bắt đầu bằng `vi` thì hiện banner gợi ý, không tự chuyển trang | Không |
| `/en/`, `/vi/` | Welcome **và** shell thế giới; Enter World không điều hướng, chỉ lazy-load chunk 3D trong cùng document | Chỉ sau Enter World |
| `/en/quick/`, `/vi/quick/` | Quick Portfolio — đồng thời là bản mobile, fallback và trang SEO chính | Không |
| `/{locale}/projects/{slug}/` | Case study dựng sẵn, có URL chia sẻ | Không |
| `/{locale}/privacy/` | Dữ liệu gửi cho AI, logging, analytics, liên hệ | Không |
| `/cv/` | CV PDF hai ngôn ngữ, tên file có phiên bản | Không |
| `/404.html` | Trang lỗi có lối về portfolio | Không |
| `/sitemap.xml`, `/robots.txt` | Sinh lúc build | Không |

Locale dùng routes tường minh, không phụ thuộc middleware. Ảnh được tối ưu trước lúc build.

**Private S3:** dùng REST origin với OAC, không dùng public website endpoint. CloudFront Function (viewer-request) viết lại URI thư mục sang `index.html` (`/vi/projects/foo/` → `/vi/projects/foo/index.html`), giữ nguyên URI có phần mở rộng, chuẩn hóa URL thiếu slash bằng 301 [S2]. Kiểm tra truy cập trực tiếp và reload.

Không xử lý mọi 403/404 bằng cách trả trang chủ với HTTP 200. Custom error response map 403/404 từ S3 về `/404.html` với mã 404; khi không cấp `s3:ListBucket`, object không tồn tại trả 403. Phân biệt "object không tồn tại" với lỗi quyền origin qua kiểm thử và giám sát.

**Không tải 3D trước Enter World:** tách import khỏi layout/shared barrel; tránh preload GLB và prefetch vô tình. Nghiệm thu bằng network trace và bundle analysis, không chỉ nhìn thấy `lazy()` trong code. Ảnh bìa Welcome là tài nguyên 2D nhẹ.

---

## 6. Trạng thái ứng dụng, overlay và điều khiển

### 6.1 Các nhóm trạng thái

- `appMode`: welcome / loading / world / editorial / recoverableError.
- `worldPhase`: intro / active / ending.
- `locomotion`: onFoot / ridingManual / ridingCruise.
- `uiLayer`: none / content / journal / chat / settings / help.
- `pauseReasons`: tập lý do (overlay, hiddenTab, windowBlur, error); chỉ tiếp tục khi tập rỗng.
- `sessionProgress`: tập secret ID duy nhất, endingSeen, zone đã ghé, vị trí an toàn gần nhất; memory-only.
- `preferences`: locale, soundEnabled, volume, quality, reducedMotion, mascotEnabled; memory-only.

Lỗi hoặc hiddenTab chặn simulation; UI có focus nhận bàn phím trước gameplay; chỉ trạng thái active và không pause mới nhận movement. State transition viết dạng reducer có kiểu (store ví dụ Zustand), unit test được mà không cần WebGL.

### 6.2 Quy tắc bắt buộc

1. Mở overlay: dừng locomotion, cruise và camera input; xóa tập phím đang giữ; đưa focus vào tiêu đề. Esc/X đóng, focus trở về phần tử đã mở. Tab không thoát modal [S3].
2. Khi chat/input có focus, W/A/S/D/E chỉ nhập chữ. Không dùng global handler nuốt phím gõ.
3. Blur/hiddenTab: pause, mute/suspend âm thanh; quay lại xóa vận tốc/phím cũ, giới hạn bước physics bù; có nút Continue khi cần.
4. Cinematic Skip và kết thúc tự nhiên đưa về cùng trạng thái hợp lệ; không tạo animation loop/audio trùng.
5. Interaction chọn một mục tiêu gần nhất trong phạm vi hợp lệ, có đường nhìn khi cần; click xa không mở nội dung. E không vừa mở bảng vừa lên xe.
6. Nhân vật rơi khỏi thế giới hoặc bị kẹt: "Return to path" về vị trí an toàn gần nhất, không xóa secret.
7. Chuyển quality không reset tiến trình; GPU/context loss có đường thoát sang HTML. Không hứa khôi phục renderer nếu chưa kiểm thử.
8. Đọc phím theo vị trí vật lý (`KeyboardEvent.code`) để WASD đúng trên mọi layout bàn phím.

### 6.3 Overlay, ngôn ngữ và URL

- Trang dự án độc lập và overlay tái sử dụng một renderer nội dung. Trong thế giới, overlay do app state điều khiển, không dùng Intercepting Routes [S1].
- Nút "Copy project link" sao chép URL case study độc lập; mở URL đó trực tiếp luôn vào HTML. Nút "Đọc bản đầy đủ" mở tab mới.
- **Đổi ngôn ngữ trong thế giới:** thay từ điển và nội dung overlay tại chỗ, cập nhật URL `/en/` ↔ `/vi/` bằng `history.replaceState`, không remount Canvas, không mất vị trí hay secret.
- Overlay có thể dùng `history.pushState` trong cùng document để nút Back đóng overlay; phải có test. Điều hướng hẳn khỏi document hoặc reload thì lượt chơi kết thúc; không hứa giữ trạng thái qua đó. Khi document quay lại từ back-forward cache (`pageshow` với `persisted`), reset session.
- Quick Portfolio mở từ thế giới có thể là panel HTML trong cùng shell; nội dung và tên gọi thống nhất với route Quick độc lập.

### 6.4 Điều khiển

| Hành động | Bàn phím | Chuột | Touchpad |
|---|---|---|---|
| Di chuyển / chạy | WASD / giữ Shift | — | — |
| Xoay camera | ← → | Kéo trên vùng trống (không pointer lock) | Vuốt hai ngón ngang |
| Zoom | + / − | Cuộn | Chụm/mở hai ngón |
| Tương tác, lên/xuống xe | E | Click vật thể trong phạm vi | Chạm vật thể |
| Bật/tắt Auto Cruise | C | — | — |
| Atlas Journal | J | Biểu tượng góc | Biểu tượng góc |
| Đóng lớp UI / mở menu | Esc (đóng UI trước; không có UI thì mở menu; luôn hủy cruise) | Nút X | Nút X |

Menu gồm: chất lượng, âm thanh, giảm chuyển động, ngôn ngữ, mascot, bảng phím, "Mở Quick Portfolio". Gợi ý phím hiện 10 giây đầu rồi tự ẩn.

---

## 7. Thế giới, art pipeline và xe

### 7.1 Nhịp bản đồ và bố cục

5–7 phút đo theo tuyến chính, tốc độ đi bộ chuẩn, không sprint, không dừng đọc, không cinematic, không tìm secret. Quãng đường tính từ tốc độ và thời gian, chỉnh bằng playtest; không suy ra full map từ prototype 60×60 m.

Cả 8 khu bám trục suối. Mục tiêu thiết kế: The Workshop ≤ 45–60 giây từ spawn; The Roots và The Milestones ≤ 90 giây; The Horizon và The Quiet Shore cuối hành trình; The Last Postcard ở bờ biển nhưng luôn mở được qua Atlas Journal.

Chia cảnh thành các vùng tải theo khoảng cách nhưng vẫn là một thế giới liền mạch; tải vùng kế tiếp trước khi đến, có fallback khi tải chậm. Low quality không thay collider hoặc vị trí tương tác.

Ánh sáng bình minh → hoàng hôn chuyển theo vị trí trong thế giới, không theo đồng hồ thực. Fog, màu ánh sáng và bầu trời thống nhất; có vùng chuyển tiếp tránh đổi màu đột ngột khi quay đầu.

### 7.2 Atlas Journal và biển chỉ đường dịch chuyển

- **Atlas Journal:** sổ tay vẽ tay, mở bằng J hoặc biểu tượng nhỏ. Liệt kê 8 khu, mỗi khu một dòng; bấm vào mở thẳng overlay nội dung. Khu đã ghé có dấu mộc. Không bản đồ, không vị trí — không phải minimap. Secrets không xuất hiện; sau secret đầu tiên, cuối sổ hiện các trang trắng như gợi ý.
- **Biển chỉ đường dịch chuyển:** tại một bảng, người xem chọn khu đích; sương chuyển cảnh, nhân vật xuất hiện cạnh bảng của khu đó. Chỉ khu có bảng mới dịch chuyển được; secrets vẫn phải tự tìm. Reduced motion dùng fade ngắn.

### 7.3 Art bible và asset

Chốt palette bằng mã màu, tỷ lệ nhân vật/cây/công trình, độ nhám, mức cách điệu, độ tương phản chữ (AA), cường độ fog, quy tắc ánh sáng. Duyệt một cảnh chuẩn ở bốn hướng trước khi sản xuất hàng loạt.

**Font:** chỉ chọn font có đủ glyph tiếng Việt (khối Latin Extended Additional); nhiều font display/retro thiếu dấu. Self-host woff2, subset, `font-display: swap`.

**Inventory asset** (`assets/LICENSES.csv`): người tạo/nguồn, license, quyền sửa, quyền phân phối trên web, attribution, bằng chứng quyền dùng, texture size, material count, LOD, collider. Asset thương mại được phép dùng trong trải nghiệm chưa chắc được phép đưa file nguồn vào repo public — kiểm tra riêng hai phạm vi. CI fail nếu file asset public không có dòng tương ứng.

**Pipeline:** Blender → glTF → `gltf-transform` (meshopt, texture KTX2/Basis, prune, dedup), mỗi asset có ngân sách tam giác và dung lượng. Instancing, tái sử dụng geometry/material, LOD, tải phân tầng [S4] — không thay thế đo trên máy thật.

### 7.4 Kỹ thuật render và mức chất lượng

- Camera spring arm: raycast từ nhân vật tới camera, rút ngắn khi chạm địa hình (bỏ qua lớp tán lá).
- Tán lá che nhân vật: làm mờ dần (dither) phần tán cây giữa camera và nhân vật thay vì kéo camera vào.
- Terrain: collider heightfield sinh từ cùng heightmap với mesh hiển thị.

Giá trị khởi điểm, điều chỉnh theo đo đạc:

| Thông số | Low | Balanced | High |
|---|---|---|---|
| Giới hạn DPR | 1.0 | 1.25 | tối đa 2.0 |
| Shadow | Tắt, dùng AO nướng sẵn | 1024 px quanh nhân vật | 2048 px |
| Mật độ cây/cỏ | 40% | 70% | 100% |
| Hậu kỳ | Tắt | Fog + tone mapping | Đầy đủ |
| Nước | Shader đơn giản | Phản chiếu giả | Đầy đủ |

Adaptive quality có khoảng chờ và hysteresis; ưu tiên giảm tự động, chỉ nâng theo lựa chọn người xem.

### 7.5 Xe và secrets

GD110 dùng điều khiển arcade có giới hạn, không mô phỏng cơ học thật. Xe chạy trong hành lang đường hợp lệ (spline); manual và cruise cùng hệ collider. E xuống xe chỉ khi có chỗ đứng an toàn; cruise chậm/dừng trước vật cản. Esc, phím C, mở UI hoặc mất focus đều hủy cruise ngay.

Ba secret đầu dùng Set ID, không đếm số lần click. Secret thứ tư trước khi đủ ba chỉ có phản hồi ẩn dụ nhẹ; đủ ba mới mở ending. Ending có Skip, chỉ đánh dấu hoàn thành ở transition hợp lệ; mở lặp không tạo nhiều instance. Khung hình cuối dẫn nhẹ sang The Last Postcard. Không gửi trạng thái secret cho AI hay backend.

---

## 8. Ngân sách hiệu năng và phương pháp đo

Các ngưỡng dưới đây là baseline để triển khai và nghiệm thu. Có thể sửa bằng quyết định ghi rõ **trước** benchmark. Sau khi đo thất bại, không nâng ngưỡng để biến FAIL thành PASS.

| Hạng mục | Mục tiêu | Cách kiểm tra |
|---|---|---|
| Welcome/Quick initial transfer | ≤ 1 MB nén, trong đó JS ≤ 150 KB gzip; không tính CV | Cold-cache trace gồm HTML/CSS/JS/font/ảnh đầu trang |
| 3D trước Enter World | 0 request GLB, texture game, physics WASM, game chunk | Network trace |
| Tài nguyên 3D để bắt đầu chơi | ≤ 8 MB nén, gồm runtime/decoder/asset cần thiết | Trace từ Enter World đến player controllable |
| Toàn bộ thế giới (B) | ≤ 30 MB nén cho một lượt đi hết tuyến chính | Trace streaming theo vùng |
| Time to playable | ≤ 10 s trên máy tham chiếu, mạng 10 Mbps/RTT 100 ms | Ba lần cold load; gate theo kết quả xấu nhất |
| Low quality | FPS trung bình ≥ 30; p95 frame time ≤ 50 ms; ≤ 1% frame > 100 ms | Warm-up 30 s, tuyến cố định 60 s, ba lần; đánh giá từng lần |
| Giật nặng | Không frame > 250 ms trong đoạn đo ổn định | Ghi frame times; đo hitch streaming riêng |
| Stability | 10 phút di chuyển; 20 vòng mở/đóng nội dung; không crash/stuck | Log renderer, geometry/texture count, heap |
| Quick web UX | LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 | Lab trước launch; field p75 khi đủ mẫu, báo riêng [S5] |

Máy benchmark ghi CPU, GPU, RAM, OS, browser/version, nguồn điện (cắm sạc, tắt tiết kiệm pin), viewport, DPR và quality. Chưa có máy tham chiếu thì T08 là BLOCKED, không phải PASS.

Không gộp JS heap với GPU memory thành một số "RAM". Sau warm-up theo dõi resource count và xu hướng; tăng liên tục thì điều tra cache/listener/texture/geometry chưa giải phóng.

Thứ tự tối ưu: bỏ request không cần → giảm texture/material/draw call → đơn giản shadow/nước/foliage → giới hạn DPR → LOD/streaming → profile CPU/physics.

---

## 9. Accessibility và âm thanh

Mục tiêu lớp HTML: WCAG 2.2 AA, phải kiểm tra thực tế trước khi tuyên bố. Bản game có thể không truy cập đầy đủ bằng mọi công nghệ hỗ trợ; nội dung nghề nghiệp luôn có đường HTML tương đương.

- Heading có cấu trúc, focus nhìn rõ, link/nút có tên; không dùng màu làm tín hiệu duy nhất; kiểm tra contrast, zoom 200%, reflow, screen reader cơ bản; axe-core 0 lỗi critical/serious.
- Nội dung tạp chí có độ rộng dòng đọc hợp lý; mobile dùng trang cuộn bình thường.
- `prefers-reduced-motion`: mặc định bỏ cinematic fly-through, giảm motion nền/sương, chuyển cảnh bằng fade ngắn; không ép đi bộ để đọc nội dung.
- Thông tin truyền bằng audio có văn bản tương đương; secret âm thanh dùng được khi mute.
- Sound mặc định Off; `AudioContext` chỉ tạo sau khi bật; mute luôn dễ tìm; âm lượng có nhãn; ambient/music tách kênh, chuyển vùng mềm.
- Mascot chỉ gợi ý khi phù hợp, không lặp dồn dập, không cướp focus. Tắt mascot vẫn mở được chat bằng nút độc lập.
- Overlay có `aria-live` cho gợi ý tương tác; focus trap theo [S3].

---

## 10. AI: trợ lý portfolio có nguồn và giới hạn chi phí

### 10.1 Luồng

Nhận câu hỏi → validate kích thước/ngôn ngữ → kiểm tra quota → chọn nội dung public liên quan → tạo context có ID nguồn → gọi model → validate cấu trúc/nguồn/liên kết → trả lời hoặc FAQ fallback.

Whitelist áp dụng **trước khi gọi model**. Dữ liệu chỉ vài chục KB nên bắt đầu bằng tập JSON/Markdown nhỏ và tìm kiếm đơn giản (hoặc đưa toàn bộ knowledge vào prompt); chỉ thêm embeddings/vector database khi phép thử retrieval chứng minh cần.

`knowledge.json` sinh trong CI từ tập public, đóng gói cùng Lambda — không có datastore nội dung lúc chạy.

Output nội bộ: `answer`, `sourceIds`, `contentVersion`, `mode`. Backend ánh xạ source ID sang URL đã duyệt; không tin URL do model tạo. UI hiển thị nguồn và nhãn "Trợ lý AI".

Validator phát hiện ID/format sai nhưng không chứng minh câu trả lời đúng ngữ nghĩa; cần tập câu hỏi và đọc mẫu thực tế.

### 10.2 Ranh giới

- Không duyệt web, không mở URL người xem đưa, không đọc tài liệu nội bộ, không chạy lệnh, không gửi liên hệ thay người dùng; assistant không có tool action.
- Nội dung truy hồi và câu hỏi là dữ liệu, không phải chỉ dẫn hệ thống. RAG/whitelist không tự loại bỏ prompt injection [S6].
- Thiếu thông tin thì nói chưa có dữ liệu và gợi ý email; hỏi lại khi câu hỏi mơ hồ; không đoán chứng chỉ, lương, công ty hay thành tích.
- Không gọi mục tiêu tương lai là kinh nghiệm; không nói thay Duy về lịch hẹn hay cam kết tuyển dụng.
- Giới hạn history và context ở backend; API key không bao giờ nằm ở client; lưu key trong SSM Parameter Store (SecureString, tier Standard) thay vì Secrets Manager để tránh phí theo secret.
- Output hiển thị qua renderer an toàn; không thực thi raw HTML hoặc link có scheme ngoài danh sách cho phép.

### 10.3 Quota, ngân sách và credits

Giới hạn client chỉ hỗ trợ UX. Rate limit IP/session giảm spam nhưng không nhận diện chắc người dùng ẩn danh; không phạt quá mức người dùng chung mạng.

**Vấn đề credits:** credits AWS chỉ áp cho dịch vụ AWS đủ điều kiện. Phí gọi model bên thứ ba trên Amazon Bedrock có thể được tính qua AWS Marketplace và không được trừ vào credits (theo trao đổi cộng đồng trên re:Post, chưa phải tài liệu chính thức) [S13]. Trước khi chọn model phải kiểm tra trang **Credits** trong Billing console xem dịch vụ/model nào được áp credits. Phương án:

| Phương án | Ưu điểm | Lưu ý |
|---|---|---|
| Model first-party của Amazon trên Bedrock | Có khả năng được trừ vào credits, dùng IAM role, không cần API key bên ngoài | Xác minh trên trang Credits; đánh giá chất lượng tiếng Việt bằng golden set |
| Model bên thứ ba trên Bedrock | Chất lượng có thể tốt hơn | Có thể tính qua Marketplace, trả bằng thẻ |
| Provider bên ngoài AWS | Linh hoạt | Không dùng credits; cần API key và hard limit phía provider |

Chọn provider sau khi xác minh: cách tính phí, giới hạn token, timeout, hard quota, chính sách lưu/dùng dữ liệu, độ trễ từ Singapore, chất lượng tiếng Việt. Ghi ADR.

**Bộ đếm ngân sách:** nếu không có hard cap đáng tin cậy, dùng bộ đếm nguyên tử ở backend (DynamoDB, conditional write). Trước mỗi lời gọi, reserve chi phí tối đa theo input thực và max output của model đã khóa; request song song không được cùng tiêu phần ngân sách còn lại. Ghi reservation theo request ID, reconcile khi có usage; usage chưa rõ thì giữ reserve bảo thủ. Timeout phía client không có nghĩa provider ngừng tính phí. Bộ đếm lỗi → fail-closed sang FAQ. Không retry mù; retry tính vào ngân sách.

API Gateway throttling/usage plan là best effort, không phải hard cost cap; AWS Budgets là cảnh báo, không dừng chi tiêu đúng một con số [S7]. Không hứa hard cap toàn tài khoản AWS. Có kill switch tắt model độc lập: SNS từ Budgets kích hoạt một Lambda nhỏ đặt reserved concurrency của Lambda AI về 0; FAQ và portfolio vẫn chạy.

### 10.4 Cấu hình giới hạn ban đầu (dùng cho mock và test)

Câu hỏi tối đa 1.000 ký tự; một request đang chạy trên mỗi widget; tối đa 6 lượt gần nhất trong context; tối đa 10 câu hỏi/phiên (memory); max output khoảng 500 token; timeout giao diện 15 giây. Backend giới hạn lại theo tokenizer, payload và model thực tế.

Ngân sách model đề xuất (chủ dự án xác nhận ở §17): **≤ 5 USD/tháng**, trần ngày tương ứng trong bộ đếm. Khi chưa có ngân sách và cơ chế quota được xác nhận, AI giữ trạng thái disabled, FAQ hoạt động. FAQ trả lời được câu hỏi cơ bản về vai trò, dự án, kỹ năng, liên hệ bằng dữ liệu đã duyệt, chạy hoàn toàn trên client.

### 10.5 Bộ đánh giá trước khi bật AI public

Ít nhất 40 câu hỏi có đáp án kỳ vọng: 20 câu thực tế EN/VI về hồ sơ/dự án, 8 câu thiếu dữ liệu (ví dụ hỏi về chứng chỉ chưa có — đáp đúng là "chưa có"), 4 câu mơ hồ, 8 câu injection/ép bịa. Kiểm tra riêng lỗi provider, timeout, quota và tải đồng thời.

Gate: không có khẳng định sai quan trọng; mọi câu có tuyên bố thực tế dẫn nguồn public hỗ trợ đúng; từ chối/thiếu dữ liệu không bắt buộc nguồn; không phát sinh tool action; mọi nhánh lỗi có fallback. Chạy lại khi đổi model, prompt hoặc knowledge package; trong CI chỉ gọi model thật trên nhánh main để tiết kiệm. PASS chỉ có giá trị với tập và phiên bản đã đo.

### 10.6 Log và quyền riêng tư AI

Mặc định không log nội dung câu hỏi; chỉ log metadata (độ dài, độ trễ, token, mã lỗi), retention CloudWatch Logs 14 ngày. Không session replay, không fingerprinting, không transcript database. Nếu muốn dùng câu hỏi thật để cải thiện FAQ: thông báo rõ trong khung chat, ẩn danh, xóa sau 30 ngày — chỉ khi chủ dự án chọn.

---

## 11. AWS, tên miền, bảo mật, chi phí và rollback

Giữ S3 private + CloudFront OAC + HTTPS. Không EC2/EKS/ECS/RDS/NAT. Endpoint AI chỉ triển khai ở C1; không dùng API routes của Next.

### 11.1 Tài khoản AWS và 200 USD credits

Dữ kiện đã kiểm tra ngày 03/11/2026 [S10][S11]:

- Free account plan hết hạn sau **6 tháng kể từ ngày đăng ký hoặc khi hết credits**, tùy điều kiện nào đến trước; khi đó tài khoản bị đóng, dữ liệu giữ 90 ngày để nâng cấp và khôi phục.
- Nâng lên Paid plan bất cứ lúc nào; credits chưa dùng vẫn áp cho dịch vụ đủ điều kiện **tới 12 tháng kể từ ngày đăng ký**. Sau đó, hoặc khi credits hết, phí tính vào thẻ theo giá pay-as-you-go.
- Free account plan chỉ truy cập một nhóm dịch vụ (ví dụ không có Lambda@Edge) và **không dùng được CloudFront flat-rate plans** [S8][S9].

**Quyết định V6:**

1. Phát triển và kiểm thử local trước; chưa cần tài nguyên cloud cho A0/A1/B1.
2. Trước A2: tạo AWS Budgets và cảnh báo, rồi **nâng tài khoản lên Paid plan** — bắt buộc để (a) site không bị đóng ở tháng thứ 6, (b) dùng CloudFront flat-rate Free plan. Việc nâng cấp do chủ dự án tự thực hiện.
3. Ghi ngày đăng ký tài khoản và ngày hết hạn credits (xem trong Billing → Credits) vào `PROJECT_STATUS`. Đặt nhắc việc 30 ngày trước hai mốc 6 tháng và 12 tháng.
4. Bật IAM Identity Center hoặc ít nhất MFA cho root; không dùng root cho công việc hằng ngày; không tạo access key dài hạn.

### 11.2 CloudFront flat-rate Free plan — cấu hình theo giới hạn thật

Gói Free: 0 USD/tháng, 1 triệu request và 100 GB/tháng, không tính phí vượt (vượt kéo dài nhiều tháng có thể bị điều chỉnh chất lượng phân phối), tối đa 3 Free plan mỗi tài khoản, 1 apex domain mỗi plan, bắt buộc có WAF web ACL gắn với distribution [S9].

| Tính năng | Free plan | Thiết kế V6 |
|---|---|---|
| Cache policy | Chỉ managed | `CachingOptimized` cho site; `CachingDisabled` cho `/api/*`. Thời gian cache điều khiển bằng header `Cache-Control` đặt lên object S3 khi upload |
| Response headers policy | Chỉ managed | Managed `SecurityHeadersPolicy` (HSTS, nosniff, chống framing, Referrer-Policy); header bổ sung (Permissions-Policy, CSP `frame-ancestors`) thêm bằng CloudFront Function viewer-response |
| Origin request policy | Chỉ managed | Managed policy phù hợp cho Lambda Function URL ở C1 |
| Cache behaviors | Tối đa 5 | Dùng 2: mặc định (S3) và `/api/*` (Lambda) |
| CloudFront Functions | Có | viewer-request: rewrite `index.html`, 301 thêm slash, redirect `www` → apex; viewer-response: header bổ sung. KeyValueStore không có ở Free |
| WAF | 5 luật, có IP rate limiting, chặn theo quốc gia | Luật 1: rate limit toàn site theo IP. Luật 2 (C1): rate limit chặt hơn cho `/api/*` nếu gói cho phép scope-down theo đường dẫn — kiểm tra trong console. Chừa luật trống cho sự cố |
| Access logs | Không có ở Free (từ Pro) | Không dùng CloudFront logs cho analytics (§11.7) |
| Route 53 DNS | Có; hosted zone gắn plan được miễn phí, tối đa 50 record | Gắn hosted zone của tên miền vào plan; dùng ALIAS cho apex và `www` |
| S3 | 5 GB credit S3 Standard | Đủ cho site; bật versioning nhưng giới hạn retention |
| TLS | Chứng chỉ ACM miễn phí | ACM ở us-east-1, DNS validation, gồm apex và `www` |

**CSP:** Next.js chèn inline script nên CSP script không thể là chuỗi cố định nếu không dùng `'unsafe-inline'`. Script hậu build tính SHA-256 của inline script từng trang và chèn `<meta http-equiv="Content-Security-Policy">`; `frame-ancestors` (không đặt được qua meta) nằm trong header do CloudFront Function thêm. Hai policy cùng có hiệu lực. Nếu dùng physics WASM, CSP cần `'wasm-unsafe-eval'`. Kiểm thử CSP với worker/decoder/font thực tế; không bật CSP làm vỡ trang rồi bỏ kiểm tra.

**Phương án dự phòng:** nếu một yêu cầu bắt buộc không làm được trên Free plan, so sánh pay-as-you-go (bậc always-free của CloudFront vẫn áp dụng) bằng ADR; không tự mua gói Pro.

**Tùy chọn staging:** Free plan thứ hai cho distribution `staging.<domain>`, gắn `X-Robots-Tag: noindex` bằng CloudFront Function, nội dung chỉ từ nhánh main trước khi promote.

### 11.3 Tên miền, DNS và email

Chủ dự án tự mua tên miền. Credits AWS không trả được phí đăng ký tên miền qua Route 53 [S12], nên chọn registrar theo tiêu chí:

- **Giá gia hạn**, không chỉ giá năm đầu; có WHOIS privacy; hỗ trợ đổi nameserver và DNSSEC.
- Một số registrar bắt buộc dùng DNS của chính họ — tránh, vì V6 cần đặt nameserver về Route 53 hosted zone để gắn vào CloudFront plan.
- TLD: `.com` dễ nhận biết nhất; `.dev` và `.app` bắt buộc HTTPS (HSTS preload) — phù hợp với CloudFront; `.vn` cần đăng ký qua nhà đăng ký trong nước và hồ sơ cá nhân. Ưu tiên tên ngắn, dễ đọc qua điện thoại (ví dụ dạng `baoduy.<tld>` hoặc `nguyenhuubaoduy.<tld>` — chủ dự án chọn).

Thiết lập sau khi mua (do chủ dự án thực hiện hoặc giao cho AI qua Terraform khi được phép):

1. Tạo Route 53 public hosted zone; đặt 4 nameserver ở registrar; gắn hosted zone vào Free plan của distribution.
2. ACM certificate (us-east-1) cho `<domain>` và `www.<domain>`, xác thực bằng DNS.
3. ALIAS A/AAAA cho apex và `www` trỏ về CloudFront; CloudFront Function redirect `www` → apex bằng 301.
4. Record CAA chỉ cho phép Amazon cấp chứng chỉ.
5. Email: dùng tính năng chuyển tiếp email của registrar (nếu có) hoặc dịch vụ email riêng cho `hello@<domain>`; khai báo SPF, DMARC (`p=none` lúc đầu). Không dựng mail server trên AWS.
6. HSTS: dùng giá trị của managed policy; **chưa** đăng ký HSTS preload cho tới khi site ổn định nhiều tuần.
7. Trước khi có tên miền, site chạy trên địa chỉ `*.cloudfront.net`; canonical/sitemap sinh từ biến `SITE_URL` để đổi tên miền không phải sửa code.

### 11.4 Mô hình chi phí với 200 USD credits

Ước lượng lưu lượng: transfer = lượt Quick × ~1 MB + lượt World × MB tải thực tế (≤ 30 MB) + CV. Ví dụ minh họa: 100 GB/tháng của Free plan ≈ 3.300 lượt đi hết thế giới — dư cho một portfolio. Cache CDN giảm tải origin, không xóa dữ liệu đến người xem.

| Hạng mục | Ước tính/tháng | Ghi chú |
|---|---|---|
| CloudFront + WAF + Route 53 hosted zone (gắn plan) | 0 USD | Free plan, cần Paid account |
| S3 lưu trữ | ~0 USD | Nằm trong 5 GB credit của plan |
| S3 request (deploy), CloudFront Functions | vài cent | |
| Lambda, DynamoDB (provisioned nhỏ), CloudWatch alarm cơ bản, SNS email | ~0 USD | Kỳ vọng nằm trong bậc always-free; xác minh khi tạo |
| SSM Parameter Store Standard | 0 USD | Thay cho Secrets Manager |
| CloudWatch Logs (Lambda) | vài cent | Retention 14 ngày |
| KMS customer-managed key | Tránh | Dùng SSE-S3 |
| Model AI (C1) | ≤ 5 USD (đề xuất) | Có thể không được trừ vào credits (§10.3) |
| Tên miền | Ngoài AWS | Trả theo năm cho registrar |

**Phân bổ 200 USD đề xuất** (chủ dự án xác nhận):

| Khoản | Mức | Mục đích |
|---|---|---|
| Vận hành nền 12 tháng | 20 USD | Phần phát sinh nhỏ của S3, logs, request |
| Model AI | 60 USD | ≈ 5 USD/tháng nếu model được trừ vào credits |
| Thử nghiệm và học | 50 USD | Sandbox, thử dịch vụ, sửa sai |
| Dự phòng | 70 USD | Không phân bổ trước |

**Sau khi credits hết hạn:** mục tiêu chi phí nền ≤ 1 USD/tháng (không tính tên miền và AI). Nếu không đạt, AI chuyển về FAQ-only trước khi cắt bất cứ thứ gì khác.

**Thứ tự bắt buộc trước khi tạo resource đầu tiên:** AWS Budgets (ngưỡng thực tế nhỏ, ví dụ 1, 5, 10 USD, cảnh báo actual và forecast) tính **chi phí trước credits** để thấy mức tiêu thật; Cost Anomaly Detection; Free Tier usage alerts; SNS email. Kiểm tra lại giá và điều kiện ngay trước khi deploy; không khóa giá hiện tại thành sự thật lâu dài.

### 11.5 Hạ tầng như mã

- **Bootstrap** (chạy tay một lần): bucket state (versioning, SSE-S3, chặn public), OIDC provider của GitHub, các IAM role. Backend S3 dùng `use_lockfile = true` (Terraform ≥ 1.10), không cần bảng DynamoDB để khóa [S14].
- **Module:** `static-site` (S3, CloudFront, functions, OAC, WAF, plan), `dns` (hosted zone, ACM, records), `ai-endpoint` (C1), `monitoring` (budgets, SNS, alarms, kill switch), `github-oidc`.
- Subscription vào flat-rate plan có thể chưa được Terraform provider hỗ trợ đầy đủ — nếu vậy, làm thủ công trong console và ghi vào runbook.
- Region: S3, Lambda, DynamoDB ở ap-southeast-1; ACM cho CloudFront ở us-east-1.
- Terraform state tách khỏi repo public; không commit `*.tfstate`, `*.tfvars` chứa giá trị riêng.

### 11.6 CI/CD và bảo mật triển khai

- GitHub Actions dùng OIDC; trust policy giới hạn `repo:<owner>/<repo>:environment:production`. Ba role: `tf-plan` (chỉ đọc, cho PR), `tf-apply` (main, duyệt tay qua GitHub Environment), `site-deploy` (ghi/xóa đúng bucket và `CreateInvalidation` đúng distribution). Workflow từ PR không tin cậy không nhận quyền production.
- Pipeline PR: cài dependency có cache → lint/typecheck → unit test (state, input, secrets, schema) → kiểm nội dung (schema, EN/VI, evidence) → quét secret/rò rỉ (§4.6) → kiểm giấy phép asset → build → kiểm route/bundle/ngân sách tải → Playwright e2e (Welcome, Quick, fallback, overlay) → Lighthouse CI → nếu `infra/` đổi: `fmt`, `validate`, `tflint`, quét cấu hình (Checkov hoặc Trivy), `plan` đăng vào PR.
- Pipeline main: build artifact → upload asset có hash trước, HTML sau → invalidate HTML → smoke test → ghi `build-info.json`, commit SHA, `contentVersion`.
- Chỉ upload artifact public, không đồng bộ cả thư mục làm việc.
- Cache: file có hash → `Cache-Control: public, max-age=31536000, immutable`; HTML, `build-info.json`, `sitemap.xml` → `max-age=0, must-revalidate`. Mỗi lần deploy chỉ invalidate HTML.
- **Không xóa asset cũ ngay** (không `sync --delete` cho thư mục asset): người đang ở trong thế giới có thể lazy-load chunk của bản trước. Dọn asset cũ bằng job định kỳ sau 7 ngày.
- **Rollback:** deploy lại artifact release trước (giữ trong GitHub Actions); S3 versioning làm lớp dự phòng. Diễn tập, ghi thời gian thực tế, xác minh route/CV/asset.

### 11.7 Giám sát, analytics và dữ liệu

- CloudWatch alarm: tỷ lệ 5xx CloudFront, lỗi/throttle Lambda, số request AI mỗi ngày.
- Kiểm tra sống bằng GitHub Actions theo lịch: tải `/en/quick/`, kiểm mã 200, nội dung chính và security headers. Miễn phí, không cần Route 53 health check.
- **Analytics:** Free plan không có access logs. Bản A ra mắt không có analytics. Nếu cần sau đó: endpoint `/api/event` dùng chung Lambda/behavior với AI, chỉ tăng bộ đếm tổng hợp theo ngày trong DynamoDB cho vài sự kiện (mở project, bấm CV, lỗi tải game, AI fallback); không lưu IP, không cookie, không định danh, không gắn câu hỏi chat hay secret. Cập nhật trang privacy trước khi bật.
- Nêu rõ trong trang privacy dữ liệu nào được nhà cung cấp AI, CDN hoặc backend xử lý; retention ngắn có lý do.

---

## 12. Lộ trình phát triển và điều kiện chuyển giai đoạn

Hai track. **Track A — Portfolio & Platform** luôn ưu tiên. **Track B — World** không bao giờ vượt Track A: B2 chỉ bắt đầu khi A2 đã live; B3 chỉ bắt đầu khi A3 xong. Timebox giả định làm bán thời gian khoảng 15–20 giờ/tuần; chủ dự án điều chỉnh theo thực tế.

| Mốc | Bàn giao | Gate | Timebox |
|---|---|---|---|
| A0 — Nội dung và hợp đồng | Public schema, trạng thái 4 dự án, UX flow, máy benchmark, ADR ban đầu, quyết định §17 nhóm "Trước A1" | Không giả định thành tích/quyền công bố; phần thiếu được đánh dấu | 1 tuần |
| A1 — Portfolio dùng độc lập | Welcome, Quick EN/VI, ≥ 2 case study đã duyệt, CV, liên hệ, SEO, privacy | HTML/keyboard/mobile hoạt động, link đúng, chưa tải game, Q18 | 3 tuần |
| B1 — Playable Forest | P01-A → P01-F (§16) | T01–T11 + Q13–Q15, Q18, Q21; chưa đạt không mở rộng world | 4 tuần, song song A1 |
| A2 — Phát hành portfolio | Paid account, Terraform, S3/CloudFront Free plan, WAF, OIDC deploy, budgets, alarms, tên miền + TLS, rollback | Q12, Q20, Q23–Q26; **từ đây có link gửi nhà tuyển dụng** | 2 tuần |
| A3 — Nội dung đầy đủ | 4 case study trung thực, Making-of (nếu đủ dữ liệu thật) | Evidence ledger, quyền công bố, Q17 | 3 tuần |
| B2 — Art và full world | Art bible, cảnh chuẩn, asset hợp lệ, 8 khu, streaming, Atlas Journal, biển dịch chuyển | Performance máy thật, hành trình 5–7 phút, không lạc bất hợp lý | 4 + 6–8 tuần |
| B3 — Xe, mascot, story | Manual/cruise, 4 secrets, intro/ending, audio | Q14, Q16, collision/skip/reduced motion | 4–6 tuần |
| C1 — AI thật | Knowledge package, endpoint, quota, nguồn, FAQ, kill switch | §10.5, Q19 | 2–3 tuần |
| B4 — Phát hành trải nghiệm | QA đa trình duyệt, người thử, runbook, kiểm tra liên kết; bật Enter World trên site đang chạy | Không lỗi chặn; có đường về HTML; Q22 | 2 tuần |

A2 chỉ yêu cầu gate của phần portfolio; game chưa đạt không chặn mốc tuyển dụng. Khi public bản 3D thì B1–B3 bắt buộc đạt. AI không chặn B4.

**Tiêu chí dừng hoặc chuyển hướng:**

- B1 vượt timebox 50% mà T08 chưa đạt → cắt phạm vi kỹ thuật (bỏ shadow realtime, giảm diện tích, giảm foliage); vẫn không đạt → thế giới nhỏ hơn hoặc camera bán cố định. Ghi ADR, không âm thầm nâng ngưỡng.
- B2 không đạt nhất quán hình ảnh với asset có giấy phép trong timebox → đơn giản hóa phong cách (low-poly painterly) hoặc đặt làm asset.
- Tháng thứ 5 kể từ ngày đăng ký AWS mà chưa sẵn sàng A2 → vẫn nâng Paid plan đúng hạn để không mất tài khoản (tài khoản chưa có resource thì chi phí bằng 0).
- Dừng Track B bất cứ lúc nào, site Track A vẫn là sản phẩm hoàn chỉnh.

Feature flags nội bộ cho world, vehicle, story, AI giúp phát hành từng phần. Flag tắt UI không bảo vệ dữ liệu mật hoặc API; backend vẫn enforce quyền/quota và public build không chứa dữ liệu nháp.

---

## 13. Ma trận nghiệm thu và bằng chứng

Chỉ áp dụng test của tính năng đã nằm trong milestone; test ngoài phạm vi ghi "chưa tới giai đoạn", không tính là PASS.

Mỗi kết quả ghi: test ID, version/commit, môi trường (máy, trình duyệt, quality, mạng), bước chạy, expected/actual, status, đường dẫn bằng chứng (`docs/evidence/<milestone>/<test-id>/`), issue liên quan. Trạng thái: **PASS / FAIL / NOT RUN / BLOCKED / DEFERRED**.

### 13.1 Kiểm thử nền tảng

| ID | Kiểm thử | Điều kiện PASS | Bằng chứng |
|---|---|---|---|
| T01 | Welcome | Enter World, Quick Portfolio, Sound, tên, vai trò, link CV; 0 lỗi console | Playwright |
| T02 | HTML độc lập | Đọc được khi tắt WebGL và khi tắt JS; không request chunk 3D | Playwright + network |
| T03 | Movement | WASD đúng hướng camera ở 4 góc; dừng ≤ 100 ms sau blur; không stuck key | Unit test + video |
| T04 | Collision | 0 lần xuyên trong kịch bản 5 phút (20 thân cây, mép dốc); dốc vượt giới hạn (chốt ADR) bị chặn | Checklist + video |
| T05 | Camera | Orbit 360° liên tục; zoom trong [min, max]; 0 frame camera dưới địa hình (assert ở debug mode) | Log assert |
| T06 | Visibility | Nhân vật không bị che hoàn toàn liên tục > 1 s trên các tuyến/góc thử (raycast 3 điểm) | Log debug |
| T07 | Interaction | Gợi ý chỉ trong bán kính chốt ADR; overlay mở ≤ 300 ms; Esc/X đóng; vị trí, hướng giữ nguyên; focus trả đúng | Playwright + video |
| T08 | Performance | Đạt §8 trên máy iGPU tham chiếu | CSV frame time + cấu hình máy |
| T09 | Stability | 10 phút + 20 vòng mở/đóng: không crash, resource count ổn định sau warm-up | Log + heap snapshot |
| T10 | Visual consistency | 12 ảnh (0°/90°/180°/270° × 3 vị trí) chấm theo checklist bởi chủ dự án và 1 người ngoài; ≥ 10/12 đạt | Ảnh + phiếu |
| T11 | Accessibility | Toàn bộ nội dung qua bàn phím; Skip; reduced motion; modal giữ focus; axe-core 0 critical/serious | Báo cáo axe + checklist |

### 13.2 Kiểm thử bổ sung

| ID | Phép thử | PASS |
|---|---|---|
| Q12 | Direct URL + reload + locale + unknown route (cả `*.cloudfront.net` và tên miền) | Case study đúng; URL sai trả 404 có lối về; không redirect toàn bộ về Welcome |
| Q13 | Gõ WASDE trong chat, giữ phím rồi blur | Không điều khiển nhân vật khi nhập; quay lại không tự chạy |
| Q14 | Mở overlay khi cruise; đóng; Skip cinematic | Không tiếp tục lao xe; trạng thái và focus xác định |
| Q15 | Load failure / WebGL không có / context loss | Fallback HTML ≤ 2 s; nội dung và CV còn truy cập |
| Q16 | Secret lặp và sai thứ tự | Không đếm trùng; ending chỉ mở đúng điều kiện |
| Q17 | Public artifact và nội dung EN/VI | Không dữ liệu chưa duyệt; quét rò rỉ sạch; vai trò/số liệu khớp hai ngôn ngữ |
| Q18 | Network isolation và tải lạnh | Đạt ngân sách §8; không tải game trước Enter World |
| Q19 | Quota AI dưới concurrency/timeout | Không cấp ngân sách trùng; lỗi bộ đếm chặn model, chuyển FAQ; kill switch hoạt động |
| Q20 | Rollback | Phục hồi release trước, asset không hỏng, phiên đang mở không vỡ chunk; thời gian thực tế được ghi |
| Q21 | Phiên mới / reload / back-forward cache / đổi ngôn ngữ trong world | Progress reset đúng ranh giới phiên; đổi ngôn ngữ không reset vị trí/secret |
| Q22 | Usability người mới | ≥ 4/5 người đạt phép thử 60 giây, hoặc ghi vấn đề và sửa |
| Q23 | Security headers và CSP | HSTS, nosniff, chống framing, Referrer-Policy, Permissions-Policy có mặt; CSP không lỗi vi phạm trên Welcome, Quick, World; không dùng `'unsafe-inline'` cho script |
| Q24 | Tên miền và TLS | HTTPS hợp lệ cho apex và `www`; `www` → apex 301; HTTP → HTTPS; CAA đúng; canonical/sitemap dùng tên miền |
| Q25 | Guardrail chi phí | Budgets, anomaly detection, SNS email đã tạo và nhận thử cảnh báo trước resource khác; distribution ở Free plan; không có resource ngoài danh sách §11.4 |
| Q26 | Ngân sách tải sau deploy | Đo lại §8 trên CDN thật (không chỉ local); nén và cache header đúng loại file |

**Không miễn trừ để public:** lộ dữ liệu mật, thành tích sai, không truy cập được CV/nội dung cốt lõi, crash chặn luồng chính, quota AI không bảo vệ chi phí theo thiết kế, vi phạm quyền dùng asset, không có budget alert. Có thể tắt tính năng lỗi để phát hành phần khác nếu phần đó độc lập và vẫn đạt gate.

Lỗi thẩm mỹ nhỏ có thể DEFERRED nếu ghi rõ phạm vi, người chịu trách nhiệm, hạn và điều kiện chấp nhận. Không gọi DEFERRED là PASS. Chưa có laptop tham chiếu thì không tuyên bố nghiệm thu iGPU.

---

## 14. Mở rộng sau nền tảng và giới hạn phạm vi

**Nên làm sau nền tảng:**

1. **Recruiter summary** đầu mỗi case study (bài toán, phần Duy làm, bằng chứng chính) — dùng chung hệ nội dung.
2. **Evidence panel:** sơ đồ, đoạn code/log đã làm sạch, phép đo và link công khai cạnh tuyên bố được hỗ trợ.
3. **The Making of The Quiet Atlas** như case study vận hành (§2.3), gồm chi phí thực tế từng tháng so với 200 USD credits — chủ đề rất hợp với vai trò Cloud/DevOps.
4. **Mascot theo ngữ cảnh có kiểm soát:** gợi ý đọc dự án hoặc cách điều khiển; không tự mở chatbot, không suy đoán cảm xúc người xem.
5. **Nội dung có phiên bản:** hiển thị ngày rà soát; job định kỳ kiểm tra link và chứng chỉ khi có yêu cầu cụ thể.

**Nên hoãn:** multiplayer, tài khoản người xem, nhiệm vụ phức tạp, thời tiết/ngày đêm thời gian thực, vehicle physics chân thực, chatbot duyệt web, vector database khi dữ liệu còn nhỏ, CMS, game mobile đầy đủ, Kubernetes cho chính portfolio, gói CloudFront trả phí.

---

## 15. Cấu trúc triển khai và quy tắc phụ thuộc

Một repository, một ứng dụng frontend ở giai đoạn đầu. Cấu trúc định hướng (điều chỉnh theo repo hiện hữu nếu giữ được ranh giới phụ thuộc):

| Vùng mã | Trách nhiệm |
|---|---|
| `src/app/` | Routes dựng sẵn, locale, metadata, HTML shell |
| `src/content/` | Nội dung public đã duyệt, `evidence.json`, `faq.json` và schema; không chứa tài liệu mật |
| `src/components/portfolio/` | Renderer nội dung dùng chung cho trang và overlay |
| `src/features/world/` | Scene, camera, locomotion, collision, zone streaming — chỉ import động sau Enter World |
| `src/features/interaction/` | Chọn mục tiêu, event E/click, trạng thái tương tác |
| `src/features/navigation/` | Atlas Journal, biển chỉ đường dịch chuyển |
| `src/features/story/` | Secret set, cinematic, ending, mascot |
| `src/features/chat/` | Widget, FAQ, client gọi endpoint |
| `src/state/` | Trạng thái phiên, transition, pause reasons, preferences |
| `public/` | Asset public đã duyệt, tối ưu, có manifest |
| `assets/LICENSES.csv` | Kho giấy phép asset |
| `backend/` | Endpoint AI, quota, kill switch — chỉ thêm ở C1 |
| `infra/bootstrap/`, `infra/modules/`, `infra/envs/prod/` | Terraform; không chứa secret/state |
| `tools/` | Pipeline asset, hash CSP, build CV PDF, `build-info`, kiểm giấy phép |
| `tests/` | Kiểm thử hành vi, dữ liệu, smoke test |
| `docs/` | `PROJECT_STATUS.md`, `adr/`, `evidence/`, `runbook/`, `art-bible/`, bản spec này |

Quy tắc:

- Không import `features/world` từ shared layout hoặc content renderer. Renderer portfolio không phụ thuộc scene, physics hoặc model provider. Logic secret và state transition kiểm thử được không cần WebGL.
- Physics/collision chọn sau một spike nhỏ trong P01-A: ưu tiên controller có sẵn capsule, slope, autostep, ground snapping (ví dụ Rapier kinematic character controller); phương án B là capsule + raycast tự viết. Ghi phiên bản, kích thước tải, cách khởi tạo, chi phí runtime vào ADR. Không thêm nhiều thư viện giải cùng một vấn đề.
- Physics dùng timestep có kiểm soát, giới hạn bước bù khi tab bị treo. Collider đơn giản tách khỏi mesh hiển thị; quality không đổi quy tắc va chạm. Quản lý listener, animation loop, audio node, tài nguyên GPU theo vòng đời; unmount không để tiến trình nền chạy trùng.
- Chỉ nạp và biên dịch MDX từ nguồn tin cậy do chủ dự án quản lý. Không nhận MDX/HTML từ người xem.
- Kiểm thử tương thích dependency bằng install theo lockfile và production build; Renovate/Dependabot hằng tuần.
- Trunk-based: nhánh ngắn, PR vào main, conventional commits, tag cho mỗi lần phát hành.
- ADR đầu tiên: 0001 static export và routes; 0002 physics; 0003 tài khoản AWS và mô hình giá CloudFront; 0004 tên miền và DNS; 0005 analytics; 0006 provider AI.

---

## 16. Prototype 01 — phạm vi thi công chi tiết

### 16.1 Nội dung bắt buộc

Vùng rừng khoảng 60×60 m (chỉnh qua playtest): địa hình phẳng và một đoạn dốc, cây dày/thưa, ánh sáng bình minh, sương; nước đơn giản nếu không cản gate. Nhân vật capsule hoặc model placeholder có nhãn rõ.

WASD theo camera, đi/chạy, gravity, ground detection, collision, giới hạn dốc, recovery point; camera 360°, zoom giới hạn, damping, xử lý vật cản và tán lá. Một bảng chỉ đường, một vùng tương tác E/click, overlay demo, đóng X/Esc, giữ vị trí.

Low/Balanced/High, debug metrics chỉ cho developer (FPS, frame time, draw calls, resource count), loading/error/fallback, kiểm tra input focus và pause. Quick Portfolio hoạt động độc lập theo A1.

### 16.2 Ngoài phạm vi

Không làm đủ 8 khu, biển hoàn chỉnh, GD110 final, Auto Cruise, 4 secrets, cinematic ending, Atlas Journal đầy đủ, AI thật, AWS production. Không dùng nhạc chưa có quyền. Không gọi placeholder là avatar đã hoàn thiện.

### 16.3 Thứ tự thực hiện

| Bước | Bàn giao |
|---|---|
| P01-A | Lockfile, cấu trúc, production build, lazy boundary, Welcome/Quick liên kết, spike physics + ADR 0002 |
| P01-B | Terrain + heightfield collider, cây instancing, ánh sáng, fog, cảnh kiểm thử (cần máy tham chiếu đã chọn) |
| P01-C | Character controller, collision, slope, recovery point |
| P01-D | Camera 360°, zoom clamp, spring arm, dither tán lá |
| P01-E | Interaction, overlay, focus/input ownership, pause/blur/hiddenTab |
| P01-F | Quality settings, cold-load trace, benchmark, toàn bộ gate P01 |

Tối ưu P01 trước khi nhân rộng cảnh. Thiếu laptop benchmark → T08 BLOCKED, tiếp tục phần HTML/logic; không tự đổi máy khác thành máy tham chiếu mà không ghi nhận.

---

## 17. Quyết định và thông tin cần xác minh theo thời điểm

| Thời điểm | Cần chủ dự án chốt/xác minh | Phần vẫn làm được khi chưa có |
|---|---|---|
| Trước A1 | Cấp độ vai trò hiển thị; đồng ý hai track và timebox; email portfolio; điện thoại chỉ trong CV hay cả web; trạng thái và bằng chứng từng dự án | Schema, layout, component, nội dung nháp |
| Trước P01-B | Laptop tham chiếu: CPU, GPU tích hợp, RAM, màn hình, OS, trình duyệt | Build local, gameplay logic, đo trên máy đang có với nhãn riêng |
| Trước A2 | Ngày đăng ký AWS và ngày hết hạn credits; nâng Paid plan; ngưỡng Budgets; repo public hay private (khuyến nghị public để làm case study); tên miền đã mua, registrar, TLD | Static build, IaC draft/validate, sơ đồ triển khai |
| Trước A3 | Phạm vi công bố Partner Data Gateway và người cho phép; link GitHub/demo công khai từng dự án | Bản nháp case study |
| Trước art production (B2) | Mẫu nhân vật/GD110, license asset, art bible; dùng bản thu đàn của chính mình hay không | Graybox và placeholder có nhãn |
| Trước C1 | Model/provider có được trừ vào credits không; ngân sách model tháng (đề xuất ≤ 5 USD); có log câu hỏi ẩn danh không | FAQ local, schema output, bộ câu hỏi đánh giá |
| Sau A2 (tùy chọn) | Bật analytics tổng hợp hay không; dùng staging distribution hay không | — |

Không cần chốt tên miền hay AI provider để bắt đầu A1/P01.

---

## 18. Quy trình giao việc và bàn giao mỗi milestone

### 18.1 Khi bắt đầu một phiên triển khai

1. Xác định milestone từ yêu cầu hiện tại, repo và `PROJECT_STATUS`. Bắt đầu mới mà chưa có milestone cụ thể thì thực hiện A0/A1 trước.
2. Liệt kê phần đã tồn tại, phần cần sửa, giả định và blocker thực sự.
3. Chọn lát cắt nhỏ có thể chạy, có giá trị sử dụng và có phép kiểm tra.
4. Triển khai, chạy kiểm tra, sửa lỗi, cập nhật trạng thái; không dừng ở kế hoạch khi đã được yêu cầu làm.
5. Chỉ chuyển milestone sau khi đạt gate liên quan; công việc độc lập của lớp HTML vẫn tiếp tục khi world bị chặn.

### 18.2 Bàn giao bắt buộc

- Hành vi đã hoàn thành và quyết định chính, diễn đạt theo trải nghiệm người dùng.
- File thay đổi, cách chạy, phiên bản và cấu hình không bí mật.
- Test đã chạy, môi trường, kết quả, đường dẫn bằng chứng.
- Các FAIL/NOT RUN/BLOCKED/DEFERRED, ảnh hưởng và bước tiếp theo.
- Với việc chạm tới cloud: resource đã tạo/sửa, chi phí dự kiến, cảnh báo đã kiểm tra.
- Milestone tiếp theo nhỏ nhất phù hợp lộ trình.

`docs/PROJECT_STATUS.md` ghi milestone, commit, gate, blocker, ngày hết hạn credits và tên miền để phiên AI sau không hiểu nhầm trạng thái. Quyết định lớn vào ADR (bối cảnh, lựa chọn, đánh đổi, điều kiện xem xét lại). Không tạo tài liệu hình thức không phục vụ triển khai.

### 18.3 Điều kiện hoàn thành

**Mốc A** hoàn thành khi nội dung public đã duyệt; Quick Portfolio, case studies, CV, liên hệ chạy đúng trên desktop và mobile; routes trực tiếp hoạt động trên tên miền; accessibility cốt lõi đạt; hosting, guardrail chi phí và rollback đã kiểm thử.

**Mốc B** hoàn thành khi tám khu, camera/locomotion, Atlas Journal, xe, mascot, secret/ending và âm thanh đạt gate; máy tham chiếu đạt budget; nhánh lỗi có fallback; nội dung nghề nghiệp luôn truy cập độc lập.

**AI** hoàn thành khi knowledge package đồng bộ, nguồn trả lời đúng, bộ đánh giá đạt, quota/concurrency/failure tests đạt và kill switch hoạt động. Chưa đạt thì giữ FAQ và ghi AI chưa phát hành.

Không tuyên bố "hoàn tất 100%" khi còn gate bắt buộc chưa kiểm thử. Không hứa không bao giờ lỗi, AI không bao giờ bịa hoặc chi phí cloud luôn bằng 0.

---

## 19. Rủi ro và kiểm soát

| Rủi ro | Khả năng | Ảnh hưởng | Kiểm soát |
|---|---|---|---|
| Phần game kéo dài, portfolio trễ | Cao | Cao | Hai track, A2 trước B2, timebox, tiêu chí dừng (§12) |
| Tài khoản AWS bị đóng ở tháng thứ 6 vì còn ở Free account plan | Trung bình | Cao | Nâng Paid plan trước A2 và trước mốc 6 tháng; nhắc việc (§11.1) |
| Hóa đơn sau khi credits hết hoặc hết hạn | Trung bình | Trung bình | Free plan CloudFront, kiến trúc gần 0 USD, Budgets tính chi phí trước credits, AI fail-closed |
| Phí model AI không được trừ vào credits | Trung bình | Trung bình | Kiểm tra trang Credits trước C1; trần tháng; AI có thể chỉ dùng FAQ |
| Kiệt sức vì làm một mình lâu | Trung bình | Cao | A2 có kết quả sớm; mỗi mốc là bản dùng được |
| AI trả lời bịa | Trung bình | Cao | Golden set, bắt buộc nguồn, fail-closed |
| Lộ thông tin HPT/đối tác | Trung bình | Cao | Vẽ lại sơ đồ, quét tự động, ledger quyền công bố |
| Laptop iGPU giật | Cao | Cao | §8 có p95, quality tự động, instancing, tiêu chí chuyển hướng |
| Yêu cầu bảo mật vượt giới hạn Free plan | Trung bình | Trung bình | Managed policies + CloudFront Function + meta CSP; ADR nếu cần PAYG |
| Deploy giữa phiên làm vỡ chunk | Trung bình | Trung bình | Không xóa asset cũ ngay |
| Tên miền hết hạn hoặc registrar khóa DNS | Thấp | Cao | Bật tự gia hạn, chọn registrar cho đổi nameserver, ghi ngày hết hạn vào `PROJECT_STATUS` |
| Asset vi phạm giấy phép | Trung bình | Trung bình | `LICENSES.csv` kiểm trong CI |
| Font thiếu dấu tiếng Việt | Cao | Trung bình | Kiểm glyph trước khi chọn |
| Thư viện R3F/physics đổi API | Trung bình | Trung bình | Ghim phiên bản, Renovate, test hồi quy |
| Spam qua kênh liên hệ | Cao | Thấp | Email trên tên miền có thể đổi, điện thoại chỉ trong CV |
| Chính sách giá/gói AWS thay đổi | Thấp | Trung bình | Kiểm lại trước khi tạo resource; ADR 0003 |

---

## 20. Nguồn kỹ thuật và quy tắc cập nhật

Đối chiếu ngày 03/11/2026. Kiểm tra lại khi triển khai. Nguồn không chứng minh phần triển khai đã đạt yêu cầu.

- **[S1] Next.js — Static exports:** https://nextjs.org/docs/app/guides/static-exports
- **[S2] AWS — CloudFront Function thêm index.html:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_url_rewrite_single_page_apps_section.html
- **[S3] W3C APG — Modal dialog:** https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- **[S4] React Three Fiber — Scaling performance:** https://r3f.docs.pmnd.rs/advanced/scaling-performance
- **[S5] web.dev — Web Vitals:** https://web.dev/articles/vitals
- **[S6] OWASP GenAI — Prompt injection:** https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- **[S7] AWS — API Gateway usage plans:** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html
- **[S8] AWS — Available Flat-Rate Plans:** https://docs.aws.amazon.com/PricingPlanManager/latest/UserGuide/plans.html
- **[S9] AWS — CloudFront flat-rate pricing plans (bảng tính năng theo gói, quota, điều kiện tài khoản):** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html
- **[S10] AWS — Free Tier update: up to $200 credits, 6-month free plan:** https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits
- **[S11] AWS — Dịch vụ hỗ trợ trong Free plan:** https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html
- **[S12] AWS — Route 53 pricing (promotional credits không áp cho đăng ký tên miền):** https://aws.amazon.com/route53/pricing/
- **[S13] AWS re:Post — Credits và phí model Bedrock (nguồn cộng đồng, cần xác minh trên trang Credits):** https://repost.aws/ko/questions/QULMmXNMRwRvGSYm6OGt6e3Q/aws-credits-for-bedrock
- **[S14] Terraform S3 backend với native state locking:** https://docs.cloudposse.com/layers/accounts/tutorials/terraform-s3-state/
- **[S15] AWS — Managed response headers policies:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html

---

**Chỉ dẫn khởi động:** Khi nhận yêu cầu bắt đầu xây dựng, đọc repository và `PROJECT_STATUS`, rồi thực hiện milestone đầu tiên còn thiếu. Giữ nội dung nghề nghiệp đúng và dùng được độc lập; tạo playable slice đạt kiểm thử trước khi mở rộng thế giới; chỉ triển khai cloud khi A2 đã được giao, tài khoản đã ở Paid plan và guardrail chi phí đã có; chỉ bật AI khi C1 được giao và ngân sách model đã xác nhận.
