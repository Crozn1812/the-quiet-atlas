# Bàn giao Ticket WS-02 — Cổng đình làng có lửa ở Workshop

## 1. Tóm tắt hạng mục thi công
Đã thay thế lều gỗ một mái nhỏ tại khu **Workshop** bằng **Cổng Tam Quan / Cổng Đình Làng** (`~9.38 m` cao, nằm trong ngưỡng `8–12 m`) có **lửa đang cháy** ở cả hai bên lối vào, thể hiện ý nghĩa *sức trẻ đang tự rèn giũa và hoàn thiện bản thân*:

- **Kiến trúc Cổng Đình Làng / Cổng Tam Quan (`8–12 m`)**:
  - Kết cấu 3 gian truyền thống (Trung môn 2 tầng mái có cổ diêm + Tả/Hữu môn hai bên) với 8 cột gỗ (`cột cái` cao `6.45 m`, `cột quân` cao `4.05 m`) dùng `createPostGeometry` từ bộ kit gỗ chung, chân cột kê chân tảng tối màu (`ink`) và tiếp đất độc lập trên địa hình nghiêng.
  - Hệ khung xà ngang, câu đầu, xà dọc, con tiện và kẻ bẩy đan truyền thống (`createPlankGeometry` kết hợp thanh mộng gỗ).
  - 4 tầng mái ngói cong mũi hài (`mái thượng`, `mái hạ`, `mái tả môn`, `mái hữu môn`) với bờ nóc, đấu nóc và **12 đầu đao cong vút** ở các góc mái, phủ mảng rêu phong (`forestDeep` `30.6%` diện tích nhìn từ trên xuống).
  - Không dùng chữ Hán, không dùng biểu tượng tôn giáo riêng hay logo; giữ nguyên bảng kỹ năng tiếng Anh (`createSkillsBoard`) trên giá vẽ và bàn thợ (`Workbench by the stream` / `Bàn thợ cạnh suối`) đúng hợp đồng tương tác.
- **Lửa đang cháy & ánh sáng ấm hắt lên cột**:
  - Đặt **2 lư lửa đứng (`fire braziers`)** hai bên lối vào chính và **2 đuốc gắn cột cái (`column torches`)** phía trên.
  - Ngọn lửa 3D nhiều lưỡi xoắn và các hạt tàn lửa (`OctahedronGeometry`) nằm trong nhóm động `workshop-fire`, chuyển động bập bùng mượt trong `scene.update(dt, false)` và đứng yên hoàn toàn khi `reducedMotion = true`.
  - Bố trí **2 nguồn sáng `PointLight` màu vàng cam ấm** (`workshop-fire-light-left`, `workshop-fire-light-right`, không bật shadow map đắt đỏ) nhấp nháy nhẹ theo nhịp lửa, kết hợp nhuộm sắc độ ấm (`fireWarmthAt`) trực tiếp lên màu đỉnh (`vertex color`) của các thân cột gỗ và xà ngang kế cận ngọn lửa.

---

## 2. Danh sách file đã sửa
Chỉ sửa các file nằm trong danh mục **Được sửa** của ticket `WS-02`:
- `src/features/world/zones/workshop.ts`
- `tests/unit/world/zones/workshop.test.ts`

File bàn giao và ảnh chụp nghiệm thu:
- `tools/review/AG-WS-02-handoff.md`
- `tools/review/AG-WS-02-shots/ingame-*.png` (8 ảnh)

Không thêm file nhị phân ngoài luồng, không đổi `package.json` / `pnpm-lock.yaml`, không commit, không push.

---

## 3. Số liệu Ngân sách Hình học (Triangles & Draw Calls)

| Chỉ số | Trước (Shed cũ) | Sau (WS-02 Cổng đình làng & Lửa) | Trần ngân sách |
| --- | ---: | ---: | ---: |
| **Tổng số tam giác khu Workshop** | `5,314` | **`5,406`** | `<= 5,520` (`3680 * 1.5`) & `<= 6,000` |
| **Số draw calls (`scene.group` meshes)** | `8` | **`8`** | `<= 8` |
| **Số vật liệu (`MeshToonMaterial`)** | `7` | **`7`** | `<= 7` |
| **Thời gian khởi tạo trung vị (Node)** | `9.27 ms` | **`9.34 ms`** | `< 200 ms` |
| **World High tại Workshop (visible triangles)** | `153,917` | **`154,009`** | `<= 192,245` (`153796 * 1.25`) |
| **Bytes asset mới trong `public/world`** | `0 B` | **`0 B`** | `0 B` (procedural 100%) |

### Phân bổ tam giác theo cụm (`trianglesByCluster`, giới hạn `<= 2,000` / cụm):
- `gate-pillars-beams`: `1,584` tam giác
- `gate-roofs`: `852` tam giác
- `fire-braziers`: `464` tam giác
- `bench-tools`: `742` tam giác
- `shelf-storage`: `526` tam giác
- `outdoor-crates-rope`: `440` tam giác
- `making-of`: `178` tam giác
- `moss-sprig-ground`: `380` tam giác
- `stream-steps`: `240` tam giác
- **Tổng cộng**: `5,406` tam giác

---

## 4. Kết quả chạy lệnh kiểm tra

1. **Lint (`pnpm lint` / `eslint .`)**:
   - Kết quả: **Exit 0** (0 lỗi, 0 cảnh báo).
2. **Typecheck (`pnpm typecheck` / `tsc --noEmit`)**:
   - Kết quả: **Exit 0** (0 lỗi kiểu dữ liệu).
3. **Unit Tests (`pnpm test` / `vitest run`)**:
   - Riêng khu Workshop (`tests/unit/world/zones/workshop.test.ts`): **27/27 passed** (`11.90s`, exit 0).
   - Toàn bộ kho mã (`vitest run`): **155/155 test files passed, 1,763/1,763 tests passed** (exit 0).
4. **Build tĩnh (`NEXT_TEST_WASM_DIR="C:\Users\PC-LP\AppData\Local\next-swc\wasm\package" NEXT_BUILD_WEBPACK=1 pnpm build`)**:
   - Kết quả: **Exit 0** (xuất đầy đủ 22/22 trang tĩnh vào `out/`, kèm PDF CV EN/VI và bộ ảnh OG).

---

## 5. Đường dẫn ảnh chụp 8 khu & Bảng đo Luma / Ground Hue (Port 4518, `TQA_QUALITY=high`)

Thư mục ảnh: `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots`

| Khu (Zone) | Đường dẫn ảnh | Luma trung bình (`0.18–0.48`) | Ground Hue / Sat / Val |
| --- | --- | ---: | --- |
| **First Light** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-first-light.png` | `0.186` | `hue 153`, `sat 0.28`, `val 0.26` |
| **Workshop (WS-02)** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-workshop.png` | **`0.262`** | `hue 107`, `sat 0.18`, `val 0.31` |
| **Roots** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-roots.png` | `0.247` | `hue 120`, `sat 0.18`, `val 0.30` |
| **Milestones** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-milestones.png` | `0.223` | `hue 118`, `sat 0.22`, `val 0.28` |
| **Old Trail** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-old-trail.png` | `0.449` | `hue 76`, `sat 0.33`, `val 0.49` |
| **Horizon** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-horizon.png` | `0.427` | `hue 102`, `sat 0.26`, `val 0.52` |
| **Quiet Shore** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-quiet-shore.png` | `0.314` | `hue 81`, `sat 0.17`, `val 0.33` |
| **Last Postcard** | `d:\tqa-worktrees\AG-WS-02\tools\review\AG-WS-02-shots\ingame-last-postcard.png` | `0.335` | `hue 63`, `sat 0.07`, `val 0.34` |

---

## 6. Việc chưa làm
- **Không có.** Mọi yêu cầu trong ticket `WS-02`, quy tắc kỹ thuật (`_common-b2.md`, `_graphics-common.md`, `_review-common.md`) và nghiệm thu hình ảnh thực tế đã hoàn tất đầy đủ.

---

## 7. Vòng 2 — Xử lý phản hồi Lead (theo `AG-WS-02-return-1.md`)

Đã thực hiện đúng và đầy đủ 4 điểm phản hồi từ Lead, giữ nguyên hệ mái cong ngói đình làng, 12 đầu đao, 8 cột gỗ, 2 lư lửa và ánh sáng ấm:

1. **Phải là cổng, không phải nhà**:
   - Loại bỏ hoàn toàn các vách ván xám (`beamBox` ván hậu và vách hai bên), tấm bạt xanh phía sau (`ink` backdrop lining), và kệ đồ nghề (`shelf-storage`).
   - Cổng tam quan giờ đây là kết cấu **100% hở, nhìn xuyên qua được**: chỉ gồm cột, xà, câu đầu, kẻ bẩy, cổ diêm và mái ngói cong mũi hài.
   - Ba lối đi dưới ba gian (Tả môn, Trung môn, Hữu môn) hoàn toàn thông thoáng, không có vật cản.

2. **Hướng cổng**:
   - Điều chỉnh hướng mặt chính cổng tam quan xoay góc `yaw = 0.55 rad (~31.5°)` với vector pháp tuyến mặt trước `dirV = (+0.8525, 0, -0.5227)` hướng ra đường mòn (+X) và đón hướng người chơi tiếp cận từ phía nam (-Z).
   - Khi người chơi di chuyển dọc theo đường mòn, từ góc nhìn chính diện / chéo 45° thấy trọn vẹn cả 3 gian cổng đình, 2 tầng mái Trung môn với 12 đầu đao cong vút vươn cao và 2 lư lửa đang cháy rực; không còn bị nhìn thành một cạnh hẹp như cái tháp.

3. **Bàn thợ và giá bảng kỹ năng**:
   - Đặt bàn thợ (`benchX = -4.75, benchZ = 0`) và giá vẽ bảng kỹ năng (`easelPos = [-4.85, 0, -4.25]`) ở bên cạnh cổng (ngoài hàng cột), hoàn toàn không nằm trong lối đi của các gian cổng.
   - Giữ nguyên hợp đồng tương tác: `interactable: { position: point(-4.75, benchY, 0), label: { vi: "Bàn thợ cạnh suối", en: "Workbench by the stream" } }`.
   - Tách riêng logic tạo giá bảng kỹ năng thành hàm xuất khẩu độc lập `createWorkshopSkillsBoard(...)`, phục vụ việc tháo gỡ/chuyển giao sang Roots khi làm ticket RT-02.

4. **Collider**:
   - Bỏ toàn bộ collider vách, kệ và mái.
   - Collider cổng chỉ đặt tại chân cột (4 cột cái, 4 cột quân) và 2 đế lư lửa.
   - Người chơi có thể tự do đi xuyên qua gian giữa (Trung môn) và hai gian bên một cách mượt mà.

### Số liệu sau Vòng 2:
- **Tổng tam giác khu Workshop**: `4,316` tam giác (giảm từ `5,406`, trần `<= 5,520` và `<= 6,000`).
- **Draw calls**: `8` meshes (trần `<= 8`).
- **Vật liệu**: `7` materials.
- **Thời gian khởi tạo trung vị**: `~5.8 ms` (trần `< 200 ms`).
- **World High tại Workshop**: `152,883` visible triangles (giảm từ `154,009`).

### Kết quả kiểm tra Vòng 2:
- `pnpm lint` (`eslint .`): **Exit 0** (0 errors, 0 warnings).
- `pnpm typecheck` (`tsc --noEmit`): **Exit 0**.
- `pnpm exec vitest run tests/unit/world/zones/workshop.test.ts`: **27/27 passed** (Exit 0).

