# Runbook: Codex làm Lead (khi Claude hết lượt tuần)

Quyết định của Duy (2026-11-07): khi thanh **weekly usage của Claude đạt 97 %**, Claude dừng và **Codex nhận toàn quyền**: vừa làm Lead vừa thi công. File này là tất cả những gì Codex-Lead cần. Nếu khác `CLAUDE.md` thì file này chỉ thay mục "Codex không được merge vào main"; mọi luật cứng ở `CLAUDE.md` §6 vẫn giữ nguyên.

## 1. Luật cứng (không đổi)

- Không bịa nội dung, số liệu, URL, thành tích. Chỗ nào thiếu ghi `TBD`.
- Không ghi PASS nếu chưa chạy test. Chỉ dùng 5 trạng thái PASS / FAIL / NOT RUN / BLOCKED / DEFERRED.
- Không chạm cloud, không `terraform apply`, không mua hay đăng ký gì. Không in, không lưu token/mật khẩu/key.
- Không lưu tiến trình chơi (localStorage, sessionStorage, cookie, URL, backend). Không import `features/world` từ layout, shared barrel hay content renderer.
- Không nâng ngưỡng hiệu năng sau khi đo thất bại. Asset mới phải có dòng trong `assets/LICENSES.csv`. Không logo/thương hiệu.
- **Không push** lên GitHub khi Duy chưa đồng ý từng lần.
- T10 và playtest người thật để **DEFERRED** tới khi UX/UI đạt khoảng 90–100 %. Chỉ Duy chấm.

## 2. Vòng làm việc

1. Đọc `docs/PROJECT_STATUS.md` (đợt mới nhất, mục "Việc tiếp theo"), `git log --oneline -15`, `git worktree list`.
2. Chọn một ticket trong `docs/tickets/` (B2-2xx đang dở, hoặc viết ticket mới theo mẫu ở `CLAUDE.md` §5). Đọc `_common-b2.md`, `_ux-common.md`, `_review-common.md`.
3. Thi công trong worktree riêng, không sửa thẳng trên `main`:
   ```bash
   git -C D:/the-quiet-atlas worktree add D:/tqa-worktrees/<ID> -b lane/<ID>
   cd D:/tqa-worktrees/<ID> && pnpm install --frozen-lockfile --offline
   ```
   Có thể giao ticket con cho một Codex khác bằng `bash tools/lead/dispatch.sh <ID> <card.md> [low|medium]`. Muốn chạy tiếp worktree đã có thì dùng `tools/lead/resume.sh`.
4. **Gate** (bắt buộc exit 0): `bash tools/lead/gate.sh <thư mục worktree>`. Không chạy gate qua pipe làm che mất mã lỗi.
5. **Duyệt render**, bắt buộc với mọi thay đổi hình ảnh. Theo `docs/tickets/_review-common.md`:
   - `pnpm build`; `node tools/serve-out/index.mjs out --port 41xx` (chạy nền);
   - `node tools/review/ingame-shots.mjs <dir> http://127.0.0.1:41xx vi` (**đủ 8 khu**); `intro-shots.mjs`, `ending-shots.mjs`, `extras-shots.mjs` (bí mật, đi xe), tuỳ phần bị chạm;
   - `node tools/review/luma.mjs <dir>`, `ground-hue.mjs`; so với main (cổng 4180, `out/` của main).
   - **Mở và xem từng ảnh.** Đủ số đo mà hình xấu đi vẫn là chưa đạt. Ví dụ: B2-239 đạt luma nhưng rừng thành xám xanh; B2-240 sửa được biển nhưng làm mất suối ở Horizon.
6. **Hiệu năng**, khi chạm logic mỗi khung hoặc shader: `node tools/review/cpu-compare.mjs <base>` cho main và bản mới, mỗi bản 2 lượt. Không được tệ hơn main quá +10 ms/s.
7. Merge: `bash tools/lead/merge.sh <ID> <file-commit-message>`. Script squash-merge, chạy lại gate và chỉ commit khi PASS. Commit message theo kiểu conventional, kết thúc bằng dòng Co-Authored-By nếu có.
8. Sau mỗi đợt merge:
   - `pnpm build && pnpm test:e2e` (phải 151/151 hoặc hơn);
   - `pnpm test:perf load-budget` (thời gian tới playable ≤ 10 s, mục tiêu nội bộ 6 s);
   - `pnpm perf:lhci`.
9. Cập nhật `docs/PROJECT_STATUS.md` (bảng kiểm tra có commit hash) và showcase `docs/showcase/<đợt>/` (ảnh webp + `checklist.md` để Duy đánh dấu giữ/sửa/bỏ). Báo cáo Duy bằng tiếng Việt theo `CLAUDE.md` §9.

## 3. Bẫy đã gặp

- Gate trong máy đang tải nặng có thể timeout; `gate.sh` tự chạy lại một lần nếu chỉ toàn timeout.
- Các test fingerprint (hash màu/tam giác) phải cập nhật khi đổi hình học có chủ đích. Ghi lý do trong comment, không xoá test.
- `sea-sunset.test.ts` mô phỏng shader nước bằng CPU qua bộ dịch GLSL. Bộ dịch này không có `step()`, nên dùng `smoothstep()`.
- Hook QA chỉ bật khi `window.__tqaJourney = true`: `position`, `cameraYaw`, `zone`, `goTo(zoneId)`, `visitSecret(id)`, `nearVehicle()`.
- ADR 0009: thẻ Welcome neo ở góc dưới trái. Test L3-008 kiểm tra điều này.
- Máy tham chiếu chính thức là laptop Iris Xe của Duy. T08/T09 vẫn NOT RUN; máy RTX 3060 chỉ để tham khảo.

## 4. Tự chạy tiếp, không chờ lệnh (Duy, 2026-11-07)

- Duy đã cấp **full access** cho Codex. Codex-Lead **không chờ lệnh**. Hết lượt thì đọc giờ reset trong log ("try again at …"); tới giờ đó tự chạy tiếp từ mục 2.
- Việc cần Duy (push, chấm T10, mua/đăng ký, nội dung thật) ghi vào `docs/DUY_QUEUE.md`, rồi làm tiếp phần độc lập.
- Vẫn giữ: không push khi chưa có đồng ý, không chạm cloud/credential, không ghi PASS khi chưa chạy.
