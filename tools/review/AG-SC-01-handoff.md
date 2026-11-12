# Bàn giao Ticket SC-01 — Cột mốc bí mật lớn 2–3× và bầu không khí huyền bí

## 1. File đã sửa

Trong phạm vi mục **Được sửa** của `docs/tickets/SC-01.md` và `docs/tickets/R2-tickets.md`:

- `src/features/world/props/secrets.ts`
  - Phóng to 4 cột mốc bí mật (`vine-arch-mirror`, `wind-chime`, `faint-trail`, `bench`) lên **2.25–2.7×** ở cả 3 chiều X, Y, Z để nhận diện rõ từ khoảng cách 15 m.
  - Bổ sung bầu không khí huyền bí quanh từng vật thể gồm 3 lớp bề mặt mới trong `SecretSurface`:
    - `"glow"`: dải/vầng sáng dịu trên mặt đất và quanh vật thể (`PALETTE.gold` / `PALETTE.sun` / `PALETTE.sunset`, `opacity: 0.2`, `roughness: 1`).
    - `"mist"`: các vòng sương mỏng là là quanh chân và thân cột mốc (`PALETTE.mist`, `opacity: 0.24`, `roughness: 1`).
    - `"mote"`: các hạt sáng nhỏ hình bát diện (`OctahedronGeometry`) lơ lửng quanh cột mốc (`PALETTE.paper` / `PALETTE.sun`, `opacity: 0.72`).
  - Tất cả mesh khí quyển (`mist`, `glow`, `mote`) đều tắt đổ bóng (`castShadow = false`, `receiveShadow = false`) và đặt `mesh.raycast = () => {}` để không cản tia raycast của camera spring-arm (`cameraObstacles`) hay tia click tương tác.
  - Giữ nguyên ngôn ngữ khối đa diện phẳng (faceted planar), màu trong `PALETTE`, không chữ/số trong mesh, và giữ nguyên lối tiếp cận cho người chơi cũng như góc máy kết phim tại `bench` (`(2, 1.8, 3) -> (0, 0.9, -1)` và điểm đứng `(1.8, 0, 0)`).
- `tests/unit/world/secret-landmarks.test.ts`
  - Cập nhật kiểm tra kích thước bao (bounding box 2–3×), ngân sách tam giác mới, kiểm tra các bề mặt R1 (`stone`, `mirror`, `vine`, `flower`, `wood`, `chime`, `cord`, `path`, `seat`, `fence`) cùng các bề mặt khí quyển SC-01 (`mist`, `glow`, `mote`), và kiểm tra hành vi `raycast` không chặn camera của các lớp khí quyển.

*(Không sửa `src/features/story/*` vì `radius: 2.5` tại `src/features/story/secrets.ts` đã khớp với `INTERACTION_RADIUS = 2.5` và mọi bài test story đều pass; không sửa `src/features/world/index.ts`; không sửa `package.json` hay lockfile).*

---

## 2. Bảng kích thước, số tam giác và draw call (Trước / Sau)

| Cột mốc (`SecretLandmarkKind`) | Kích thước Trước (X × Y × Z) | Kích thước Sau (X × Y × Z) | Tam giác Trước | Tam giác Sau | Ngân sách bài SC-01 | Draw call (Mesh) Trước | Draw call (Mesh) Sau |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `vine-arch-mirror` (`reflection`) | `1.95 × 2.42 × 0.18 m` | `4.95 × 5.86 × 1.92 m` | 644 | **892** | ≤ 1,200 | 7 | 10 (`+glow, +mist, +mote`) |
| `wind-chime` (`forgotten-sound`) | `1.57 × 2.82 × 0.13 m` | `4.15 × 6.76 × 1.80 m` | 260 | **524** | ≤ 900 | 3 | 6 (`+glow, +mist, +mote`) |
| `faint-trail` (`unmarked-road`) | `0.98 × 0.66 × 9.30 m` | `2.45 × 2.20 × 21.60 m` | 288 | **640** | ≤ 900 | 2 | 5 (`+glow, +mist, +mote`) |
| `bench` (`unwritten-page`) | `2.09 × 0.98 × 1.53 m` | `4.70 × 2.62 × 3.60 m` | 472 | **720** | ≤ 1,200 | 5 | 8 (`+glow, +mist, +mote`) |
| **Tổng cộng (cả 4 cột mốc)** | — | — | **1,664** | **2,776** | **≤ 4,200** | **17** | **29** |

---

## 3. Kết quả lệnh kiểm tra & Build

- **Lint** (`pnpm lint` / `node ./node_modules/eslint/bin/eslint.js .`): **EXIT 0** (0 lỗi, 0 cảnh báo).
- **Typecheck** (`pnpm typecheck` / `node ./node_modules/typescript/bin/tsc --noEmit`): **EXIT 0**.
- **Unit & Integration Tests** (`pnpm test` / `node ./node_modules/vitest/vitest.mjs run`): **EXIT 0** (`155 passed` test files, `1763 passed` tests).
  - Riêng các bài test liên quan trực tiếp (`tests/unit/world/secret-landmarks.test.ts`, `tests/unit/world/secrets-wiring.test.ts`, `tests/unit/story/secrets.test.ts`): `3 passed (75 tests)`.
- **Build tĩnh** (`NEXT_BUILD_WEBPACK=1 pnpm build` → `out/`): **EXIT 0** (Next.js static export + OG images + CV PDF hoàn tất trong `out/`).
- **Chụp ảnh High in-game** (`node tools/serve-out/index.mjs out --port 4515` + `TQA_QUALITY=high node tools/review/ingame-shots.mjs tools/review/AG-SC-01-shots http://127.0.0.1:4515 vi`): **EXIT 0** (`quality: high`, 0 pageerror).

### Kết quả kiểm tra độ sáng (`luma.mjs`) và màu đất (`ground-hue.mjs`)

Chạy `node tools/review/luma.mjs tools/review/AG-SC-01-shots` (mục tiêu `0.18 – 0.55`):

```text
ingame-first-light.png    0.187
ingame-horizon.png        0.425
ingame-last-postcard.png  0.311
ingame-milestones.png     0.217
ingame-old-trail.png      0.476
ingame-quiet-shore.png    0.300
ingame-roots.png          0.260
ingame-workshop.png       0.275
```

Chạy `node tools/review/ground-hue.mjs tools/review/AG-SC-01-shots` (mục tiêu hue cỏ/đất ấm `65° – 165°`):

```text
ingame-first-light.png    hue 153   sat 0.28   val 0.26
ingame-horizon.png        hue 111   sat 0.23   val 0.53
ingame-last-postcard.png  hue 82    sat 0.03   val 0.32
ingame-milestones.png     hue 118   sat 0.22   val 0.28
ingame-old-trail.png      hue 76    sat 0.32   val 0.52
ingame-quiet-shore.png    hue 97    sat 0.15   val 0.33
ingame-roots.png          hue 116   sat 0.18   val 0.31
ingame-workshop.png       hue 112   sat 0.18   val 0.33
```

---

## 4. Đường dẫn ảnh đã chụp

Thư mục: `tools/review/AG-SC-01-shots/`

- `tools/review/AG-SC-01-shots/ingame-first-light.png`
- `tools/review/AG-SC-01-shots/ingame-workshop.png`
- `tools/review/AG-SC-01-shots/ingame-roots.png`
- `tools/review/AG-SC-01-shots/ingame-milestones.png`
- `tools/review/AG-SC-01-shots/ingame-old-trail.png`
- `tools/review/AG-SC-01-shots/ingame-horizon.png`
- `tools/review/AG-SC-01-shots/ingame-quiet-shore.png`
- `tools/review/AG-SC-01-shots/ingame-last-postcard.png`

---

## 5. Đoạn gắn vào `src/features/world/index.ts` (Tùy chọn cho Lead, ≤ 15 dòng)

Các cột mốc mới hoạt động đầy đủ ngay với `src/features/world/index.ts` hiện tại mà **không cần sửa `index.ts`**. Nếu Lead muốn các hạt sáng (`"mote"`) nhấp nhô nhẹ theo `chimeTime` trong vòng lặp `tick()`, có thể thêm 6 dòng sau ngay dưới dòng `chimes.rotation.z = ...` (khoảng dòng 1379 trong `src/features/world/index.ts`):

```ts
for (const { root } of secretTargets) {
  root.traverse(obj => {
    if ((obj as Mesh).userData?.secretSurface === "mote") {
      obj.position.y = reducedMotion ? 0 : Math.sin(chimeTime * 1.1 + root.position.x * 0.1) * 0.08;
    }
  });
}
```

---

## 6. Việc chưa làm (Dành cho Lead)

- Chưa `git commit` và chưa `git push` theo đúng quy định của ticket.
- Chưa chạy full Playwright e2e suite / Lighthouse tổng hợp toàn dự án (phần kiểm thử tích hợp của Lead sau khi ghép các nhánh R2).


---

## Vòng 2 — sửa theo `tools/review/AG-SC-01-return-1.md`

### File đã sửa (chỉ 2 file)

- `src/features/world/props/secrets.ts`
- `tests/unit/world/secret-landmarks.test.ts`

### Đã làm theo 6 điểm

1. **Glow chỉ còn đĩa sát đất.** Bỏ hết tấm/hộp `veilGeometry` dựng đứng và vầng tròn sau gương. `glow` giờ là đĩa đa giác không đều nằm ở y = 0,018 m, gồm 3 vòng đồng tâm có vertex alpha 1 → 0,75 → 0,34 → 0 (thuộc tính `color` có 4 kênh RGBA). Opacity vật liệu là 0,11, nên độ hiện tối đa ≤ 0,11 (giới hạn là 0,12). Test kiểm tra mọi đỉnh có y ≤ 0,04 và |normal.y| > 0,99 (không có mặt đứng), đồng thời có cả mép alpha 0 lẫn lõi alpha ≥ 0,9.
2. **Sương thấp, dẹt, hình không đều.** Bỏ các vòng trụ hở. `mist` là 3 dải dẹt đa giác méo (vệt sương) quanh chân vật, mép tan dần bằng vertex alpha, mọi đỉnh có y nằm trong khoảng 0,04–0,35 m. Test kiểm tra y < 0,4 và |normal.y| > 0,85 (không phải hộp hay tường). Opacity 0,16.
3. **Băng ghế giữ tỉ lệ người.** Mặt ngồi cao ~0,45 m (ván trên cùng ở 0,45), rộng **1,80 m**, lưng tựa cao 0,92 m. Phần to lên nằm ở bối cảnh: **giàn dây leo phía sau cao 2,78 m** (z ≈ -1,34, có hoa và lá) và **bục đá + giá gỗ đặt trang viết dở** ở cạnh -X (x = -1,36). Toàn bộ glow/mist/mote của ghế đặt sau lưng ghế hoặc phía bục. Test bắn tia từ camera `(2, 1.8, 3)` tới `(0, 0.9, -1)` và tới thân nhân vật tại `(1.8, 0.1–1.65, 0)`: không chạm mặt trong suốt nào.
4. **Lối mòn không tên.** Bỏ tấm đứng và khối bia đá. Còn 12 phiến đá lát nhỏ và mỏng dần (phiến cuối < 70 % phiến đầu, dày ≤ 0,14 m) cùng **4 ụ đá xếp (cairn) thấp dần: 1,13 → 0,92 → 0,79 → 0,60 m**, cao nhất ≤ 1,2 m. Test kiểm tra từng ụ ≤ 1,2 m và thứ tự giảm dần.
5. **Đốm sáng nhỏ hơn và tránh điểm đứng.** Mỗi `mote` có đường kính ≤ 0,072 m (bán kính bị kẹp ở 0,036). Test kiểm tra bbox mỗi đốm ≤ 0,08 m và mọi đỉnh cách điểm đứng (0, 0, 0) quá 1,5 m theo mặt phẳng XZ. Riêng ghế kiểm tra thêm điểm đứng (1,8, 0, 0) của `visitSecret` và cảnh kết.
6. **Gương vòm và chuông gió:** giữ nguyên toàn bộ khối đặc (khung, gương, dây leo, cột, ống chuông, pivot `chimes`). Chỉ thay glow, mist và mote theo điểm 1, 2, 5.

### Số liệu sau vòng 2

| Cột mốc | Bbox (X × Y × Z, m) | Tam giác | Mesh | Ghi chú |
| :--- | :---: | :---: | :---: | :--- |
| `vine-arch-mirror` | 5,25 × 5,95 × 1,77 | 922 (≤ 950) | 9 | khối đặc giữ nguyên; X rộng hơn do đĩa glow |
| `wind-chime` | 4,97 × 6,78 × 2,00 | 568 (≤ 650) | 7 | khối đặc giữ nguyên; X rộng hơn do đĩa glow |
| `faint-trail` | 2,79 × 1,07 × 21,65 | 792 (≤ 850) | 4 | cao nhất là cairn 1,13 m |
| `bench` | 4,36 × 2,78 × 2,21 | 918 (≤ 950) | 11 | ghế rộng 1,80 m, giàn 2,78 m |

### Kết quả lệnh (vòng 2)

- `pnpm lint` (`node ./node_modules/eslint/bin/eslint.js .`): **exit 0**.
- `pnpm typecheck` (`node ./node_modules/typescript/bin/tsc --noEmit`): **exit 0**.
- `pnpm exec vitest run tests/unit/world/secret-landmarks.test.ts tests/unit/world/secrets-wiring.test.ts tests/unit/story`: **exit 0**, 3 file, **90/90 test đạt** (secret-landmarks 33, secrets-wiring 11, story/secrets 46).

### Việc chưa làm / cần Lead

- **Chưa build lại và chưa chụp lại ảnh** cho vòng 2. Ảnh `tools/review/AG-SC-01-shots/secret-*.png` vẫn là ảnh vòng 1 do Lead chụp. Lần trước, script chụp cận cảnh của thợ không mở được Edge trong sandbox (`browserType.launch: Target page, context or browser has been closed`). Lead cần build và chụp lại để duyệt phần nhìn.
- **Va chạm của bục và giàn ghế:** hộp chặn `secretSolids` của ghế nằm trong `src/features/world/index.ts` (ngoài phạm vi được sửa), vẫn là `Vector3(2.2, 1.05, 1.5)` đặt ở tâm ghế. Hộp này bọc được ghế 1,8 m nhưng **không bọc bục trang viết (x ≈ -1,36) và giàn phía sau (z ≈ -1,34)**, nên nhân vật có thể đi xuyên hai vật này. Gợi ý cho Lead (1 dòng): đổi kích thước hộp ghế thành `new Vector3(3.4, 1.05, 3.0)` và dời tâm sang `(-0.15, y, -0.55)`. Hoặc giữ nguyên nếu chấp nhận được đi xuyên giàn.
- Chưa commit hay push (đúng yêu cầu).
