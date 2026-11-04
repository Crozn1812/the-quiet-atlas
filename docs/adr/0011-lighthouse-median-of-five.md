# ADR 0011 — Lighthouse CI: trung vị 5 lần thay vì lần xấu nhất trong 3 lần

- Trạng thái: **Accepted** — Duy quyết (Q-24, phương án A), 2026-11-04
- Spec: §8 "Quick web UX" (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1; lab trước launch). §8 không quy định số lần/cách gộp cho dòng này (quy định "ba lần, xấu nhất" chỉ cho Time to playable).

## Bối cảnh

- L3-004 chọn 3 lần, `pessimistic` (gate theo lần xấu nhất).
- CI đỏ ở đợt 11 (`/en/` TBT 232 ms) và đợt 12 (246/96/104 ms). Lần xấu rơi vào runner GitHub chậm bất thường (benchmarkIndex ~1900, bootup 479 ms; các lần khác ~2440 / ~250 ms).
- L1-014 (trace CPU×10) cho thấy TBT ở CPU rất chậm là sàn của runtime Next/React (~170–200 ms), giống nhau ở Welcome, Quick và privacy (0 client component). Build webpack không cải thiện.

## Quyết định

- `numberOfRuns: 5`; LCP, CLS, TBT gate theo `median-run`. **Ngưỡng giữ nguyên** (2500 ms / 0,1 / 200 ms).
- Accessibility score vẫn `pessimistic`, chỉ warn (gate a11y là axe).
- Bước annotation trong `.github/workflows/pr.yml` chạy **mọi lần** (không chỉ khi fail), in từng lần đo; lần nào vượt ngưỡng in mức `warning`. Lần xấu nhất không bị che.

## Minh bạch

Thay đổi được đưa ra **sau** khi CI đỏ. Đây là đổi phương pháp gộp, không đổi ngưỡng; quyết định của chủ dự án sau khi Lead trình bày đủ 3 phương án (A trung vị 5 lần, B chạy lại khi đỏ, C chấp nhận đỏ) và bằng chứng sàn framework. Nếu trung vị cũng vượt ngưỡng thì đó là FAIL thật.

## Hệ quả

- Job CI dài thêm ~2 lần đo × 3 URL (~1–2 phút).
- Kiểm local (`pnpm perf:lhci`, `docs/runbook/full-check.md`) dùng cùng cấu hình.
- Field INP p75 sau launch vẫn báo riêng (§8 [S5]).
