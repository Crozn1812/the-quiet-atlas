## RC-15 — Bỏ phép ray tán cây chắc chắn nằm ngoài sight segment

- Vùng file: `src/features/world/foliage/instances.ts`, `src/features/world/crown-fade.ts`, `tests/unit/world/foliage.test.ts`.
- Trạng thái: review; chưa commit/merge, chưa đo CPU hoặc duyệt render.
- Mục tiêu: giảm CPU sau khi RC-09 giữ camera ở khoảng cách dùng được, giữ nguyên hình học, chất lượng, góc nhìn và kết quả fade.
- RC-11 mới tránh đảo ma trận; selector vẫn chạy ba phép ray local cho mọi instance của batch gần camera, kể cả phần lớn cây nằm ngoài đoạn nhìn ngắn.
- Sửa: cache AABB world của từng instance cùng inverse; kiểm overlap với AABB bao cả ba đoạn camera→feet/torso/head trước khi chạy nguyên phép local ray cũ. AABB có biên nới nhỏ theo tọa độ để chỉ loại miss rõ ràng ở mặt chung do round-off. Kết quả hit vẫn do phép ray gốc quyết định.
- Invalidation giữ identity/version/count/matrixWorld và phát hiện ghi instance CPU trực tiếp như RC-11; thêm kiểm tọa độ geometry.boundingBox (kể cả thay object hoặc mở rộng bounds authored/deformed), không đảo lại inverse chỉ vì bounds đổi.
- Hoist hệ số `1 - exp(-10 * dt)` ra ngoài loop alpha; phép tính/Float32 ghi từng slot giữ nguyên, không thêm ngưỡng fade hay bỏ slot.
- Phép thử: đối chiếu selector gốc với broadphase trên 12 instance có scale/rotation/shear, parent affine, start-inside/endpoint/zero camera-player distance, bounds grow/shrink/replacement, CPU matrix edit và count. Spy chứng minh cây ở xa không gọi local intersectBox. Test RC-10 tiếp tục kiểm từng mẫu Float32 và upload version so công thức gốc.
- Đã chạy: hai file unit foliage + foliage-light **24/24 PASS**, Vitest exit 0; ESLint ba file sửa 0 warning exit 0; `pnpm typecheck` exit 0.
- Lead cần build, hai lượt CPU cô lập, High đủ tám khu + luma và strict gate. Unit không chứng minh đã đạt trần CPU +10 ms/s.
