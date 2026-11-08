# Codex → Claude: bàn giao tiếp nhận ngày 08/11/2026

**Yêu cầu mới nhất của Duy:** “Bàn giao cho claude, mình sẽ kêu claude tiếp nhận”. Codex đã chuẩn bị tài liệu này; chưa có xác nhận Claude đã đọc/tiếp nhận. Không có worker Codex đang thi công. Lịch heartbeat kiểm tra mỗi giờ đã được xóa vì đang chờ Duy chấm mẫu; không có lịch tự khởi động lại ticket.

## Việc cần tiếp nhận trước tiên

**Duy chưa nghiệm thu hình ảnh/UX/UI.** Các gate PASS của đợt 31 không đồng nghĩa đạt gu. Duy đưa hai ảnh rừng chân thực và một ảnh địa hình hình khối để so hướng. Sau đánh giá, Duy giao làm lại **một khu First Light trước**, Duy chấm rồi mới mở rộng tác nhân đồng thời. Mẫu R1 đang chờ phản hồi; chưa được phép coi là style đã duyệt.

1. Đọc `CLAUDE.md`, `docs/PROJECT_STATUS.md`, tài liệu này và gallery `docs/showcase/32-first-light-prototype/README.md`.
2. Mở ảnh mẫu thực tế, không chỉ đọc test report; cùng Duy chốt giữ/sửa hình khối, màu, mật độ, bố cục và camera.
3. Khi có phản hồi, làm tiếp trong worktree mẫu hoặc nhánh mới từ nó. **Không bắt đầu lại U-02/U-03, không merge mẫu hoặc nhân rộng 7 khu trước Duy duyệt.**
4. Trước khi nhân rộng, giải quyết gate CPU còn chưa đạt/chưa kết luận; không đo lặp đến khi ra PASS và không nâng ngưỡng.
5. Sau duyệt, Duy muốn khoảng **5 tác nhân mỗi đợt**, phân vùng file. Trong runtime Codex hiện tại chỉ có 3 subagent đồng thời với root; đây là giới hạn công cụ Codex, không phải chỉ dẫn giới hạn công cụ của Claude. Các phép đo GPU/e2e/perf chạy riêng.

## Nhánh và nguồn sự thật

| Nơi | Trạng thái |
|---|---|
| `D:/the-quiet-atlas` / `main` | Mã UI đã merge tại `f20147d`, sửa pause tại `7774ae8`. `8d3af1d` chỉ đưa ảnh/báo cáo mẫu vào main; commit bàn giao sau đó cũng chỉ sửa docs. **Không có source R1 trên main.** |
| `D:/tqa-worktrees/FirstLight-R1` / `lane/FirstLight-R1` | Source mẫu `56d29d5c9fae057fa332ffe5e1161a5648854faa`; docs-only tiếp theo `720e48eb8baa36e247d8a8c6a7de18d43e393e2c`. Worktree sạch khi bàn giao. |
| FL-01 ticket | `D:/tqa-worktrees/FirstLight-R1/docs/tickets/FL-01-first-light-style-prototype.md`, trạng thái review / awaiting Duy gu. |
| Gallery bền vững | `D:/the-quiet-atlas/docs/showcase/32-first-light-prototype/` — ảnh và log đã copy từ nhánh mẫu. Bản tương ứng cũng nằm trong worktree mẫu. |

Các worktree lane cũ còn được giữ. Không xóa/reset/rebase hàng loạt hoặc tự chạy lại chúng. `UX-qa-recheck` là chẩn đoán cũ có junction node_modules; đã có lần dọn junction bị automatic review từ chối, nên để nguyên, không dùng làm worktree build mới. File gốc chưa track `D:/the-quiet-atlas/The_Quiet_Atlas_Master_Prompt_V6 (1).md` là file có sẵn của Duy, không đụng vào.

## Mẫu R1 đã đổi gì

- Cụm rừng authored riêng quanh First Light: ba biến thể cây phân nhánh, tán nhiều múi/facet, lớp gần/giữa/xa và bụi thấp; 280 triangle mỗi cây, module 4 draw.
- Thay scatter/cỏ vụn chỉ trong vùng 48 m; giữ hành lang đi và tương tác sách/ghế/xe. Camera chơi blend từ 18° trong khu về 30° cũ khi rời vùng.
- Màu nền xanh, đường cát, ánh sáng/không khí riêng có falloff. Giữ toàn bộ fog metadata gốc bên ngoài vùng, nhất là forestWeight.
- Lớp far-landscape thô có gai hình ở góc High; mẫu chỉ suppress backdrop này theo vùng khi chơi First Light, khôi phục khi rời vùng/cinematic. **Terrain có thể đi lại không bị xóa.** Đây là lựa chọn cho prototype, cần tiếp tục đánh giá khi chốt art.
- Chỉ thay postcard `public/zones/first-light.webp` trong nhánh mẫu, 38.444 B; 7 postcard khác và Welcome hero giữ nguyên. License project-original đã cập nhật trong nhánh.
- Collider grove nằm trong guarded initialization; cấp lỗi giữa chừng có cleanup. Deferred bounds thay grove theo transaction, staging lỗi giữ nguyên grove/collider cũ và có retry test.

## Kết quả đã kiểm chứng, không trộn với main

**Main code `7774ae8`:** unit 1697/1697, e2e 151/151, load-budget EN/VI và Lighthouse 15 lượt PASS. Báo cáo lịch sử ở `docs/showcase/31-ux-final/qa-final.md`. Duy vẫn không nghiệm thu hình ảnh của bản đó.

**R1 source `56d29d5`:**

- PASS: full unit 142 files / **1703/1703**; sau đó chỉ thêm test, compose mở rộng **13/13 PASS**. Không ghi thành một lượt full 1704.
- PASS: lint 0 warning, typecheck, static build, 9 ảnh Low/Balanced/High không lỗi console/page/shader.
- PASS: hồi quy High 7 khu khác, max |luma delta| **0,001155** so với ngưỡng 0,03.
- PASS: tải lạnh 3 lượt mỗi locale, worst EN **5,34 s**, VI **5,38 s**; world **2.166.471 B**, không request 3D trước Enter World.
- PASS ngân sách composer tại spawn: High **149.929 → 142.800 triangles**, **84 → 82 mesh draws**. Đây là số composer được đo, không tự gọi là tổng mọi thành phần world.
- **CPU chưa PASS:** hai cặp ban đầu mean Script delta First Light +7,5 / Roots +6,5 / Workshop **+12 ms/s**, trần +10; Task Workshop +12,5. Đúng một cặp đảo thứ tự candidate → baseline cho Workshop +6, không tái hiện miss. Tổng ba cặp Script +10 / Task **+10,33**. Giữ mọi log và kết luận chưa dứt điểm, không bỏ sample chậm. Không thêm lượt đo chỉ để lấy PASS.
- Full 151 e2e và Lighthouse **NOT RUN cho R1**; không lấy PASS của main gán sang mẫu. T10/playtest **DEFERRED**; T08/T09 Iris Xe **NOT RUN**.

Log thô, manifest ảnh và CPU aggregate nằm trong `docs/showcase/32-first-light-prototype/checks/`; README ghi rõ lỗi từng gặp và cách khắc phục.

## Ảnh Duy đã được gửi trong chat

- `gameplay-balanced.webp` — góc camera chơi thực tế.
- `eye-high.webp` — góc thấp đọc hình khối/màu.
- `overview-high.webp` — bố cục tổng thể.
- `overlay-desktop.webp`, `overlay-mobile.webp` — đúng postcard mới trong UI.
- `before-after.webp`, `quality-contact.webp`, `other-seven-contact.webp` — đối chiếu và phạm vi hồi quy.

**Chưa có phản hồi duyệt R1 của Duy tại thời điểm bàn giao.** Ảnh tham chiếu rừng/hình khối ở thư mục attachment đã cung cấp trong chat; chỉ dùng lấy cảm hứng, không đưa pixel tham chiếu vào public.

## Chạy lại nếu cần

Hai URL đang HTTP 200 lúc bàn giao: main `http://127.0.0.1:4180/vi/`, R1 `http://127.0.0.1:4415/vi/`. Đây là server local có thể dừng sau đó; xác minh trước khi dùng, không kill tiến trình không rõ chủ.

Trong worktree R1: `pnpm.cmd build`; `node tools/serve-out/index.mjs out --port 4415`; script `tools/review/first-light-shots.mjs` chụp ảnh. CPU dùng `tools/review/cpu-compare.mjs`, cố định Balanced, chờ network/build và dùng khoảng CDP thực. Trên Windows, gate Git Bash dùng function `pnpm() { pnpm.cmd "$@"; }; export -f pnpm` để gọi đúng pnpm.cmd, không che exit code.

Giữ nguyên luật: không push chưa được Duy đồng ý từng lần; không cloud/terraform apply/credential; không bịa dữ liệu hoặc PASS; không lưu progress; không nâng ngân sách sau đo thất bại. Không sản xuất hàng loạt trước vòng duyệt gu.
