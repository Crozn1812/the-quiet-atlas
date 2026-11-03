## TICKET L3-006 — e2e world: menu, pause, quality (ADR 0008), Q13, Q21 phần đổi trang

- Trạng thái: **Done — merged vào main** (2026-11-04)
- Lane / milestone: L3 / B1
- Mục tiêu: các hành vi world đã merge (menu Esc, pause, quality, return to path, camera input bị chặn khi pause) có e2e tự động.
- Spec liên quan: §6.2, §6.4, §13 T07 (phần menu), Q13, Q21; ADR 0008
- Được sửa: `tests/e2e/` (file mới `world-menu.spec.ts`, `world-input.spec.ts`; sửa `helpers.ts` nếu cần)
- Không được sửa: mọi thứ khác (đặc biệt `src/`, `package.json`). Lỗi sản phẩm → `test.fail()` + báo Lead.
- Phép thử (Edge, SwiftShader như `world.spec.ts`, viewport 1366×800):
  1. Enter World → Esc mở menu: `dialog[open]`, `data-world-paused="true"`, focus ở tiêu đề; Tab/Shift+Tab không thoát dialog; Esc đóng → `paused="false"`, focus về vùng world.
  2. Đổi quality qua `<select>` → `data-world-quality` đổi; **cùng một phần tử canvas** trước/sau (không remount).
  3. Nút menu ở góc mở menu; X đóng, focus trả về nút menu.
  4. Return to path: dispatch qua nút → menu đóng, world không lỗi console.
  5. Q13 (phần tự động hóa được): khi focus trong `select` của menu, gõ W/A/S/D/E không đóng menu và không làm `paused` đổi.
  6. Q21: điều hướng sang `/en/quick/` từ menu rồi `goBack()` → trang Welcome ở trạng thái ban đầu (`data-app-mode` ≠ `world`, không có canvas) — bfcache/reload reset phiên.
  7. Đổi ngôn ngữ trong world: NOT RUN (chưa có tính năng) — ghi rõ.
  - Lưu ý: headless không có focus cửa sổ nên world có thể ở `windowBlur` pause; kiểm hành vi menu dựa trên lý do `overlay` (ví dụ so sánh trước/sau mở menu) hoặc chạy headed nếu cần — ghi rõ chế độ.
- Điều kiện xong: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` exit 0; một commit.
- Bàn giao: kết quả từng phép thử, chế độ headless/headed, lỗi sản phẩm, lệnh + exit code.
