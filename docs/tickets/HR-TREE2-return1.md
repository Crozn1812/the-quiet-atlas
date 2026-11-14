## HR-TREE2 — trả lại vòng 1 (Lead)

Lead đã rebase W-C lên main mới nhất (có MS-C2, STREAM-C). Hình ảnh rừng tiến bộ rất rõ: cây đa dạng, bạnh rễ, dây leo, sương xa. Lead muốn merge, nhưng **e2e world 41/43 là gate chặn** (ADR 0019 chỉ bỏ trần, không bỏ e2e chức năng):

1. `tests/e2e/world-vehicle.spec.ts:27` — "brake to rest ends upright beside the parked bike" và "E while rolling ends upright beside the parked bike" fail trên SwiftShader (config mặc định, giống CI). Baseline main pass. Tìm nguyên nhân thật (trace trong `test-results/e2e-artifacts/world-vehicle-*`): có thể foliage/collider mới chắn chỗ dựng xe ở First Light, hoặc frame software quá chậm vì cập nhật cây/impostor mỗi frame. Sửa ở phía foliage (vd. không đặt cây/collider trong bán kính chỗ đỗ xe và làn xe chạy; đường Low/software rẻ: impostor tĩnh, không cập nhật gió trên Low; cập nhật cây theo lô/khoảng cách). **Không sửa test, không nâng timeout.**
2. Dây leo hiện là dải xanh chanh phẳng, sáng gắt → màu xanh rêu/nâu thẫm theo ánh sáng tán, có lá nhỏ dọc dây, không phát sáng trong bóng râm.
3. Gốc cây Roots (elf) có rễ xanh phẳng như nhựa: không thuộc ticket này nếu là mesh Roots — chỉ ghi lại.

Xong: gate, build 1 lần, **e2e world 43/43** (`--workers=2`, config mặc định), ảnh trước/sau cùng góc 4 khu. Không commit.
