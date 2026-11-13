# AG-MS-02b — Bàn giao hoàn thiện tượng Milestones (Thợ thi công)

Đã hoàn thành đúng 3 việc theo yêu cầu của Lead trong `tools/review/AG-MS-02b.md`.

---

## 1. Chi tiết thực hiện 3 việc

### 1. Hướng tượng (Orientation)
- **Góc xoay tượng**: `export const STATUE_YAW = 25 * Math.PI / 180;` (~0.4363 rad).
- Toàn bộ tượng (bệ đá thô, thân ngực, vai, cổ, đầu, tóc, kính tròn, mũi, phiến chứng chỉ, hốc lõm và các mảnh đá vỡ lơ lửng) đều xoay $25^\circ$ về phía đường mòn và lệch về hướng người đi tới từ Roots (hướng $t$ giảm, $-Z$).
- **Collider bệ**: Bổ sung thuộc tính `yaw: STATUE_YAW` vào `ZoneCollider` cho bệ đá ($2.2 \times 1.0 \times 2.8\text{ m}$ tại tâm $4.7, 0.5, 0$), đảm bảo hộp collider xoay đồng bộ với bệ đá và giữ khoảng cách an toàn với lòng đường ($x \ge 3.11\text{ m} > 2.6\text{ m}$ `PATH_CLEARANCE`).
- **Điểm tương tác E**: Giữ nguyên hợp đồng tại $(4.7, 1.38, 0)$ trên bệ đá ở tầm mắt người chơi từ lề đường.

### 2. Tách chữ trên phiến chứng chỉ (Typography & Layout)
- **Phân dòng rõ ràng**:
  - `CCNA`: 1 dòng (`["CCNA"]`), chiều cao chữ $0.30\text{ m}$.
  - `VTI DEVOPS`: 2 dòng (`["VTI", "DEVOPS"]`), chiều cao chữ $0.27\text{ m}$.
  - `AWS SAA`: 2 dòng (`["AWS", "SAA"]`), chiều cao chữ $0.27\text{ m}$.
  - `LINUX CEH`: 2 dòng (`["LINUX", "CEH"]`), chiều cao chữ $0.27\text{ m}$.
  - Tất cả chữ đều đạt chiều cao $\ge 0.26\text{ m}$, đọc rõ từ 10 m.
- **Nét chữ & Khoảng cách**:
  - Độ dày nét chữ: $0.040\text{ m}$ (`halfThick = 0.020\text{ m}`), nằm chính xác trong dải yêu cầu $0.035–0.050\text{ m}$, nét chữ thanh thoát, không còn bị lem đặc thành khối đen.
  - Khoảng cách giữa các chữ: $\ge 20\%$ chiều cao chữ (đạt yêu cầu $\ge 18\%$).
- **Kích thước phiến & Lề trong**:
  - Kích thước phiến đá: rộng $1.04\text{ m} \times$ cao $0.74\text{ m} \times$ dày $0.08\text{ m}$.
  - Lề trong phiến $\ge 0.08\text{ m}$ ở cả 4 phía (trên, dưới, trái, phải).
  - Không có chữ nào tràn mép phiến.
  - Chữ tối trên phiến sáng (khắc sâu $0.065\text{ m}$ cho chứng chỉ đạt, $0.012\text{ m}$ cho chứng chỉ dự định).

### 3. Tách hai phiến dự định lơ lửng (AWS SAA & LINUX CEH)
- **Khoảng cách ngang**:
  - Phiến trên (`AWS SAA`, slot 2): tọa độ $v = +0.25, y = 2.73, u = \text{uChest} - 0.95$.
  - Phiến dưới (`LINUX CEH`, slot 3): tọa độ $v = +1.00, y = 1.88, u = \text{uChest} - 0.90$.
  - Khoảng cách phương ngang giữa 2 phiến: $\Delta v = 0.75\text{ m} \ge 0.5\text{ m}$, không còn bị che khuất / chồng lên nhau khi nhìn từ đường tiếp cận.
- **Hướng mặt phiến**: Đặt `floatTilt = 0`, cả 2 phiến đều quay mặt về cùng hướng mặt tượng (vector pháp tuyến hướng về $-U$ xoay $25^\circ$ theo tượng).
- **Khoảng cách tới hốc lõm**: Cả 2 phiến đều cách hốc lõm ngực tương ứng đúng $1.00\text{ m}$ (nằm trong dải $0.9–1.5\text{ m}$).

---

## 2. Kết quả kiểm tra lệnh

1. **`pnpm lint`**:
   - Exit code: `0`
   - Output: Clean (0 errors, 0 warnings).

2. **`pnpm typecheck`**:
   - Exit code: `0` (`tsc --noEmit` hoàn toàn sạch).

3. **`pnpm exec vitest run tests/unit/world/zones/milestones.test.ts`**:
   - Exit code: `0`
   - Kết quả: **41/41 tests passed**.

4. **Kiểm tra hồi quy toàn bộ zone (`tests/unit/world/zones/`)**:
   - Exit code: `0`
   - Kết quả: **227/227 tests passed** trên cả 10 test suite.

5. **Ngân sách kỹ thuật**:
   - Tổng tam giác zone Milestones: **2,639 triangles** (prop triangles: **1,325** $\le$ 2,000; tổng toàn khu $\le$ 6,000).
   - Draw calls: **5 draw calls** (`weathered`, `future`, `ink`, `needles`, `flower`).
   - Thời gian dựng Node real-terrain: **70.7 ms** (ngân sách $\le 450\text{ ms}$).

---

## 3. Các file đã sửa

1. `src/features/world/zones/milestones.ts`: Thực hiện 3 yêu cầu MS-02b (xoay 25°, tách chữ, tách 2 phiến lơ lửng).
2. `tests/unit/world/zones/milestones.test.ts`: Cập nhật assertions về yaw collider bệ, chiều cao chữ $\ge 0.26\text{ m}$ và bổ sung test case chuyên biệt cho MS-02b.
3. `tools/review/AG-MS-02b-handoff.md`: Tài liệu bàn giao.
4. `tools/review/AG-MS-02b.done`: File rỗng đánh dấu hoàn tất nhiệm vụ.

---

## 4. Việc chưa làm

- Lead build WASM và chạy chụp ảnh in-game nghiệm thu MS-02b.
- Không commit, không push theo đúng quy định.
