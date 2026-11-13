# GFX-P5 — vòng 3: Lead đã sửa, Codex kiểm chứng

**Lead đã sửa** `src/features/world/character/baked-appearance.ts` trong W-A: đường dự phòng (Low, adaptive Low, renderer phần mềm, ở xa, world đang build) giờ dùng **vật liệu gốc của main** (`fallbackMaterial = originalMaterial`), bỏ `MeshBasicMaterial`.

Lý do: đổi sang `MeshBasicMaterial` tạo một shader program skinned mới phải compile giữa lúc chơi (rất chậm trên SwiftShader, trùng lúc rider pose/lên xe), và làm nhân vật ở Low thành màu phẳng không ánh sáng — kém hơn main. Đây là nghi phạm chính của timeout lên xe 42/43 (SwiftShader không tải bake, 0 request `/world/character/`, nên upload texture không phải nguyên nhân).

Việc của bạn:
1. Bỏ import thừa `MeshBasicMaterial` (lint đang báo 2 warning) và các import chỉ dùng cho nó.
2. Sửa `tests/unit/world/baked-appearance.test.ts`: 8 ca đang kỳ vọng vật liệu phẳng; đổi thành kỳ vọng **đúng object vật liệu gốc** ở Low/xa/software/pending. Giữ nguyên các ca hoãn tải, chống upload khi transition, lỗi fetch.
3. Được **một lần build**. Chạy e2e world `--workers=2` config mặc định 3 lượt; load-budget; gate.
4. Nếu vẫn 42/43: ghi trace ca fail, đo thời gian từ nhấn E tới `transitioning=false`, và so với chạy cùng spec khi tắt hẳn `installBakedAppearance` (biến môi trường/flag tạm trong lúc đo, không để lại trong mã).
Không sửa test e2e, timeout, logic xe. Không commit.
