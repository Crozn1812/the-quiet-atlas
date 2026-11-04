# Runbook — Codex worker song song (ADR 0012)

Lệnh chạy một ticket, flag cấm, quy ước worktree: xem `docs/runbook/codex.md` (không đổi).

## Số worker đang dùng: **5** (chọn 2026-11-04)

| Yếu tố | Đo/biết được | Ảnh hưởng |
|---|---|---|
| CPU máy dev | i5-14400F, 16 luồng | Codex worker phần lớn chờ model (nhẹ CPU); build Next/vitest dùng 2–4 luồng mỗi lần |
| RAM | 32 GB (Windows báo 31,8) | Mỗi worktree có `node_modules` + build ≈ 1–2 GB lúc chạy; e2e Edge ≈ 1,5 GB; Blender headless ≈ 1–3 GB → 5 worker + Lead còn dư |
| GPU | RTX 3060 12 GB | Blender render/bake và T08 tham khảo dùng GPU → **không** chạy song song với nhau |
| Giới hạn lượt Codex | Chưa biết hạn mức thật của gói ChatGPT của Duy | Nếu Codex báo rate limit → giảm còn 3 |

Lý do chọn 5 (đúng mức Duy đề xuất): RAM là giới hạn thật đầu tiên; 5 worker cùng tối đa 3 việc nặng (§3.1 CLAUDE.md) vẫn dưới ~20 GB.

## Quy tắc tăng/giảm

- **Tăng lên 6–7** khi: 2 đợt liên tiếp không có rate limit, RAM đỉnh < 70 %, và hàng `todo` > 2× số worker.
- **Giảm còn 3** khi: rate limit Codex, RAM đỉnh > 85 %, hoặc hàng `review` của Lead > 3 ticket (Lead là nút cổ chai — thêm worker vô ích).
- Ghi mỗi lần đổi vào bảng "Nhật ký" bên dưới.

## Việc nặng (tối đa 3 cùng lúc)

`pnpm build`, `pnpm test:e2e`, `pnpm test:perf`, `perf:lhci`, Blender render/bake, ffmpeg encode video showcase.

## Việc chạy một mình

**T08/T09** (dGPU tham khảo hoặc laptop Iris Xe): dừng mọi worker (`codex` và Blender), đóng trình duyệt khác, rồi mới đo.

## Vai Claude subagent (chỉ 3)

| Vai | Khi nào | Đầu ra |
|---|---|---|
| Art Director | Mỗi ảnh/video showcase, mỗi style frame | Checklist theo `docs/art-bible/taste.md`: giữ / sửa / bỏ + lý do |
| Perf Watcher | Sau mỗi merge có asset/shader | Byte tải (≤ 8 MB bắt đầu, ≤ 30 MB world), draw call, FPS dGPU tham khảo |
| QA/spec cross-check | Trước khi merge ticket chạm hành vi | Đối chiếu spec + chạy e2e liên quan |

## Nhật ký

| Ngày | Số worker | Lý do |
|---|---|---|
| 2026-11-04 | 5 | Khởi đầu theo ADR 0012; chưa đo RAM đỉnh với 5 worker |
