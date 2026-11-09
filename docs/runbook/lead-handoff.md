# Bàn giao UX/UI — 2026-11-08

**Duy yêu cầu bàn giao lại cho Claude.** Bản tiếp nhận đầy đủ: [claude-handoff-2026-11-08.md](claude-handoff-2026-11-08.md). Codex đã chuẩn bị tài liệu, chờ Duy gọi Claude tiếp nhận; chưa xác nhận Claude đã đọc. Không còn lịch heartbeat tự chạy.

## Chỉ dẫn mới nhất: mẫu một khu, chờ Duy duyệt

Duy không nghiệm thu hình ảnh đợt 31 và yêu cầu làm lại First Light trước. FL-01 đã ở trạng thái **review** trên `lane/FirstLight-R1`, source `56d29d5`, docs `720e48e`, worktree `D:/tqa-worktrees/FirstLight-R1`. Gallery: `docs/showcase/32-first-light-prototype/README.md`. Mã mẫu chưa merge main; chỉ sao chép ảnh/báo cáo để duyệt. Không tự mở rộng worker hoặc sửa tiếp gu khi chưa có phản hồi Duy. CPU của mẫu vẫn chưa được ghi PASS (giữ kết quả ban đầu và cặp xác nhận trong báo cáo); cần giải quyết trước sản xuất hàng loạt.

Duy giao Codex nhận UX/UI còn lại và báo cáo gộp cuối đợt. Ban đầu chạy subagent tuần tự; cập nhật tiếp theo yêu cầu khoảng 5 tác nhân mỗi đợt. Hệ thống hiện cho tối đa 3 subagent đồng thời với root, nên chia 5 vai và xếp theo giới hạn này. Các phép đo GPU/e2e/perf vẫn chạy riêng để tránh nhiễu. Ủy quyền này áp dụng cho đợt UX/UI; không cần chờ ngưỡng usage 95% để thực hiện các ticket này.

## Trình tự thực hiện

1. U-02: hoàn thiện ảnh bưu thiếp 8 khu, overlay tạp chí, kiểm tra mobile và nút Đóng. Đã tích hợp trong `b961662`.
2. U-03: Welcome, CTA, ảnh biển mới và reflow. Đã tích hợp trong `a8900c2`.
3. QA: chạy gate, full e2e, load-budget, Lighthouse và rà các bảng Menu/Sổ Atlas/Đi tới…/Quick trên bản tích hợp.

Các hash `b961662`/`a8900c2` và worktree `UX-final` ở trên là lịch sử tích hợp, không phải worktree đang chạy. Đợt UI đã squash-merge vào main `f20147d`; sửa pause và locator tiếp tục merge tại `7774ae8`. Hai worktree tích hợp đã được gỡ sau gate. Không khởi động lại worker cũ U-02/U-03.

Năm vai kiểm tra cuối đã hoàn tất: tài nguyên/markup, full e2e, đối chiếu báo cáo, load-budget, Lighthouse. Tài nguyên và báo cáo chỉ đọc chạy cùng lúc; ba phép kiểm trình duyệt nặng chạy lần lượt. Main `7774ae8`: strict gate 1697/1697 unit, full e2e 151/151, 3 tải lạnh mỗi locale EN/VI và 15 lượt Lighthouse đều PASS. Không khởi động lại phép kiểm hoặc ticket đã hoàn tất khi không có thay đổi mới.

Kết quả cuối và bằng chứng: `docs/showcase/31-ux-final/checklist.md` và cập nhật mới nhất ở `docs/PROJECT_STATUS.md`.

Giữ nguyên: không push nếu chưa được Duy đồng ý từng lần; không chạm cloud/credential; không ghi PASS khi chưa chạy. T10/playtest do người thật và T08/T09 trên Iris Xe chưa được thay thế bằng QA trên máy dev.

## Cập nhật Claude-Lead 2026-11-09 ~03:30 (main `6af4eda`)

- Duy chọn **giữ hướng R1** cho First Light, kèm 2 yêu cầu:
  - (1) nguồn suối có núi đá → **FL-02**, đang ở vòng 2 trên `lane/FirstLight-R1`. Phiếu trả lại: `docs/tickets/FL-02-spring-source.md`, gồm đá tự nhiên, vũng trũng có viền, thác nhỏ, sửa mảng tam giác tối ở intro 10 s, thời gian vào chơi ≤ 6 s.
  - (2) lan can cuối đường + tựa lan can ngắm biển + lan can dọc đường biển → **RD-01 đã merge** (`6740901`, e2e `world-railing.spec.ts`).
- Khi FL-02 đạt: merge `lane/FirstLight-R1` (R1 + FL-02) vào main bằng `tools/lead/merge.sh FirstLight-R1 <msg>`. Sau đó chạy full e2e, `load-budget` (khi máy rảnh) và Lighthouse; nhân rộng ngôn ngữ R1 ra 7 khu còn lại theo từng ticket.
- `_common-b2.md` đã nới: ticket nào ghi rõ `index.ts` hay `tests/e2e/` thì được sửa; Codex được mở Edge để tự kiểm tra hình.
- `tools/lead/autoresume.sh` đã sửa lỗi hiểu giờ reset đã qua thành hôm nay.
- Thời gian vào chơi: các lần đo khi máy bận cho ra 6,2–6,9 s. **Cần đo lại khi máy rảnh**; spec 10 s vẫn PASS.

## Nhân rộng R1 (Duy 2026-11-09: "Nhân rộng R1")

Theo `docs/tickets/R1-rollout.md`: **R1-A** (rừng, tổng quát hoá cơ chế R1 từ vùng 48 m thành cấu hình theo biome) → merge → **R1-B** (đồi) và **R1-C** (biển) **chạy song song** (mỗi ticket chỉ sửa preset biome và dressing khu của mình; file dùng chung chỉ Lead sửa khi merge). Lead duyệt từng bước bằng ảnh High đủ 8 khu, intro, ending; chạy `cpu-compare` và `load-budget`. Sau R1-C: full e2e (4 worker), Lighthouse, showcase `docs/showcase/34-r1-toan-world/` + checklist để Duy chấm.

## RC-01 (Duy 2026-11-09): Codex hoàn thiện bản RC để Duy test thật

Ngưỡng Claude nâng lên **97 %** tuần. Codex chạy như Lead theo `docs/tickets/RC-01-release-candidate.md`, được khởi động bằng `bash tools/lead/run-codex-lead.sh RC-01-release-candidate.md`. Script tự chạy lại sau giờ reset và dừng khi file này có dòng `RC-01 DONE <hash>`.

### RC-01 đang làm
(Codex ghi tiến độ ở đây.)
