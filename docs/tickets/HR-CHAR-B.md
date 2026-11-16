## TICKET HR-CHAR-B — tóc, áo, tay nắm ghi đông
- Lane / milestone: L3 world / B3 đợt siêu thực (ADR 0019). Nối tiếp HR-CHAR (8bd2ae5).
- Worktree: slot W-C, E2E_PORT=4203.
- Ảnh hiện trạng: D:/tqa-worktrees/evidence/HR-CHAR/hr-char-evidence/ (studio/after-*.png, world/after-*.png).
- Mục tiêu:
  1. Tóc: hết các sợi lởm chởm, răng cưa bay quanh đầu. Mảng tóc có độ dày, sợi mảnh, mép tóc mềm (alpha-to-coverage hoặc hair card có sort đúng), không nhấp nháy khi di chuyển.
  2. Áo trơn: nếp áo tự nhiên theo trọng lực và theo vai/khuỷu, không nhăn rối ở bụng; vải cotton có texture sợi mịn. Không logo.
  3. Tay khi lái xe: các ngón nắm quanh tay nắm ghi đông, cổ tay thẳng hàng với tay lái, không xuyên mesh.
- Giữ: mặt chung chung MakeHuman, không dựa trên ảnh Duy (taste.md §5.6); giấy phép CC0; LICENSES.csv cho mọi file mới.
- Được sửa: `src/features/world/character/`, `tools/assets/blender/hr-char*`, `public/world/character/`, `assets/LICENSES.csv`, test unit liên quan.
- Không được sửa: water/, shore/, fauna/, terrain/, vehicle/ (trừ khi bắt buộc cho tư thế tay, báo trước trong bàn giao), lockfile, docs/.
- Điều kiện xong: lint, typecheck, vitest, build, `E2E_PORT=4203 pnpm exec playwright test tests/e2e/world --workers=2`, check:assets, check:licenses. Ảnh Edge GPU High trước/sau: cận mặt, toàn thân, đang đi, đang lái, cận tay trên ghi đông, ở `test-results/hr-char-b/`.
- Bàn giao: tóm tắt, lệnh + output thật, ảnh, việc chưa làm. Không commit.
