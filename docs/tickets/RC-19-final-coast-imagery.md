## RC-19 — Đồng bộ ảnh ven biển với shader đã sửa của RC

- Vùng: public/zones/quiet-shore.webp, last-postcard.webp; public/welcome/; assets/LICENSES.csv; tools/review/zone-content-shots.mjs.
- RC-02 đã chụp đủ 8 ảnh R1. Không làm lại 6 ảnh không chịu ảnh hưởng; chỉ cập nhật hai khu biển và hero sau sửa shoreline RC-14.
- Capture `TQA_ZONES=quiet-shore,last-postcard` qua công cụ sẵn có. License chỉ cập nhật các zone có trong manifest thật; trước đây chạy filter vẫn đổi ngày cả 8 dòng dù chưa chụp 6 khu khác.
- Giữ góc chụp/độ phân giải/ngân sách đã chọn; hero candidate0. Không thêm asset bên ngoài.
- Kiểm: xem hai postcard/hero sau, check:licenses, build, load-budget và High8/luma sau cùng. Trạng thái doing; chưa ghi PASS trước khi chạy.
