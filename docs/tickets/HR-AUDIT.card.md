## TICKET HR-AUDIT — Rà soát toàn world tìm thứ còn chưa siêu thực (chỉ chụp ảnh + báo cáo, không sửa code)

- Lane / milestone: QA art / B3 hyper-real.
- Mục tiêu: sau các merge HR (cây, tre, bụi, đá, vách, núi xa, mặt đất, xe), Lead cần **danh sách cụ thể những vật còn low-poly, phẳng, hoạt hình hoặc lỗi hình ở High** để chia ticket sửa cuối.
- Việc:
  1. Build `main` hiện tại 1 lần. Chạy server trên **cổng 4204** (`node tools/serve-out/index.mjs out --port 4204`).
  2. Chụp High 1600×900 trên Edge GPU. Mỗi khu (First Light, Roots, Old Trail, Workshop, Milestones, Horizon, Quiet Shore, Last Postcard) chụp 4 góc: nhìn toàn cảnh, nhìn gần (2–4 m) vật chính, nhìn lên, nhìn từ đường. Thêm cảnh: suối, biển và sóng, đường nhựa/lan can, cầu, biển báo, bảng chứng chỉ, cá, chim, nhân vật và xe khi lái. Dùng hoặc mở rộng `tools/review/*.mjs`; script mới đặt ở `tools/review/hr-audit*.mjs`.
  3. Với mỗi ảnh, ghi trong `tests/review/HR-AUDIT.md`: tên vật, vị trí (khu + tọa độ), lỗi (low-poly có mặt phẳng lộ / texture kéo dãn / màu hoạt hình / alpha răng cưa / vật lơ lửng / xuyên nhau / lặp ô / ánh sáng sai), mức độ (cao/vừa/thấp), và file mã hoặc asset nghi là nguồn. Gom thành bảng xếp theo mức độ. **Không bịa lỗi**: chỉ ghi cái thấy trong ảnh và dẫn ảnh.
  4. Ghi FPS High của từng góc (đo khi máy không có tác vụ nặng khác của chính mình).
- Được sửa: `tools/review/hr-audit*.mjs`, `tests/review/HR-AUDIT.md`, `test-results/hr-audit/**`. **Không sửa** `src/**`, `public/**`, `assets/**`.
- Xong khi: có `tests/review/HR-AUDIT.md` với bảng lỗi kèm đường dẫn ảnh, ít nhất 40 ảnh, và trang `test-results/hr-audit/index.html` xem nhanh. `pnpm lint` + `pnpm typecheck` PASS. Không commit.

**Lead đã thấy (15/11 08:30), ghi vào bảng và tìm nguồn:** ở Horizon nhìn về phía suối, sườn đồi xa bên trái có các **lỗ tròn thủng nhìn xuyên ra trời** (ảnh `D:/tqa-worktrees/W-C/tmp/hr-sky/return1/comparison-horizon.webp`, hàng 3, cả MAIN lẫn HR-SKY). Có thể do mesh lớp xa (HR-FAR), alpha của impostor, hoặc culling địa hình.
Dùng cổng E2E/serve riêng của slot (`_common-b2`).
