## TICKET B2-211: kiểm tra "không lạc bất hợp lý" (B2 công đoạn 5)

- Spec: B2 gate "hành trình 5–7 phút, không lạc bất hợp lý" (§12 bảng mốc). §7.1: 8 khu bám trục suối.
- Được sửa: tạo `tools/wayfinding/audit.mjs` hoặc `tests/unit/world/wayfinding.test.ts` (Node, không trình duyệt) **và** `docs/playtest/b2-journey.md` (phiếu playtest cho người thật; ngoại lệ `_common-b2`: được tạo file trong `docs/playtest/`). Không sửa `src/`.

### Việc

1. **Kiểm định hướng tự động (Node):** dọc tuyến, mỗi 5 m, từ độ cao mắt 1,7 m trên đường, kiểm có nhìn thấy ít nhất một trong các mốc phía trước trong 80 m không: tâm khu tiếp theo (cao 2 m), cột chỉ đường/mốc gỗ, cầu, tuabin Horizon, biển (sau t 0,76). Dùng raycast CPU với terrain (`worldHeight`) và thân cây (scatter + collider). Báo cáo các đoạn liên tục > 60 m không thấy mốc nào ("đoạn mù"), kèm t và toạ độ.
   - Test: in bảng đoạn mù; **fail nếu có đoạn mù > 120 m**; đoạn 60–120 m chỉ cảnh báo trong báo cáo (Lead quyết thêm mốc).
2. **Kiểm rẽ nhầm:** các chỗ đường đi gần đường khác/khúc suối có thể nhầm (2 nhánh cách < 25 m) → liệt kê.
3. **Phiếu playtest** `docs/playtest/b2-journey.md` (tiếng Việt, ngắn): người chơi lần đầu, không hướng dẫn trước; ghi thời gian tới từng khu, mỗi lần dừng > 10 s vì không biết đi đâu (vị trí, lý do), có dùng Atlas Journal/teleport không, cảm nhận. Mẫu bảng cho 3 người chơi. Tiêu chí "không lạc bất hợp lý": không ai dừng > 30 s vì không biết đường; ≤ 1 lần quay đầu nhầm hướng mỗi người.

### Điều kiện xong

- `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0; dán bảng đoạn mù vào bàn giao.
