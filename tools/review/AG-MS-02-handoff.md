# AG-MS-02 — Bàn giao vòng 2 (Thợ thi công)

Đã hoàn thành sửa toàn bộ 6 điểm theo yêu cầu của Lead trong `tools/review/AG-MS-02-return-1.md`.

---

## 1. Các file đã sửa

- `src/features/world/zones/milestones.ts`:
  - **Scale 6–8 m**: Nâng chiều cao tượng bán thân chân dung Duy lên **~7.07 m** (tính cả bệ đá bậc thang), mở rộng sải vai lên 4.8 m, tạo điểm nhấn cảnh quan dễ đọc từ cự ly 30 m trên đường mòn.
  - **Silhouette chân dung rõ ràng (R1)**: Bệ đá đa diện phẳng (0–1.6 m) -> ngực và vai áo rộng (1.6–4.35 m) -> cổ khối phân tách rõ (4.22–4.90 m) -> đầu chân dung planar (4.82–7.07 m) với cằm, sống mũi, nụ cười tinh tế, cặp kính tròn đặc trưng đường kính 0.58 m và 5 khối tóc lớn character.
  - **Vật liệu đá xám sáng ấm & bóng xanh tím**: Sử dụng tone đá ấm `WEATHERED_BASE_HEX` (luma ~0.50–0.56) và `FUTURE_BASE_HEX` (luma ~0.65), kết hợp `preset: STYLE_PRESETS.A` cùng `shadowTint` (`indigo` + `skyLow`) giúp bóng đổ không bị tối đen kịt. Đảm bảo outward normal winding khi đối xứng qua bờ bên kia (`side < 0`).
  - **Trạng thái "Đang ghép"**:
    - 2 chứng chỉ đã đạt (`CCNA`, `VTI DEVOPS`) khớp trực tiếp trên ngực/vai với chữ tiếng Anh khắc sâu (`carveDepth = 0.065 m`), cỡ chữ lớn (CCNA cao 0.50 m, VTI DEVOPS cao 0.40 m), đọc rõ từ 10 m.
    - Tạo các khoảng trống nhìn xuyên qua (`see-through hollow gaps`) ở ngực/vai trái và hạ sườn phải.
    - 7 mảnh đá vỡ (`stone-shard`) lơ lửng quanh tượng theo quỹ đạo hội tụ về các khoảng trống; loại bỏ toàn bộ các tảng đá rải rác dưới đất cách xa tượng.
  - **Chứng chỉ dự định (`AWS SAA`, `LINUX CEH`)**: 2 khối đá màu nhạt (`future`) lơ lửng ngay cạnh khoảng trống tương ứng, vết khắc chữ nông (`carveDepth = 0.012 m`).
  - **Collider & Vị trí bệ**: Giữ collider bệ tượng tại `x = 4.7 m, z = 0` và collider thân thông tại `x = 15 m, z = 2.7 m`; mép tượng cách tim đường mòn > 3.4 m (vượt xa `PATH_CLEARANCE = 2.6 m`); interact target nằm trên bệ trong tầm tương tác phím E từ lề đường.

- `tests/unit/world/zones/milestones.test.ts`:
  - Cập nhật toàn bộ các bài test phù hợp với tượng bán thân 7.07 m, 2 collider (bệ + thân thông), cỡ chữ >= 0.35 m, độ luma 0.45–0.60, các khoảng trống nhìn xuyên qua và các mảnh lơ lửng.

---

## 2. Kết quả kiểm tra lệnh

1. **`pnpm lint`**:
   - Exit code: `0`
   - Output: Clean (0 errors, 0 warnings).

2. **`pnpm typecheck`**:
   - Exit code: `0` (`tsc --noEmit` clean).

3. **`pnpm exec vitest run tests/unit/world/zones/milestones.test.ts tests/unit/world/zones/outdoor-direction-a.test.ts tests/unit/world/zones-wiring.test.ts`**:
   - Exit code: `0`
   - Kết quả: **55/55 tests passed** (bao gồm test click & interaction cho Milestones trong `zones-wiring.test.ts`).

4. **Kiểm tra hồi quy toàn bộ zone (`tests/unit/world/zones/`)**:
   - Exit code: `0`
   - Kết quả: **224/224 tests passed** trên cả 10 test suite.

5. **Ngân sách kỹ thuật (seed 104)**:
   - Tổng số tam giác zone Milestones: **1,970 triangles** (prop triangles: **924** <= ngân sách 2,000; tổng toàn khu <= 6,000).
   - Draw calls: **5 draw calls** (weathered, future, ink, needles, flower).
   - Thời gian dựng trên Node real terrain: **66.1 ms** (ngân sách <= 450 ms).

---

## 3. Đường dẫn ảnh

- Đã tham khảo ảnh vòng 1: `tools/review/AG-MS-02-shots/close-a.png`, `tools/review/AG-MS-02-shots/close-b.png`, `tools/review/AG-MS-02-shots/ingame-milestones.png`.
- Ảnh vòng 2: Theo ghi chú trong `tools/review/AG-MS-02-return-1.md` ("Không cần build/chụp ảnh (sandbox chặn; Lead chạy)"), Lead sẽ chạy lệnh build và chụp ảnh ngoài sandbox.

---

## 4. Việc chưa làm

- Lead build WASM và chạy chụp ảnh in-game nghiệm thu vòng 2.
- Không có commit hay push nào được thực hiện theo đúng quy định.

---

# Vòng 3 (2026-11-13)

Đã hoàn thành dựng lại toàn bộ hình khối tượng chân dung Duy theo đúng 11 điểm công thức hình khối do Lead viết trong `tools/review/AG-MS-02-return-2.md`.

## 1. Chi tiết thực hiện 11 điểm hình khối

1. **Bệ đá thô**:
   - Kích thước: rộng 2.8 × sâu 2.2 × cao 1.0 (dùng `stone(2.8, 2.2, 1.0, lean, seed, false, true)` kết hợp `weatherStone`).
   - Giữ collider bệ tượng tại kích thước $x = 2.2, y = 1.0, z = 2.8$, tâm tại $(4.7, 0.5, 0)$.
2. **Ngực + vai**:
   - Khối liền `BufferGeometry` tự dựng có mặt cắt ngang hình lục giác dẹt.
   - Đáy ($y = 1.0$): rộng 2.4, sâu 1.3. Ngang vai ($y = 2.9$): rộng 3.6, sâu 1.5.
   - Cơ thang dốc xuống từ đỉnh giữa $y = 3.2$ ($v = 0$) đến mép ngoài vai $y = 2.9$ ($v = \pm 1.8$).
   - Mặt trước ngực phẳng, nghiêng ra sau $6^\circ$ ($u_{front}(y) = -0.65 + (y - 1.0) \times \tan(6^\circ)$).
3. **Cổ**:
   - Trụ 8 cạnh (`emitPrism` 8 sides), bán kính 0.45, chiều cao $y$ từ 3.1 đến 3.7.
4. **Đầu**:
   - `IcosahedronGeometry(1, 1)` scale $(0.85, 1.05, 0.95)$ theo $(v, y, u)$, tâm $y = 4.6, u = 0.15, v = 0$.
   - Cằm: các đỉnh có $y < -0.6$ (tọa độ cục bộ) được kéo về phía trước 0.12 ($u \mathrel{-}= 0.12$) và thu hẹp $x$ còn 70% ($v \mathrel{*}= 0.70$).
5. **Tóc**:
   - `IcosahedronGeometry(1, 1)` thứ hai scale $(0.95, 0.62, 1.05)$, tâm $y = 5.12, u = 0.23, v = 0$ (cao hơn tâm đầu 0.52 và lùi sau 0.08).
   - Màu đá tối (`#7d776f`); thêm nêm mái (`wedge`) phủ trán lệch sang một bên ($v = -0.15, y = 4.88$).
6. **Kính tròn**:
   - Hai `TorusGeometry(0.26, 0.035, 6, 12)` đặt trước mặt ở $y = 4.65, u = -0.72$, tâm đặt tại $v = \pm 0.31$ (cách nhau 0.62 tâm-tâm); thanh cầu nối giữa 2 mắt kính; màu đá tối.
7. **Mũi**:
   - Một nêm tứ diện nhỏ cao 0.3 dưới cầu kính ($y \in [4.35, 4.65], v = 0, u = -0.88$).
   - Loại bỏ hoàn toàn miệng và tai theo đúng chỉ đạo của Lead.
8. **Vai phải của tượng thiếu ("Đang ghép dở")**:
   - Cắt phẳng khối ngực/vai bằng mặt phẳng chéo $0.20 \cdot u + 0.85 \cdot (y - 1.8) + v = 1.70$ (loại bỏ ~22% thể tích vai phải).
   - Mặt cắt phẳng được tô màu đá tối (`#7d776f` thuộc `milestones-ink`).
   - 4 mảnh đá vỡ (`stone(...)` + `weatherStone`) lơ lửng cách mặt cắt 0.4–1.6 m xếp theo một cung hướng vào chỗ thiếu, kích thước giảm dần từ 0.60 m xuống 0.26 m (mảnh gần nhất to nhất).
9. **Góc đầu thiếu**:
   - Các đỉnh đầu + tóc có $v > 0.25, y > 0.25, u > -0.1$ được chiếu lên mặt phẳng chéo $(v + y + u = 0.92)$ tạo mặt cắt phẳng màu tối.
   - 2 mảnh đá nhỏ lơ lửng cách mặt cắt 0.4 m và 0.8 m.
10. **Chứng chỉ**:
    - Lưới 2 × 2 trên mặt trước ngực, mỗi ô $1.0 \times 0.62$, cách nhau 0.12 (cột trái $v = -0.56$, cột phải $v = +0.56$; hàng trên $y = 2.65$, hàng dưới $y = 1.95$).
    - Đã đạt (`CCNA`, `VTI DEVOPS`): phiến đá gắn phẳng vào ngực, chữ tiếng Anh khắc sâu tối, chiều cao chữ $\ge 0.30$ m (`charHeight = 0.38` cho CCNA, `0.32` cho VTI DEVOPS, `carveDepth = 0.065`).
    - Dự định (`AWS SAA`, `LINUX CEH`): tại ô đó là hốc lõm tối sâu 0.25 m vào trong ngực (`#7d776f`); phiến đá lơ lửng cách ngực ~1.05 m ($u = -1.55$ và $-1.63$), nghiêng $15^\circ$, chữ khắc mờ nông (`carveDepth = 0.012`).
11. **Màu sắc**:
    - Đá xám ấm: `WEATHERED_BASE_HEX = 0xb5ada0` (luma ~0.42, không bị trắng cháy).
    - Tóc/kính/mặt cắt vai & đầu/hốc lõm/chữ khắc: đá tối hơn `INK_BASE_HEX = 0x7d776f`.
    - Phiến đá dự định: `FUTURE_BASE_HEX = 0xc5bdad`.
    - Bóng đổ: ramp preset A kết hợp `shadowTint` (`indigo` + `skyLow`) ngả xanh tím, không đen kịt. Không dùng `emissive`.

## 2. Ràng buộc kỹ thuật & Kết quả kiểm tra

- **Chiều cao tổng thể tượng**: **5.83 m** (nằm chính xác trong dải yêu cầu **5.6–6.2 m**).
- **Ngân sách tam giác**: **2,639 triangles** toàn khu (ngân sách $\le 6,000$); prop triangles: **1,325** (ngân sách $\le 2,000$).
- **Draw calls**: **5 draw calls** (`weathered`, `future`, `ink`, `needles`, `flower`), không tăng so với vòng 2.
- **Dữ liệu chứng chỉ**: Giữ nguyên `milestoneCertificates()` chỉ đọc `src/content`, không chèn cứng.
- **Kết quả lệnh**:
  - `pnpm lint`: **Exit 0** (0 errors, 0 warnings).
  - `pnpm typecheck`: **Exit 0** (`tsc --noEmit` hoàn toàn sạch).
  - `pnpm exec vitest run tests/unit/world/zones/milestones.test.ts`: **40/40 tests passed**.
  - `pnpm exec vitest run tests/unit/world/zones/outdoor-direction-a.test.ts`: **4/4 tests passed**.
  - `pnpm exec vitest run tests/unit/world/zones-wiring.test.ts`: **12/12 tests passed**.
  - `pnpm exec vitest run tests/unit/world/zones/`: **224/224 tests passed** trên toàn bộ 10 test suite.

## 3. Các file đã sửa

1. `src/features/world/zones/milestones.ts`: Dựng lại toàn bộ hình khối theo công thức Lead vòng 3.
2. `tests/unit/world/zones/milestones.test.ts`: Cập nhật assertion cho chiều cao 5.6–6.2 m, collider bệ $2.2 \times 1.0 \times 2.8$, màu chuẩn hex, hốc lõm và các mảnh lơ lửng.
3. `tools/review/AG-MS-02-handoff.md`: Cập nhật bàn giao vòng 3.
4. `tools/review/AG-MS-02-round3.done`: Tạo file rỗng đánh dấu hoàn tất vòng 3.

## 4. Việc chưa làm

- Lead build WASM và chạy chụp ảnh in-game nghiệm thu vòng 3.
- Không commit, không push theo đúng quy định.
