## RC-01: hoàn thiện bản ứng viên phát hành (RC) để Duy test thật và đánh giá toàn bộ

Duy (2026-11-09): "kêu Codex hoàn thiện tiếp sản phẩm, để mình có thể test chân thật rồi đánh giá toàn bộ."

**Vai trò:** Codex làm **Lead + thi công** theo `docs/runbook/codex-lead.md` và `docs/runbook/lead-handoff.md`. Được tạo worktree trong `D:/tqa-worktrees/`, được chia subagent (tối đa 3 cùng lúc), được merge vào `main` sau khi gate + duyệt render đạt. Luật cứng của `CLAUDE.md` §6 giữ nguyên: không push, không chạm cloud/credential, không bịa nội dung, không ghi PASS khi chưa chạy.

**Bàn giao 2026-11-10:** nguồn RC `bbd85a7c336aa025f11f42d40a07ea8bdbea83f1` đủ gate máy dev. [Audit + log](../showcase/35-rc/audit.md), [hướng dẫn Duy](../playtest/rc-guide.md). Build/strict gate1759, full e2e153/153 (4 worker), sáu tải lạnh worst4,653s/2.128.915B, Lighthouse15 lượt, CV và CPU ABBA đều PASS. Đã duyệt8 khuHigh/15ảnhcinematic/12Welcome–Quick; video45s là slideshow ảnh QA. Iris Xe NOT RUN, T10/Duy DEFERRED. Main chưa merge do `.git` chỉ đọc; Claude-Lead fetch/duyệt/merge clone theo chỉ dẫn06:50. Không push.

### 1. Audit toàn hành trình (chơi thật bằng Edge, VI và EN, desktop 1600×900 + mobile)

Đi trọn các bước sau, chụp ảnh và ghi mọi lỗi hoặc chỗ thô vào `docs/showcase/35-rc/audit.md` (mỗi dòng: mức nghiêm trọng, bước, mô tả, ảnh):

1. Welcome → Enter World → màn tải → cảnh mở đầu (cả Skip lẫn xem hết).
2. Đi bộ qua 8 khu theo đường, mỗi khu bấm E mở overlay.
3. Sổ Atlas, Menu (chất lượng Low/Balanced/High, ngôn ngữ, giảm chuyển động, âm thanh), "Đi tới…".
4. Đi xe GD110: lên, chạy, tự chạy, phanh, xuống.
5. 4 bí mật → cảnh kết. Tựa lan can ngắm biển.
6. Thoát world → Welcome; Quick Portfolio, CV, các trang case study.
7. Mobile (Welcome/Quick, thông báo world cần chuột).

Dùng sẵn `tools/review/*.mjs`, hook `window.__tqaJourney` (`goTo`, `visitSecret`, `nearVehicle`, `lookoutPosition`). Nhưng ít nhất **một lần đi bộ thật bằng phím** từ First Light tới Last Postcard (`tests/perf/journey.perf.ts` hoặc script tự viết), ghi lại chỗ kẹt, chỗ xuyên vật thể, chỗ camera chui vào cây/đá, chỗ nhảy hình.

### 2. Sửa

- Chia ticket nhỏ theo `docs/tickets/` (mỗi ticket một vùng file, có phép thử).
- Ưu tiên theo thứ tự: lỗi chặn chơi → lỗi hiển thị rõ → không nhất quán với R1 → đánh bóng.
- Việc đã biết cần làm:
  - Chụp lại 8 ảnh bưu thiếp khu (`public/zones/`) và ảnh nền Welcome (`public/welcome/`), vì các ảnh hiện tại chụp **trước R1**.
  - Kiểm tra cảnh mở đầu và cảnh kết sau R1 (tán, sương, chân trời).
  - Kiểm tra cây R1 không che nhân vật hoặc landmark ở camera thấp.
- Mỗi lần merge: gate (`bash tools/lead/gate.sh`) + ảnh High đủ 8 khu so với trước (`TQA_QUALITY=high node tools/review/ingame-shots.mjs`, `luma.mjs`). Có chạm logic mỗi khung thì đo thêm `cpu-compare.mjs`.

### 3. Chốt RC

- **Kiểm tra trên commit RC** (ghi hash):
  - full e2e (`pnpm test:e2e`, 4 worker);
  - `pnpm test:perf load-budget` (vào chơi ≤ 6 s, 3D ≤ 8 MB);
  - `pnpm perf:lhci`;
  - unit.
- **Showcase** `docs/showcase/35-rc/`: ảnh 8 khu, cảnh mở đầu, cảnh kết, overlay, Welcome, mobile; video 30–60 s nếu làm được bằng ffmpeg từ ảnh chụp.
- **Hướng dẫn test cho Duy** `docs/playtest/rc-guide.md` (tiếng Việt, ngắn), gồm:
  - cách chạy bản RC trên máy: `pnpm install`, `pnpm build`, `node tools/serve-out/index.mjs out --port 4180`, mở `http://127.0.0.1:4180/vi/`;
  - lộ trình test 20–30 phút;
  - bảng đánh giá: mỗi khu và mỗi tính năng chấm 1–5, kèm ô ghi chú;
  - cách đo T08/T09 trên laptop Iris Xe theo `docs/runbook/`.
- **Cập nhật** `docs/PROJECT_STATUS.md` và `docs/runbook/lead-handoff.md`.
- Kết thúc bằng một dòng riêng ở đầu dòng trong `docs/runbook/lead-handoff.md`: `RC-01 DONE` + dấu cách + hash commit RC (ví dụ dạng `RC-01 DONE 1a2b3c4`).

### 4. Khi hết lượt

Ghi trạng thái dở dang vào `docs/runbook/lead-handoff.md` (mục "RC-01 đang làm") trước khi dừng, nếu được. Script `tools/lead/run-codex-lead.sh` sẽ tự chạy lại bạn sau giờ reset. Lần chạy tiếp, đọc mục đó để làm tiếp, **không làm lại** việc đã xong.
