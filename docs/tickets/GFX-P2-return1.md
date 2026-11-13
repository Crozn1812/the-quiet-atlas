# GFX-P2 — trả lời Lead lượt 1

- Đồng ý: được thêm **đúng một lần** build WASM/webpack nữa để kiểm chứng bản sửa deferred/Low.
- Sau build: e2e world `--workers=2`, `pnpm test:perf` (thời gian tới lúc chơi được ≤ 10 s, dán số), ảnh High 8 khu + Low First Light, `pnpm check:assets`, `bash tools/lead/gate.sh .` → GATE PASS.
- Asset +13,1 MB là nhiều: các ticket P1/P3/P5 cũng thêm asset vào cùng trần 30 MB. Nếu còn texture nào 2K mà ảnh High không thấy khác so với 1K (đường xa, cát, nhựa đường), hạ xuống 1K. Ghi byte trước/sau.
- Không commit. Cập nhật bàn giao `tools/assets/textures/GFX-P2-handoff.md` với output thật.
