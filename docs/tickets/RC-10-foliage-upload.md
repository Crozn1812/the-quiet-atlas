## RC-10 — Không tải lại crownAlpha khi Float32 không đổi
- Trạng thái: review (chưa commit/merge).
- Vùng file: src/features/world/crown-fade.ts; tests/unit/world/foliage-light.test.ts.
- Mục tiêu: giảm upload GPU trên main thread khi camera RC-09 nhìn đủ tán R1; không đổi opacity, shader, chất lượng hay hình học.
- Lỗi hiệu năng: mỗi frame mọi batch crownAlpha đều needsUpdate, kể cả giá trị giữ nguyên 1 hoặc đã ổn định ở đích.
- Sửa: giữ nguyên phép tính và ghi Float32; chỉ đánh needsUpdate khi ít nhất một Float32 lưu trữ thực sự đổi.
- Phép thử: so từng mẫu với công thức cũ qua fade-in/out, paused dt0, hai slot, count0, tái sử dụng slot và trạng thái đã ổn định. Attribute.version tăng đúng khi có dữ liệu đổi.
- Lead chạy gate, ảnh High đủ8/luma và cpu-compare 2lượt mỗi bản sau tích hợp. Chưa benchmark nên chưa kết luận PASS hiệu năng.

- Đã chạy: Vitest foliage-light + foliage 22/22 PASS; ESLint hai file 0 warning exit 0; git diff --check exit 0. Không build/browser/benchmark trong worker.
