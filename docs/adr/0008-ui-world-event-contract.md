| World ? UI | `tqa:world-error` (container, bubbles: false) | `{ kind: "context-lost" }` | GPU context lost: world stops permanently; UI returns to HTML; no renderer recovery promised |
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

## Mở rộng 2026-11-04 (P01-E: interaction + overlay nội dung)

| Hướng | Event / attribute | `detail` / giá trị | Ý nghĩa |
|---|---|---|---|
| World → UI | `tqa:open-content` (trên container) | `{ zoneId: "first-light" \| "roots" \| "workshop" \| "milestones" \| "old-trail" \| "horizon" \| "quiet-shore" \| "last-postcard" }` | Người chơi tương tác (E/click) với vật thể của khu; UI mở overlay |
| UI → world | `tqa:content-closed` | `{ zoneId }` | Overlay đã đóng; world ghi "đã ghé" khu này (memory) |
| World → UI | `data-world-hint` | `zoneId` của mục tiêu tương tác đang được gợi ý, hoặc vắng mặt | Để UI/test biết gợi ý "E" đang hiện |

World **không** tự mở overlay khi đang có lý do pause; UI chịu trách nhiệm pause/resume qua `tqa:pause` như menu.

## Hệ quả

- `mountWorld(container, opts) => Promise<unmount>` giữ nguyên.
- Tên event/attribute là hợp đồng: đổi phải qua ADR mới.
- L3 kiểm hợp đồng qua attribute, không cần đọc state nội bộ.
