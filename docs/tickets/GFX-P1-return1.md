## GFX-P1 — Lead trả lời (vòng 1)

- **Được build thêm 1 lần** (và thêm 1 lần nữa nếu lần này phát hiện lỗi phải sửa). Quy tắc 'một lần' là để tránh nghẽn máy, không phải để bỏ kiểm chứng.
- Sau build: `pnpm test:perf` (load-budget EN/VI, thời gian tới lúc chơi được ≤ 10 s, lấy lần xấu nhất) phải PASS; dán bảng.
- Chạy lại e2e world `--workers=2` trên build mới; `bash tools/lead/gate.sh .` → GATE PASS (gate có rerun khi chỉ timeout).
- Nếu hai test hình học vẫn timeout khi chạy riêng (`pnpm exec vitest run <file>`), ghi rõ thời gian; không nới timeout.
