# ADR 0008 — Hợp đồng sự kiện giữa UI portfolio và world

- Trạng thái: **Accepted** (Lead, 2026-11-04)
- Spec: §5 (ranh giới 3D), §6.1, §6.2, §6.4, §15
- Lý do: L1 (UI, `src/components/portfolio/`) và L2 (`src/features/world/`) làm song song; UI không được import tĩnh world, world không được import UI. Cần một kênh nhỏ, kiểm thử được.

## Quyết định

Kênh là `CustomEvent` dispatch trên **phần tử container** đã truyền vào `mountWorld`, và data attribute trên chính container. Không dùng global window event, không dùng storage.

### UI → world (L1 dispatch, L2 lắng nghe)

| Event | `detail` | Hành vi world |
|---|---|---|
| `tqa:pause` | `{ reason: "overlay" \| "error", paused: boolean }` | Thêm/bớt lý do trong `pauseReasons`; khi thêm: dừng locomotion, xóa tập phím, xóa vận tốc. Chỉ chạy lại khi tập lý do rỗng (§6.1) |
| `tqa:set-quality` | `{ quality: "low" \| "balanced" \| "high" }` | Đổi mật độ cây/DPR/shadow tại chỗ; **không** remount canvas, **không** đổi collider, **không** reset vị trí/secret (§6.2.7) |
| `tqa:return-to-path` | không có | Đưa nhân vật về `lastSafePosition`, xóa vận tốc (đã có từ L2-004) |

### World → UI (L2 ghi, L1/L3 đọc)

| Attribute trên container | Giá trị |
|---|---|
| `data-world-chunk` | `__TQA_WORLD_CHUNK__` (đã có) |
| `data-world-paused` | `"true"` / `"false"` — có lý do pause nào không |
| `data-world-quality` | `"low"` / `"balanced"` / `"high"` |

World phát `tqa:world-state` (bubbles: false) trên container mỗi khi `paused` hoặc `quality` đổi, `detail` = `{ paused, quality }`.

## Hệ quả

- `mountWorld(container, opts) => Promise<unmount>` giữ nguyên.
- Tên event/attribute là hợp đồng: đổi phải qua ADR mới.
- L3 kiểm hợp đồng qua attribute, không cần đọc state nội bộ.
