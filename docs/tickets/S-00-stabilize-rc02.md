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

### Vòng 2 (Lead)

- Unit **PASS**: gate 1761. Lead build được bằng `NEXT_TEST_WASM_DIR=<…\next-swc\wasm\package> NEXT_BUILD_WEBPACK=1 pnpm build`, vì Windows Application Control chặn file SWC native và sandbox của Codex không build được.
- Lead chạy e2e world (`--workers=2`): **12 FAIL**, gồm `world-input` Q21 (7), `world-content` Roots, `world-intro` (Skip "Bỏ qua"), `world-journal` (tên "Sổ Atlas") và các test khác. Lý do: chữ trong world đã là tiếng Anh theo yêu cầu của Duy → **ADR 0016**.
- Việc cần làm: cập nhật các e2e này theo ADR 0016 (trong world chỉ tiếng Anh; ngoài world theo trang; đổi ngôn ngữ trong Menu vẫn đổi URL và trang). Giữ các khẳng định không liên quan tới ngôn ngữ (cùng canvas, vị trí giữ nguyên, 0 lỗi console, axe). Kiểm thêm Roots overlay theo nội dung kỹ năng mới. Không xoá test.
- Codex không chạy được e2e trong sandbox; sửa xong ghi danh sách spec, Lead chạy lại.
