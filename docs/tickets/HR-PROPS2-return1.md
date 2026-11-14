## HR-PROPS2 — trả lại vòng 1 (Lead xem `compare-*-high.png`)

Đạt: cây nón low-poly ở Horizon đã thay; cỏ nhọn đen ở Milestones/Old Trail không còn; lá khô đã nhỏ lại. Còn lại:

1. **Quiet Shore (và Last Postcard nếu dùng chung cây):** cây ven biển mới **trơ cành, gần như không lá**, nhìn như cây chết hoặc khung dây. Ven biển miền Trung là **phi lao**: thân xám nâu bong vảy, tán dày dạng chùm kim rủ xuống mềm, khối tán xanh xám đậm, đứng thành hàng chắn gió. Thêm dương/keo lá tràm xen kẽ. Tán phải che được bầu trời phía sau như cây thật.
2. **Lá khô First Light:** vài lá nâu sẫm có vẻ **lơ lửng trên mặt đất** (`compare-first-light-litter-high.png` bên phải, phía xa). Mọi lá phải nằm sát nền, theo pháp tuyến địa hình (offset < 1 cm), có bóng tiếp xúc nhẹ.
3. **FPS 51–57 ở vài lượt đo:** tìm khu nào tụt, gom instancing hoặc giảm mật độ ở rìa tầm nhìn, đo lại để đạt High ≥ 60 ổn định 3 lượt liên tiếp.
4. `check-budgets.mjs` (nhận `roots-`) **đã có trên main**; bỏ thay đổi của bạn ở file đó để khỏi xung đột.

Điều kiện xong giữ như card: gate PASS; build 1 lần **sau thay đổi cuối**; e2e world `--workers=2` 43/43 trên build đó; ảnh High trước/sau 8 khu. Không commit.
