## TICKET L2-007 — P01-F: adaptive quality (hysteresis), loading/error trong world, mất context GPU, perf hooks debug

- Trạng thái: **Done — merged vào main** (2026-11-04)
- Lane / milestone: L2 / B1 (P01-F)
- Mục tiêu: world tự hạ chất lượng khi máy giật (không tự nâng); mất WebGL context thì báo lỗi để UI đưa người xem về HTML; developer có số đo frame để benchmark T08/T09.
- Spec liên quan: §6.2 mục 7 (GPU/context loss có đường thoát HTML), §7.4 (adaptive quality có khoảng chờ + hysteresis, ưu tiên giảm tự động, chỉ nâng theo người xem), §8, §13 T08, T09, Q15; ADR 0007, ADR 0008
- Được sửa: `src/features/world/`, `src/features/interaction/`, `src/state/`, `tests/unit/world/`, `tests/unit/state/`, `docs/adr/0002-physics.draft.md` (thêm mục P01-F), `docs/adr/0008-ui-world-event-contract.md` (chỉ thêm dòng cho event mới bên dưới)
- Không được sửa: mọi thứ khác; đặc biệt `src/app/`, `src/components/`, `package.json`, lockfile. Không `pnpm add/install`.
- Ràng buộc:
  - Adaptive quality: hàm thuần nhận chuỗi frame time → quyết định giảm một bậc khi p95 > ngưỡng trong cửa sổ N giây sau thời gian chờ warm-up; sau khi giảm có thời gian khóa (hysteresis) trước lần giảm tiếp; **không bao giờ tự nâng**. Người xem chọn trong menu thì tôn trọng lựa chọn (tắt auto cho tới khi tải lại). Hằng số đặt tên, ghi ADR 0002. Quality đổi qua cùng đường với `tqa:set-quality` (không remount, không đổi collider).
  - Context loss: nghe `webglcontextlost` → dừng loop, phát `tqa:world-error` `{ kind: "context-lost" }` trên container (thêm vào ADR 0008). Không hứa khôi phục renderer.
  - Perf hooks: khi `opts.debug === true`, ghi frame time (ms) vào ring buffer và expose `container.__tqaPerf = { frames(): number[], info(): { drawCalls, triangles, geometries, textures, programs } }`. Không bật ở chế độ thường; không thêm vào bundle ban đầu.
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` exit 0; unit test: chỉ giảm, không tăng; hysteresis; lựa chọn người dùng tắt auto; context-lost phát event. Không commit; Lead commit.
- Bàn giao: tóm tắt, hằng số chốt, lệnh + exit code, việc chưa làm.
