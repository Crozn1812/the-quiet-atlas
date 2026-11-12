# RC-21 — Bỏ Vector3 tạm trong selector tán legacy

- Vùng file: `src/features/world/camera.ts`, `tests/unit/world/nearby-crowns.test.ts`, ticket này.
- Mục tiêu: giảm allocation mỗi frame khi camera chọn tán che người; không thay hình, mật độ cây, camera hoặc ngưỡng CPU.
- Sửa: dùng scalar cho tâm cây, ba segment và khoảng cách. Giữ thứ tự cộng/nhân của Vector3, phép chia, `Math.sqrt`, `t > 0 && t < 1`, khoảng cách `< 2.1`, thứ tự slot và early break. API và lọc `Math.hypot ≤ 24 m` giữ nguyên.
- Phép thử: oracle Vector3 độc lập sao từ thuật toán trước RC-21; differential 300 mẫu seed cố định, 64 cây/mẫu, nhiều thang tọa độ, input không đổi; biên radius, endpoint, zero-length, NaN/Infinity, sparse slots, cùng test quality/reorder và biên 24 m có sẵn.
- Regression tìm thấy: test sparse độc lập bắt được vòng lọc RC-18 đọc `.x` ở slot trống, khác `map/filter` cũ vốn bỏ qua slot đó. Thêm guard bỏ slot trống trong `selectNearbyOccludingCrowns`; không đổi tập cây hợp lệ hay thứ tự.
- Trạng thái: commit `ccd9145`. Unit đầu **FAIL** ở sparse slot, giữ [log](../showcase/35-rc/checks/rc21-unit-first-fail.txt); sau guard unit liên quan **5/5 PASS**, [log](../showcase/35-rc/checks/rc21-unit-fixed.txt). Build và strict gate lint/typecheck/unit **1755/1755 PASS**, [gate](../showcase/35-rc/checks/gate-ccd9145.txt).
- CPU harness gốc ABBA: **FAIL** cả ba khu. Delta Script/Task so main: First Light +26/+27,5; Roots +15,5/+17,5; Workshop +20,5/+22 ms/s. Hai lượt mỗi bản giữ ở `docs/showcase/35-rc/perf/cpu-ccd9145-*.txt`. Không dùng diagnostic warm-up 15 s thay gate 1,5 s.
- Render: bộ 8 High `after-ccd9145/` luma giữ nguyên, Lead chưa mở từng ảnh; bộ cinematic 15 ảnh capture PASS 0 lỗi JavaScript, Lead mở intro sau kết thúc và ending 0,5/26 s/sau kết. Chưa thay duyệt render RC cuối.
- Lead kiểm: unit camera/nearby-crowns; strict gate; build; High đủ 8 khu và luma; `cpu-compare` hai lượt mỗi bản ABBA với harness không đổi, trần main +10 ms/s. Không dùng warmup mới để thay FAIL cũ.
