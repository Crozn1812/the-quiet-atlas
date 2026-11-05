## TICKET B2-181b: nước vòng 2 (khớp với đất bờ suối mới của B2-190)

- Thẻ gốc: `B2-181-water-follows-light.md`. Worktree đã có toàn bộ B2-181 (commit `wip B2-181`), đã rebase lên main mới nhất (có B2-190 tô đất ẩm tối hơn cạnh suối).
- Được sửa: như thẻ gốc (`water/material.ts`, vòng cập nhật nước trong `compose.ts`, test nước).

### Lead chạy `pnpm test` sau rebase: 3 FAIL

- `water-lighting.test.ts` "keeps the {Low,Balanced,High} dawn stream below 1.3 times the adjacent ground": `expected 0.0287 ≤ 0.0226`.
- Nguyên nhân: B2-190 làm đất ẩm cạnh suối tối hơn (đúng ý đồ). Suối bình minh giờ sáng hơn bờ.

### Việc

- Hạ độ sáng suối rừng lúc bình minh (pigment/hemi/phản chiếu trời ở rừng) để đạt ≤ đất bờ × 1,3 với đất mới. **Không** sửa test để nới ngưỡng, không sửa `terrain/mesh.ts`.
- Giữ các tiêu chí khác của B2-181 (biển ≤ 0,35, R/B, vệt ≤ 40 m, suối ven đường tối hơn đường).
- `pnpm exec eslint . --max-warnings=0`, `pnpm typecheck`, `pnpm test` exit 0.
