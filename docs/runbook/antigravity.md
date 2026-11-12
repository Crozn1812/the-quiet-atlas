# Antigravity (Gemini) làm nhân công song song

Duy đã cài Antigravity và cấp toàn quyền (2026-11-12). Claude không điều khiển Antigravity trực tiếp được (không có CLI/API trong môi trường này), nên:

1. Claude-Lead tạo worktree riêng `D:/tqa-worktrees/AG-<ticket>` (nhánh `lane/AG-<ticket>`) và ticket trong `docs/tickets/`.
2. Duy mở Antigravity → **Open Folder** đúng worktree đó → dán lời nhắn bên dưới (đổi `<ticket>`).
3. Xong, Duy nhắn Claude "AG-<ticket> xong". Claude build, chạy e2e, xem ảnh, rồi merge hoặc trả lại.

**Từ 2026-11-12 (tối):** Duy cho Claude-Lead dùng computer use, nên bước 2–3 do Lead tự làm:

- Trong Antigravity: biểu tượng thư mục cạnh **Projects** → **Add Folder** → chọn worktree → **Next**. Hộp chọn thư mục của Windows không cho gõ đường dẫn; bấm `New Volume (D:)` → `tqa-worktrees` → thư mục ticket → **Select Folder**.
- Mỗi worktree là một project riêng; hai project chạy song song được. Dán lời nhắn vào ô chat của đúng project rồi gửi.
- Cửa sổ Antigravity có thể nằm ở màn hình phụ (`EGM22F100V`) hoặc màn hình chính.
- Lead chờ file `tools/review/AG-<ticket>-handoff.md` xuất hiện, rồi duyệt như ticket Codex.

## Lời nhắn mẫu để dán vào Antigravity

```
Bạn là thợ thi công cho dự án The Quiet Atlas, làm trong thư mục này (một git worktree riêng).
Đọc và làm đúng: docs/tickets/_common-b2.md, docs/tickets/_graphics-common.md, docs/tickets/R2-tickets.md (mục Chung + mục <ticket>), docs/tickets/R2-playtest-feedback.md.
Luật: chỉ sửa file trong mục "Được sửa"; không push, không commit; không đổi package.json/lockfile; không tải asset không rõ giấy phép (Poly Haven CC0 được, ghi vào assets/LICENSES.csv); chữ trong world chỉ tiếng Anh.
Build: NEXT_TEST_WASM_DIR="C:\Users\PC-LP\AppData\Local\next-swc\wasm\package" NEXT_BUILD_WEBPACK=1 pnpm build
Kiểm: pnpm lint, pnpm typecheck, pnpm test phải exit 0; chụp ảnh khu bằng: node tools/serve-out/index.mjs out --port <cổng ticket> rồi TQA_QUALITY=high node tools/review/ingame-shots.mjs <thư-mục-ảnh> http://127.0.0.1:<cổng> vi
Xong thì viết bàn giao vào tools/review/AG-<ticket>-handoff.md: file đã sửa, kết quả lệnh, đường dẫn ảnh, việc chưa làm.
```

## Quota và model (2026-11-12)

- Quota tính theo nhóm model (ô chọn model → View Usage). Gói Google AI Pro của Duy: `Gemini 4 Argon` hết lượt tuần lúc 22:33 ngày 12/11 (hồi 19/11 21:06).
- Nhóm `Claude and GPT models`: Claude Opus 5.5 đốt hết khung 5 giờ và 84 % lượt tuần chỉ trong vài phút chạy 4 hội thoại. **Không dùng Opus cho việc thường.**
- Model mặc định khi Argon hết: `Gemini 3.8 Flash` (nhóm Gemini Models). Đổi model theo từng hội thoại rồi nhắn "Tiếp tục …".
- Không bật `Enable AI Credit Overages` (tốn tiền, quyền của Duy).
- Sandbox của Antigravity hay chặn `pnpm build` và trình duyệt: Lead build, chụp ảnh, chạy e2e.

## Đang giao

| Worktree | Ticket | Cổng | Trạng thái |
|---|---|---|---|
| `AG-SC-01` | SC-01 bí mật to, huyền bí | 4515 | merged `4d76f65` (2 vòng) |
| `AG-B2-091` | B2-091 tiếng chuông gió | 4521 | merged `7367882` |
| `AG-WS-02` | WS-02 cổng đình làng có lửa | 4518 | merged `9cbbb86` (2 vòng) |
| `AG-HZ-02` | HZ-02 ngồi ghế Horizon | 4519 | review |
| `AG-MS-02` | MS-02 tượng đá Duy đang ghép | 4517 | trả lại vòng 1, đang sửa |
