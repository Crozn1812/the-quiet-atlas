# RC-21 — Bỏ Vector3 tạm trong selector tán legacy

- Vùng file: `src/features/world/camera.ts`, `tests/unit/world/nearby-crowns.test.ts`, ticket này.
- Mục tiêu: giảm allocation mỗi frame khi camera chọn tán che người; không thay hình, mật độ cây, camera hoặc ngưỡng CPU.
- Sửa: dùng scalar cho tâm cây, ba segment và khoảng cách. Giữ thứ tự cộng/nhân của Vector3, phép chia, `Math.sqrt`, `t > 0 && t < 1`, khoảng cách `< 2.1`, thứ tự slot và early break. API và lọc `Math.hypot ≤ 24 m` giữ nguyên.
- Phép thử: oracle Vector3 độc lập sao từ thuật toán trước RC-21; differential 300 mẫu seed cố định, 64 cây/mẫu, nhiều thang tọa độ, input không đổi; biên radius, endpoint, zero-length, NaN/Infinity, sparse slots, cùng test quality/reorder và biên 24 m có sẵn.
- Regression tìm thấy: test sparse độc lập bắt được vòng lọc RC-18 đọc `.x` ở slot trống, khác `map/filter` cũ vốn bỏ qua slot đó. Thêm guard bỏ slot trống trong `selectNearbyOccludingCrowns`; không đổi tập cây hợp lệ hay thứ tự.
- Trạng thái: Lead chạy unit lượt đầu **FAIL** ở sparse slot (`coverage/rc21-unit.log`), đã thêm guard; unit sau sửa, lint, typecheck **NOT RUN** tại worker, chờ Lead chạy lại. Không kết luận CPU PASS từ tối ưu này.
- Lead kiểm: unit camera/nearby-crowns; strict gate; build; High đủ 8 khu và luma; `cpu-compare` hai lượt mỗi bản ABBA với harness không đổi, trần main +10 ms/s. Không dùng warmup mới để thay FAIL cũ.
