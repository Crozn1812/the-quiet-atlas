# T08/T09 — laptop Iris Xe của Duy

Máy nghiệm thu theo [ADR 0007](../adr/0007-benchmark-reference-machine.md): ASUS Vivobook Flip, i5-13500H / Iris Xe / 16 GB. **NOT RUN** đến khi đo hợp lệ trên chính laptop này; desktop chỉ tham khảo.

1. Cắm sạc, chọn Balanced/Cân bằng, tắt tiết kiệm pin. Dừng worker/build/Blender và các phép đo khác. Giữ Edge phía trước suốt lượt; không thu nhỏ hay sử dụng máy song song.
2. Ghi commit đang test, OS build, Edge version, GPU/driver, độ phân giải, tần số quét, DPR, nguồn điện. `machine.json` ghi RAM khả dụng theo OS; không thay bằng RAM desktop.
3. `pnpm install`, `pnpm build`. Chạy lần lượt trong PowerShell:

```powershell
$env:PERF_MACHINE_LABEL = "laptop iGPU i5-13500H Iris Xe"
pnpm exec playwright test -c tests/perf/playwright.frame.config.ts t08
$env:PERF_LONG = "1"
pnpm exec playwright test -c tests/perf/playwright.frame.config.ts t09
node tools/frame-budget/index.mjs report
Remove-Item Env:PERF_LONG
Remove-Item Env:PERF_MACHINE_LABEL
```

Cấu hình tự phục vụ `out/` cổng 4175 và mở Edge thật. T08: mỗi kịch bản 3 lần, warm-up 30 s + đo 60 s; từng lần Low phải FPS trung bình ≥30, p95 ≤50 ms, ≤1% frame >100 ms, không frame >250 ms trong đoạn ổn định. Balanced và Low CPU4× là tham khảo. T09: 10 phút di chuyển + 20 vòng Menu/overlay, không crash, tài nguyên không tăng liên tục sau warm-up. Không giảm thời lượng, thay ngưỡng hoặc lấy kết quả desktop làm PASS laptop.

Giữ CSV, JSON, heap snapshots và console trong `test-results/frame-budget/`; copy sang thư mục bàn giao riêng. Lượt mất focus/paused/throttling hoặc lỗi script chưa chứng minh đạt: giữ log và đánh dấu rõ FAIL/NOT RUN. Kiểm thêm Welcome/Quick và thông báo cần chuột khi máy ở chế độ laptop và tablet gập.

Biểu mẫu chấm trải nghiệm và lộ trình 20–30 phút: [rc-guide.md](../playtest/rc-guide.md). Chi tiết script: [frame config](../../tests/perf/playwright.frame.config.ts), [T08](../../tests/perf/t08-frame-budget.frame.ts), [T09](../../tests/perf/t09-stability.frame.ts).

