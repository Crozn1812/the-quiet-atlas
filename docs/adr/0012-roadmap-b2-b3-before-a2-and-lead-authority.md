# ADR 0012 — Lộ trình: làm B2 + B3 ở local trước A2; toàn quyền kỹ thuật của Lead; mô hình hàng đợi Codex

- Trạng thái: **Accepted** (Duy quyết 2026-11-04, `quyet-dinh-duy-2026-11-04.md` mục 1–4, 8)
- Thay thế: quy tắc spec §12 "B2 chỉ bắt đầu khi A2 đã live; B3 chỉ khi A3 xong"; CLAUDE.md §2–3 (5 lane cố định, Lead không nhận ticket)
- Liên quan: ADR 0007 (máy tham chiếu), ADR 0011 (Lighthouse), ADR 0013 (hướng art)

## Bối cảnh

A2 (đưa lên AWS) bị chặn bởi việc AWS duyệt credit (Q-08) — không phụ thuộc đội. Track A (A0/A1) đã duyệt nội dung, CI xanh. Nếu giữ §12, đội ngồi chờ không thời hạn.

## Quyết định

1. **Hoãn A2** tới khi AWS duyệt credit. Trong lúc đó làm **B2 + B3 ở local**: art, hoạt ảnh, đồ họa, xe, secrets, cinematic, mascot, âm thanh, Atlas Journal.
2. **Track A đóng băng nhưng được bảo vệ**: CI chạy đủ mọi gate của A (lint, typecheck, unit, build, check-bundle, leaks, gitleaks, licenses, e2e, load budget, Lighthouse median ADR 0011, terraform validate) trên **mọi PR**. Thay đổi B nào làm đỏ gate A → không merge. Không nới ngưỡng.
3. **Ngân sách §8 là gate của B**: ≤ 8 MB để bắt đầu chơi, ≤ 30 MB cả world, FPS/frame time đo trên **laptop Iris Xe** (ADR 0007). Mọi hậu kỳ tranh/film có bản rẻ cho Low.
4. **Toàn quyền của Lead** về công cụ, thư viện, cài đặt (Blender, gltf-transform, KTX-Software, ffmpeg…), cấu trúc thư mục, cách chia việc và quyết định kỹ thuật/art trong khung bản sắc spec §2 và taste brief (`docs/art-bible/taste.md`). Không hỏi Duy những việc này; quyết định lớn ghi ADR.
5. **Luật cứng không đổi** (CLAUDE.md §6): không bịa; không mua/đăng ký dịch vụ trả phí; không chạm cloud/credential; asset có giấy phép rõ ràng, ghi `assets/LICENSES.csv`, AI chỉ dùng công cụ cho phép thương mại; repo public → kiểm quyền phân phối file nguồn (vd. Mixamo: dùng trong sản phẩm, **không commit file gốc**); tham chiếu chỉ để lấy cảm hứng; không tái tạo logo/thương hiệu (Chiefs, Suzuki).
6. **Mô hình làm việc** (thay 5 lane cố định):
   - Ticket rất nhỏ (30–90 phút, 1 vùng file) trong `docs/tickets/queue.md`.
   - **Codex worker song song**, mỗi worker 1 worktree. Bắt đầu với **5** (lý do ở `docs/runbook/codex-workers.md`).
   - Claude subagent chỉ 3 vai: **Art Director**, **Perf Watcher**, **QA/spec cross-check**.
   - Lead: review, tích hợp; **tự nhận ticket khi hàng review trống**. Không để worker ngồi chờ.
   - Benchmark GPU (T08) chạy **một mình**.
7. **Nội dung Duy chốt**: email công khai giữ `duybao09012004@gmail.com` (Duy biết rủi ro spam); chức danh hiển thị **"CloudDevOps Engineer · Fresher"** trên Welcome, Quick, CV, OG, JSON-LD (EN/VI). Mục kinh nghiệm HPT vẫn ghi đúng sự thật "Cloud & DevOps Intern" (07/2026 – nay).

## Hệ quả

- Rủi ro §17 "game kéo dài, portfolio trễ" tăng; giảm bằng mục 2 (A đóng băng + gate trên mọi PR) và mục 3.
- Khi credit AWS được duyệt: Lead mở lại A2 và ưu tiên A2 hơn ticket B mới (ticket B đang làm được làm xong).
- Báo cáo mỗi đợt bằng tiếng Việt, mở đầu bằng link ảnh/video showcase (`docs/showcase/<đợt>/`).

## Xem xét lại khi

- Credit AWS duyệt (Q-08) → A2 quay lại ưu tiên.
- Ngân sách tải/FPS của B vượt trần hai đợt liên tiếp → dừng thêm nội dung, chỉ tối ưu.
