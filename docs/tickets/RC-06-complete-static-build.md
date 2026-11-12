## RC-06 — Build local có đủ CV và ảnh OG

- Trạng thái: doing; Lead thi công.
- Vùng file: package.json, tools/build.mjs, tools/cv/index.mjs, tools/cv/check-output.mjs, tools/og/index.mjs.
- Lỗi: checkout sạch chạy `pnpm build` chỉ có HTML, các PDF CV và ảnh OG chưa tồn tại; hướng dẫn RC vì vậy dẫn tới 404.
- Sửa: build chạy Next → CV → OG, dùng cùng CV_VERSION_DATE UTC đã cố định; dừng ngay khi một bước thất bại. build:artifacts là alias, tránh sinh hai lần.
- Checker CV yêu cầu HTTP thành công, Content-Type PDF và signature %PDF- của cả hai bản; chỉ có thẻ download không đủ.
- Browser: Edge local; CI dùng Chrome đã có trên runner ubuntu-24.04 (workflow đã cần Chrome cho Lighthouse). PLAYWRIGHT_CHANNEL vẫn ghi đè được. Không tải browser, không gọi cloud.
- Kiểm: build checkout sạch; check:cv; tools-cv/tools-og unit; RC audit GET từng PDF với signature %PDF-; full e2e, bundle, Lighthouse. CI cloud NOT RUN.
