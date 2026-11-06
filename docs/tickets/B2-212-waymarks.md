## TICKET B2-212: mốc định hướng ở 2 đoạn "mù" (B2 công đoạn 5)

- Đọc `_dirA-common.md`, `_asset-common.md`. Chạy `node tools/wayfinding/audit.mjs` (B2-211) trước và sau.
- Được sửa: tạo `src/features/world/waymarks.ts` (module mới, dùng kit `props/wood.ts` + `props/rocks.ts`), sửa `src/features/world/dressing.ts` (**chỉ** để thêm nhóm waymarks vào dressing, collider box nếu cao > 0,6 m), sửa `tools/wayfinding/audit.mjs` để tính waymarks là mốc; test `tests/unit/world/waymarks.test.ts`.

### Audit hiện tại (B2-211, tuyến 1 109 m)

| Đoạn mù | t | Toạ độ đầu → cuối |
|---|---|---|
| 65 m | 0,356 → 0,415 | (−3,4; −318,0) → (37,2; −366,8) |
| 115 m | 0,500 → 0,604 | (7,5; −445,0) → (−62,9; −532,6) |

### Việc

1. Đặt 2–4 mốc mỗi đoạn, cách nhau 30–45 m, bên mép lối (ngoài `PATH_CLEARANCE`, không trên nền khu, không dưới nước):
   - rừng/đồi: cọc gỗ đẽo cao 1,2–1,6 m có dải vải/dây nhỏ màu `flower` (chấm cam, taste §5.3), hoặc chồng đá 3–5 viên (kit `createRockStack`) cao 0,8–1,2 m;
   - không chữ, không mũi tên in.
2. Mốc phải **nhìn thấy được từ mốc trước** (raycast audit).
3. Ngân sách: ≤ 2 draw call cho cả module, ≤ 3 000 tam giác.

### Điều kiện xong

- Audit: không còn đoạn mù > 60 m (dán bảng trước/sau).
- Test: vị trí hợp lệ, tất định, ngân sách; test cũ pass.
- `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0.
