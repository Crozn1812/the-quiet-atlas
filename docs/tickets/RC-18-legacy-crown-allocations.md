## RC-18 — Giảm object tạm khi lọc tán legacy mỗi frame

- Vùng: src/features/world/camera.ts, scene/compose.ts; tests/unit/world/nearby-crowns.test.ts.
- Mục tiêu: giảm allocation/GC tại Workshop mà giữ cùng cây, phép Math.hypot ≤24 m, ba sight segment và thứ tự slot sau quality/streaming.
- Thay chuỗi map(object/tree/id) → filter → map(tree) bằng một loop ghi hai array tree/slot, rồi dùng nguyên selector cũ và remap slot. Không đổi hình, camera, ngưỡng fade hoặc mật độ.
- Test differential so nguyên thuật toán trước trên 185 cây, nhiều camera/height, count tăng/giảm, thứ tự đảo và biên 24 m ±1e-10; khẳng định hit không rỗng và đúng slot qua lỗ lọc.
- Trạng thái: review; unit/gate/CPU/render cần Lead chạy. Không kết luận CPU PASS từ review.
