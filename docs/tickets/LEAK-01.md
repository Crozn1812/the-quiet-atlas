## TICKET LEAK-01 — check:leaks FAIL trên main + Zod lọt vào chunk client

- Bối cảnh: kiểm cả đợt trên main `df0dd47` (`docs/showcase/36-r2/checks/leaks-df0dd47.txt`): `pnpm check:leaks` báo 2 lỗi R4 internal-domain ở `out/_next/static/chunks/964.*.js` (dòng 3 và 55). Cả hai là **dương tính giả**: mã Zod đã minify (`t.local`, tùy chọn datetime). Chunk này không được nạp bởi trang HTML nào lúc đầu (chunk lazy).
- Vấn đề thật: Zod không được nằm trong JS client (L1-006 đã loại ra một lần, 36,9 KB → 4,7 KB). Tìm module nào kéo Zod vào chunk lazy (nghi UI-05 `4e52f79` hoặc overlay world-content) và bỏ: dữ liệu đã validate lúc build, client chỉ cần type.
- Nếu Zod bỏ được: check:leaks tự hết lỗi. **Không** nới regex của scan-leaks trừ khi Zod buộc phải ở lại; khi đó chỉ bỏ qua đúng mẫu thuộc tính JS `.local` đứng sau một định danh (`[a-z]\.local\b` trong file `.js` của `_next/static`), kèm test cho cả trường hợp domain thật `foo.local` vẫn bị bắt.
- Được sửa: `src/components/portfolio/**`, `src/content/**` (chỉ chỗ import), `tools/scan-leaks/**` (chỉ khi cần), test unit tương ứng.
- Điều kiện xong: build một lần (lệnh WASM), `pnpm check:leaks` và `pnpm check:bundle` exit 0; dán kích thước chunk có Zod trước/sau (`grep -l "precision" out/_next/static/chunks/*.js` + `wc -c`); `bash tools/lead/gate.sh .` → GATE PASS. Không commit.
