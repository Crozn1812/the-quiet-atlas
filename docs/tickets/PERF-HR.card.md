## TICKET PERF-HR — High siêu thực mà vẫn mượt (Lead)

- Lane / milestone: L3 World / B3 hyper-real.
- Bối cảnh: sau HR-TREE2 + HR-STREAMBED + HR-CLIFF + HR-BIRDS, bàn giao HR-BIRDS đo toàn cảnh High trên **RTX 3060: 19,4 FPS, ~380 draw/frame, ~5,96 triệu tam giác/frame** (gồm shadow + post), Low 99,9 FPS. Duy đã bỏ **trần** (ADR 0019), nhưng HR-common vẫn yêu cầu "để đẹp mà vẫn mượt": 19 FPS trên GPU rời là không chơi được.
- Mục tiêu: High **≥ 60 FPS trên RTX 3060** ở 1600×900 (và ghi số ở 1920×1080) tại 4 góc khó nhất (rừng First Light, Roots, Workshop, bờ Quiet Shore), **không giảm chất lượng nhìn thấy được ở khoảng cách chơi**. Balanced ≥ 60 FPS dễ hơn. Low giữ nguyên.
- Việc:
  1. Profile trước (Spector.js hoặc đếm lời gọi WebGL + `renderer.info` từng pass): ai chiếm tam giác/draw — shadow pass có vẽ lại toàn bộ cây LOD0? impostor có thật sự dùng ở xa? sỏi/cỏ/chim instanced chưa? Ghi bảng trước.
  2. Sửa theo số đo, ví dụ: shadow chỉ cho vật gần (cascade/khoảng cách, impostor không đổ bóng thời gian thực), LOD0 chỉ trong ~25–40 m, LOD1 tới ~80 m, impostor xa hơn, hysteresis; gộp draw (InstancedMesh/BatchedMesh theo biến thể); cull theo frustum + khoảng cách; giảm overdraw lá alpha (alpha-to-coverage/alphaTest đúng, sắp xếp); hậu kỳ ở độ phân giải hợp lý.
  3. Ảnh High **trước/sau cùng góc** phải giống nhau ở khoảng cách chơi (Lead so từng ảnh).
- Được sửa: `src/features/world/foliage/**`, `water/streambed*.ts`, `fauna/**`, `zones/first-light-cliff*.ts`, `post/**`, `render*`/`quality*` (chỉ phần LOD/shadow/cull), test. Không sửa nội dung, không đổi asset nguồn trừ khi thêm LOD.
- Không được sửa: `src/content/**`, lockfile, `package.json`, docs ngoài bàn giao.
- Xong: bảng trước/sau (FPS, draw, tam giác, theo pass) 4 góc × High/Balanced/Low trên RTX 3060 (ghi rõ GPU, dừng tải khác khi đo); gate PASS; build 1 lần; e2e world `--workers=2` 43/43; ảnh trước/sau. Không commit.
