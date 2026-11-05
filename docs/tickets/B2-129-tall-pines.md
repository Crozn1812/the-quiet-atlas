## TICKET B2-129 — Thông Đà Lạt cao hơn (đợt 22)

- Nhánh `lane/B2-129`. Được sửa: `src/features/world/foliage/shapes.ts`, `instances.ts`, `tests/unit/world/foliage*.test.ts`.
- Điều kiện xong: `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` exit 0. Không commit.

### B2-129 Thông Đà Lạt cao hơn (`foliage/shapes.ts`)

- Biến thể thông: tổng chiều cao **14–18 m**, **thân trần khoảng 2/3**, tán cao hẹp. Hiện tại khoảng 7–8 m, dáng thông Noel.
- **Collider thân giữ nguyên** (`colliders.ts`).
- Cập nhật kỳ vọng bounding box trong `foliage-shapes.test.ts`, có ghi lý do.
- Mỗi biến thể vẫn ≤ 300 tam giác.
- Kiểm `crown-fade` / `camera.ts`: cây cao hơn nên việc làm mờ tán khi che camera vẫn phải đúng. Nếu cần sửa ngưỡng thì ghi rõ.
- Chỉ sửa `src/features/world/foliage/shapes.ts`, `instances.ts` và test của chúng.
