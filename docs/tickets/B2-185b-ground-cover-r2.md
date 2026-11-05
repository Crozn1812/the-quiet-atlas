## TICKET B2-185b: lớp phủ nền vòng 2 (sửa test hỏng ở các khu)

- Thẻ gốc: `B2-185-ground-cover.md` (đọc lại). Worktree này **đã có sẵn** toàn bộ thay đổi B2-185 (chưa commit). Xem `git diff`.
- Được sửa thêm: test của các khu bị ảnh hưởng (`tests/unit/world/zones/roots.test.ts`, `workshop.test.ts`, `old-trail.test.ts`) và `tests/unit/world/compose.test.ts`. **Không** sửa file nguồn khu (đợt 2 đang làm lại các khu).

### Lead chạy `pnpm test` trên main + thay đổi này: 6 FAIL

- `zones/roots.test.ts`: fingerprint đổi; "adds at most 120 grounded triangles at the stump foot" → 280.
- `zones/workshop.test.ts`: fingerprint đổi; "adds only 120 grounded moss/fern triangles" → 280.
- `zones/old-trail.test.ts`: fingerprint; 120 → 280; "stays within the real merged triangle/draw-call/radius budgets" 3268 ≠ 3108.
- `compose.test.ts`: "cleans up an initial tile failure…" `dispose` gọi 34 lần (mong 11); "shares biome fog distances…" fail.

### Việc

1. Dương xỉ dùng trong khu: **giữ ngân sách cũ**. Cách ưu tiên: export thêm biến thể nhẹ `createFern(seed, { detail: "low" })` (≤ 60 tam giác) và để `createFern()` không tham số trả bản nhẹ cho các khu; ground scatter dùng bản đầy đủ. Khi đó test khu không cần đổi. Nếu không làm được, cập nhật kỳ vọng tam giác/fingerprint kèm comment lý do, nhưng tổng tam giác mỗi khu không tăng quá 10 %.
2. `compose.test.ts`: tìm nguyên nhân thật (ground tạo thêm geometry/material mà không dispose đúng khi tile lỗi? hay test đếm cứng số mesh?). Nếu là rò tài nguyên thì **sửa nguồn** trong `ground.ts`; chỉ cập nhật kỳ vọng nếu số dispose tăng đúng bằng số tài nguyên mới tạo, và ghi lý do.
3. Chạy đủ `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` — **exit 0 toàn bộ**.
