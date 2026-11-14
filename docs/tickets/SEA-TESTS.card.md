## TICKET SEA-TESTS — Rà lại bất biến biển bị thay ở HR-SEA (QA)

- Lane: L4 QA. HR-SEA (bf701ab) viết lại `tests/unit/world/sea-sunset.test.ts` (−643/+124 dòng) và `water-streaks.test.ts` (−26); tổng unit giảm từ 1911 xuống 1882.
- Việc: so `git show bf701ab~1:tests/unit/world/sea-sunset.test.ts` và `...water-streaks.test.ts` với bản hiện tại. Với **từng** test bị bỏ: nếu bất biến vẫn đúng với shader biển mới (vd. sáng dần về chân trời, fade xa/hướng khuất nắng, không có dải lặp tuần hoàn, glitter thành vệt ngắn) thì **khôi phục** (điều chỉnh số theo shader mới, không nới lỏng vô lý); nếu bất biến đã lỗi thời vì thiết kế mới (vd. "deep pigment when no sampled coast") thì ghi lý do một dòng trong bàn giao.
- Được sửa: `tests/unit/world/sea-*.test.ts`, `tests/unit/world/water-streaks.test.ts`. Không sửa `src/**`.
- Xong: bảng test cũ → khôi phục/lỗi thời + lý do; `pnpm test` PASS; lint/typecheck PASS. Không commit.
