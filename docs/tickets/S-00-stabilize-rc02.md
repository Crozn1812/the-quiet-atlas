## TICKET S-00: làm xanh bản dở RC-02 (trước vòng sửa 2)

- Worktree `D:/tqa-worktrees/RC-02`, nhánh `lane/RC-02`, tách từ `rc-02-base` (`f0175ba`): RC-01 + phần Codex sửa dở theo góp ý vòng 1 (nội dung CV/portfolio, sơ đồ kiến trúc, Gmail, chữ trên bảng, chân chống xe, suối/đường/lan can theo bề mặt, cây cổ thụ, tia nắng…).
- **Trước tiên** gộp main mới nhất. Lead chạy sẵn `git merge main` nếu sandbox không ghi được `.git`; khi đó chỉ sửa nội dung file.
- Gate hiện **FAIL 32 test**, gồm `dressing.test.ts`, `ending-estuary.test.ts`, `railing.test.ts`, `river-source.test.ts` và các test khác. Với từng test:
  - nếu test sai vì hình học đã cố ý đổi (suối hạ theo bề mặt, đường bám bề mặt) thì cập nhật test, ghi lý do trong comment;
  - nếu là lỗi thật thì sửa code.
  Không xoá test, không nới ngưỡng hiệu năng.
- **Giữ nguyên** những gì RD-01 đã có: E "Look out to sea" tựa lan can phải hoạt động (Duy báo bản dở không còn); e2e `world-railing.spec.ts` phải PASS.
- Được sửa: mọi file `src/`, `tests/`, `tools/` cần để xanh; không đổi `package.json`/lockfile.
- Điều kiện xong:
  - `bash tools/lead/gate.sh .` exit 0;
  - `pnpm exec playwright test --workers=2` các spec world exit 0;
  - `TQA_QUALITY=high node tools/review/ingame-shots.mjs` đủ 8 khu, kèm `luma.mjs`.
  Dán kết quả vào bàn giao.
