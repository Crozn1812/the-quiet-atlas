# Kiểm tra giữa đợt HR — main 9293aa1 (14/11 19:30, máy rảnh, Edge SwiftShader)

| Kiểm | Kết quả | Bằng chứng |
|---|---|---|
| Build WASM/webpack | PASS (exit 0) | build-9293aa1.txt |
| Full e2e, mọi suite, 4 worker | **PASS 158/158** (5,0 phút) | e2e-full-9293aa1.txt |
| check:bundle | PASS | check-bundle-9293aa1.txt |
| check:leaks | PASS | check-leaks-9293aa1.txt |
| check:licenses | PASS | check-licenses-9293aa1.txt |
| check:cv | PASS | check-cv-9293aa1.txt |
| check:assets | **FAIL** lần đầu: chỉ lỗi quy ước tên (`hr-tree-*`, `cliff/cliff-*` không khớp `<type>-<name>.glb`); mọi GLB/KTX2 đọc được. Sửa script nhận tiền tố `hr-` và loại `cliff` → **PASS** | check-assets-9293aa1.txt, check-assets-9293aa1-after-naming-fix.txt |

World tổng **85.712.239 byte** (báo cáo, ADR 0019). Đây chưa phải gate cuối: HR-LIGHT, HR-ROOTS-SIGN, PERF-HR còn đang làm. Load/Lighthouse/CPU ABBA: **NOT RUN**.
