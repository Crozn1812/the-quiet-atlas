## TICKET QF-06 — Chơi piano ở hiên biển bằng bàn phím máy tính

- **Lane / milestone:** L3 + L1 / playtest Duy 20/11.
- **Duy:** "Ở khu vực này sẽ có nút bấm để chơi đàn piano bằng bàn phím, và cá nhân có thể tự chơi piano được luôn thông qua bàn phím của họ."
  - Khu vực: hiên biển có cây piano, hint "E — Piano on the seaside porch". Piano dựng ở `src/features/world/zones/quiet-shore.ts` (`batchedProp("piano", …)`). Tìm điểm tương tác hiện có bằng `grep -rn -i piano src`.
- **Trải nghiệm:**
  1. **Vào chế độ đàn.** Đến gần piano, nhấn E (hoặc click nút "Play piano" trên overlay). Overlay nhỏ hiện ở đáy màn hình, có:
     - hình bàn phím 2 quãng tám, khoảng 15 phím trắng và 10 phím đen;
     - nhãn phím máy tính in trên từng phím;
     - nút "× Close".
  2. **Ánh xạ phím** theo kiểu DAW phổ biến:
     - hàng `A S D F G H J K L ;` là phím trắng (C4 → E5);
     - hàng `W E T Y U O P` là phím đen;
     - `Z` / `X` hạ / nâng một quãng tám.
     - Nhấn giữ thì ngân, nhả thì tắt dần. Bấm nhiều phím cùng lúc thì ra hợp âm.
     - Phím trên hình sáng lên khi được nhấn.
     - Click hoặc chạm chuột vào phím trên hình cũng phát tiếng.
  3. **Âm thanh:** tổng hợp bằng **WebAudio**, không tải file mẫu. Dùng vài oscillator có harmonic, envelope ADSR kiểu piano (attack nhanh, decay dài), thêm một chút reverb ngắn, giới hạn âm lượng.
     - Tôn trọng công tắc Sound của menu. Nếu Sound đang Off thì overlay ghi "Sound is off" kèm nút bật.
  4. **Trong lúc chơi:**
     - W/A/S/D không làm nhân vật di chuyển, camera đứng yên.
     - Esc hoặc "× Close" thoát. Esc chỉ đóng piano, không mở menu (theo quy tắc §6.1: overlay và menu không chồng nhau).
     - Mất focus thì tắt hết nốt đang ngân.
  5. **A11y:** overlay có `role="dialog"` và nhãn. Phím trên hình là `button` có `aria-label` tên nốt. Focus về lại canvas khi đóng.
  6. **Ngôn ngữ:** chữ trong world giữ tiếng Anh (ADR 0016).
- **Được sửa:**
  - file mới `src/features/world/piano/**` (synth, keymap, overlay);
  - `src/features/world/zones/quiet-shore.ts`, chỉ phần đăng ký điểm tương tác;
  - `src/features/world/index.ts`, chỉ phần nối piano: ≤ 30 dòng, ghi rõ trong bàn giao;
  - test mới `tests/unit/world/piano-*.test.ts` và `tests/e2e/world-piano.spec.ts`.
- **Không được sửa:** lockfile, `package.json` (không thêm thư viện), `docs/`, `public/`, phần xe trong `index.ts`.
- **Không lưu gì** vào localStorage, URL hay cookie.
- **Điều kiện xong:**
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` exit 0.
  - Unit test cho keymap (phím → tần số; Z/X đổi quãng tám) và cho logic note on/off.
  - e2e: teleport hoặc đi tới piano, nhấn E thì overlay mở và world paused movement. Nhấn `A`: phím C4 có trạng thái pressed, hook test `window.__tqaPiano?.active` chứa C4. Nhấn W không làm vị trí nhân vật đổi. Esc thì đóng overlay, focus về canvas, menu không mở.
  - Chạy `E2E_PORT=<cổng riêng> pnpm exec playwright test tests/e2e/world-piano.spec.ts tests/e2e/world-content.spec.ts`, dán dòng tổng kết.
- **Bàn giao:** file, output, ảnh overlay, đoạn nối vào `index.ts`. Không commit.
