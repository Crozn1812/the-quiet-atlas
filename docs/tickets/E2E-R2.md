## TICKET E2E-R2 — cập nhật e2e portfolio theo giao diện vòng 1 (cổng 4521)

- Mục tiêu: full e2e trên main (build d43f9b1) có 18 test portfolio đỏ vì test còn mô tả giao diện cũ. Giao diện hiện tại là quyết định của Duy ở vòng 1 (S-00, f42943b), **không sửa giao diện**, chỉ sửa test cho khớp, giữ nguyên ý kiểm tra (a11y, reflow, không lỗi console, link tới được).
- Giao diện hiện tại (đọc từ `out/` của main):
  - Welcome + HUD: link "Contact & CV" (VI ngoài world: "Liên hệ & CV") trỏ `/<locale>/quick/#contact`, không còn link HUD `/cv/` tên "CV".
  - Email mở Gmail compose (`https://mail.google.com/mail/?view=cm…`), không còn `mailto:`.
  - Quick Portfolio: h2 là Experience, Education, Featured projects, Contact; mục CV nằm trong Contact (có link `/cv/`), không còn h2 "CV".
- Test đỏ cần sửa (đều trong tests/e2e):
  - `welcome.spec.ts` T01 en/vi (CV link phải là /cv/).
  - `full-viewport.spec.ts` L3-008 #1 en/vi, #2, #3 (HUD link "CV").
  - `html-fallback.spec.ts` T02-a 4 trang (mailto).
  - `a11y-keyboard.spec.ts` T11 reflow 320/640 × en, vi, en/quick, vi/quick (h2 CV; 4 cái timeout ở scrollIntoView — tìm phần tử nó chờ và sửa).
- Được sửa: `tests/e2e/welcome.spec.ts`, `full-viewport.spec.ts`, `html-fallback.spec.ts`, `a11y-keyboard.spec.ts`, helper e2e liên quan nếu cần. Không sửa `src/`.
- Điều kiện xong: build WASM một lần, serve `out` ở cổng 4521, `E2E_PORT=4521 pnpm exec playwright test welcome full-viewport html-fallback a11y-keyboard --workers=2` exit 0; lint + typecheck exit 0.
- Bàn giao: mỗi test sửa gì (cũ → mới), output lệnh.
