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

## Mở rộng 2026-11-04 (P01-F, L2-007)

| Hướng | Event | `detail` | Ý nghĩa |
|---|---|---|---|
| World → UI | `tqa:world-error` (trên container, bubbles: false) | `{ kind: "context-lost" }` | Mất WebGL context: world dừng hẳn; UI đưa người xem về HTML (Q15); không hứa khôi phục renderer |

## Mở rộng 2026-11-04 (đợt 10: ngôn ngữ trong world, §6.3 / Q21)

| Hướng | Event / option | `detail` / giá trị | Ý nghĩa |
|---|---|---|---|
| UI → world | `mountWorld(container, { locale })` | `"en"` \| `"vi"` (mặc định `"en"`) | Ngôn ngữ ban đầu cho mọi chữ world tự hiển thị |
| UI → world | `tqa:set-locale` (trên container) | `{ locale: "en" \| "vi" }` | Đổi chữ world tại chỗ: gợi ý "E — …", nhãn vật thể/placeholder, `aria-label` của canvas. **Không** remount canvas, **không** đổi vị trí/secret/quality/pause |
| World → UI | `data-world-locale` | `"en"` \| `"vi"` | Ngôn ngữ world đang dùng (để UI/test xác nhận) |

- Từ điển chữ của world nằm trong `src/features/world/` (L3 sở hữu), không import `src/i18n/` (giữ ranh giới bundle).
- UI dispatch `tqa:set-locale` sau khi đổi URL/từ điển của mình (L1, `WorldMenu.ts`).

World **không** tự mở overlay khi đang có lý do pause; UI chịu trách nhiệm pause/resume qua `tqa:pause` như menu.

## Hệ quả

- `mountWorld(container, opts) => Promise<unmount>` giữ nguyên.
- Tên event/attribute là hợp đồng: đổi phải qua ADR mới.
- L3 kiểm hợp đồng qua attribute, không cần đọc state nội bộ.

## Bổ sung 2026-11-05 (B2-013): biển chỉ đường dịch chuyển

World → UI, phát trên container của `mountWorld`, `bubbles: false` (hằng và kiểu ở `src/features/navigation/events.ts`):

| Sự kiện | detail | Khi nào |
|---|---|---|
| `tqa:teleport-start` | `{ from: ZoneId, to: ZoneId }` | Người xem chọn khu đích tại một bảng; UI có thể ẩn gợi ý |
| `tqa:teleport-end` | `{ to: ZoneId }` | Nhân vật đã đứng cạnh bảng khu đích, input mở lại |

Secrets không bao giờ là đích. Reduced motion: fade 0,15 s thay cho sương 0,6 s.

### Bổ sung 2026-11-05 (B2-041): hộp chọn khu

E tại bảng mở hộp chọn khu ở phía giao diện (dialog có focus trap, phù hợp a11y §9), thay cho việc chọn khu trong world. Thay thế câu "không có sự kiện UI → world mới" ở bản trước.

| Hướng | Sự kiện | `detail` | Ý nghĩa |
|---|---|---|---|
| World → UI | `tqa:teleport-choose` | `{ from: ZoneId }` | Người xem bấm E/click tại bảng dịch chuyển; UI mở hộp chọn và gửi `tqa:pause` lý do `overlay` |
| UI → world | `tqa:teleport-to` | `{ to: ZoneId }` | Chọn khu đích (khác `from`); world chạy sương → đặt nhân vật → `teleport-start/end` |
| UI → world | `tqa:teleport-cancel` | không có | Đóng hộp mà không chọn |

Pause lý do `journal` (B2-043a) cũng được world nhận như `overlay`.

### Bổ sung 2026-11-05 (đợt 18–20): xe, secrets, ending, mascot, âm thanh

| Hướng | Sự kiện / thuộc tính | `detail` | Ý nghĩa |
|---|---|---|---|
| World → UI | `tqa:secret-found` | `{ id: SecretId, count: number }` | Tìm thấy một secret (Set ID, không đếm trùng); journal hiện trang trắng sau secret đầu |
| World → UI | `tqa:ending` | `{ state: "playing" \| "seen" }` | Ending 36 s bắt đầu / hoàn tất hợp lệ (kể cả Skip) |
| UI → world | `tqa:set-mascot` | `{ enabled: boolean }` | Bật/tắt mascot (menu); memory-only |
| World → UI | `tqa:ambience` | `{ stream, wind, birds, sea }` ∈ [0,1] | Mix âm môi trường ≤ 4 Hz, im khi pause; shell chỉ phát khi người xem bật Sound |
| World (thuộc tính) | `data-world-vehicle` | `parked \| manual \| cruise` | Trạng thái xe GD110 |
| World (thuộc tính) | `data-world-ending`, `data-world-mascot`, `data-world-teleport`, `data-world-intro` | — | Trạng thái cho e2e/a11y |

Mọi sự kiện world → UI phát trên container, `bubbles: false`. Không sự kiện nào gửi trạng thái secret ra ngoài trình duyệt (§7.5).
