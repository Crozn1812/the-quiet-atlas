## HR-SKY — trả lại vòng 1 (Lead xem `tmp/hr-sky/comparison-horizon.webp`)

Mây tích nhiều tầng ở Horizon đã đạt hướng. Còn lại:

1. **Mây hoàng hôn sai màu** (quiet-shore AFTER): trời chiều tím cam, nhưng mây vẫn **trắng xám như giữa trưa**, trông như dán lên. Mây phải nhận màu từ mặt trời và bầu trời theo giờ của từng khu: mặt hướng nắng cam vàng ấm, đáy và mặt khuất tím xám, rìa sáng chói (silver lining) khi ngược sáng. Kiểm tra mọi khu có giờ khác nhau (bình minh First Light, chiều Quiet Shore/Last Postcard).
2. **Mảng đa giác xanh lớn phẳng ở tán First Light** (first-light AFTER, nửa trên ảnh): không có trong ảnh BEFORE. Tìm nguyên nhân: sky/fog/env mới làm lộ impostor/fallback tán, hoặc thứ tự vẽ/depth của dome che sai, hoặc do khác base. Nếu do thay đổi của ticket này thì sửa. Nếu không, chứng minh bằng ảnh `main` không có thay đổi sky ở cùng góc, và ghi vào bàn giao.
3. **Ảnh trước/sau phải cùng base.** Rebase đã được Lead làm: `main` hiện có HR-PROPS2/HR-GROUND/HR-FAR. Chụp lại BEFORE từ `main` sạch, AFTER từ worktree, cùng góc.
4. Build ở thư mục gốc báo EPERM: **dùng cổng E2E riêng 4202** (xem `_common-b2`), tắt server của chính mình trước khi build lại. Không build ra `tmp/`.

Điều kiện xong giữ như card. Không commit.
