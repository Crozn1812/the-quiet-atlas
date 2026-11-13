# Playbook của Lead: từ hôm nay tới bản phát hành (2026-11-13)

Đọc file này **đầu mỗi phiên Lead** (Claude CLI hoặc desktop), sau `CLAUDE.md` và `docs/runbook/lead-workers.md`.

## 0. Mục tiêu và lời Duy

- Dự án chạy được 20 ngày. Duy muốn portfolio **hoàn thành**; phần Duy làm chỉ còn thao tác cloud và đưa lên internet.
- Lời Duy (2026-11-13):
  - "Bạn vẫn là lead, dẫn mấy đứa kia làm việc";
  - "Hãy sử dụng các công nhân của mình … đừng tiêu tốn usage của bản thân quá nhiều";
  - "tận dụng hết công suất các công nhân, các lượt reset usage";
  - "khi nào đồ hoạ hoàn thành mình sẽ chấm luôn".
- Hệ quả:
  - Lead **không tự code** và không theo dõi log liên tục.
  - Lead chỉ làm 4 việc: viết card, giao việc, review ngắn, merge.
  - **Không worker nào được rảnh** khi còn ticket READY.

## 1. "Xong" nghĩa là gì (Definition of Done để phát hành)

1. **Đồ họa hoàn thành:**
   - hướng do Duy chọn sau spike GFX (`docs/tickets/GFX-AAA.md`);
   - áp đủ 8 khu, cảnh mở đầu và cảnh kết;
   - Duy chấm một lần ở cuối.
2. **Map thu ngắn** (ADR 0017, MAP-01) và toàn bộ feedback vòng 2 đã merge.
3. **Gate trên main**, ghi số thật vào `PROJECT_STATUS.md`:
   - lint, typecheck, unit;
   - full e2e;
   - load-budget, Lighthouse, CPU ABBA;
   - check:licenses / check:assets / check:cv / leaks.
4. **CI GitHub xanh:** sửa lỗi gitleaks (Q-21). Push chỉ khi Duy duyệt từng lần.
5. **Bộ phát hành cho Duy** (không chạm cloud):
   - Terraform `infra/` đủ và `terraform validate` (nếu máy chạy được);
   - workflow deploy `workflow_dispatch` (S3 + CloudFront invalidation, OIDC, không key tĩnh);
   - runbook từng bước: Budgets, hosted zone, đổi nameserver `nhbduy.id.vn`, ACM, apply, deploy, kiểm tra sau deploy.
6. **Những thứ chỉ Duy làm được**, ghi trong `DUY_QUEUE.md`, không chặn phần còn lại:
   - T08/T09 trên laptop Iris Xe;
   - T10 chấm;
   - screen reader và zoom thật.

## 2. Backlog theo vùng file (chạy song song được)

Quy tắc chia vùng: hai ticket đang chạy không được chung file. `src/features/world/` lớn nên chia theo thư mục con. MAP-01 giữ phần vị trí (`layout/`, `terrain/height.ts`, `road/layout.ts`, `zones/*` phần đặt vị trí) cho tới khi merge.

| Ưu tiên | Ticket | Vùng file | Ai làm hợp | Trạng thái 13/11 |
|---|---|---|---|---|
| 1 | MAP-01 thu ngắn tuyến | layout, terrain/height, road/layout, zones (vị trí), tests | Codex A, effort high | đang chạy |
| 1 | PERF-FL03 CPU về +10 ms/s | forest-ceiling, first-light-grove, dawn-shafts, fish, spring | Codex B | đang chạy |
| 1 | GFX-01 spike ánh sáng/hậu kỳ (3 hướng A/B/C) | tools/styleframes, tools/assets/textures | Codex C + Blender 9878 | đang chạy |
| 1 | GFX-02 kho asset CC0 | public/world/lib, assets/lib, blender/lib-*.py | agy + Blender 9879 | đang chạy |
| 2 | REL-01 workflow deploy (chỉ viết, không chạy) | `.github/workflows/deploy.yml`, `docs/runbook/deploy.md` | worker rảnh đầu tiên | READY |
| 2 | REL-02 Terraform rà soát + validate + `plan` khô (không apply, không credential) | `infra/**`, `docs/runbook/terraform.md` | worker rảnh | READY |
| 2 | CI-01 sửa gitleaks FAIL (Q-21): chạy gitleaks bằng binary/WASM local nếu được, sửa allowlist đúng nguyên nhân | `.gitleaks.toml`, `.github/workflows/pr.yml`, `tools/checks/*` | worker rảnh | READY |
| 2 | UI-06 lỗi Welcome 320 px: email trong HUD co về rộng 0 (E2E-R2 phát hiện) | `src/components/portfolio/*`, `src/app/portfolio.css` | worker rảnh | READY |
| 2 | CONTENT-01 rà `TBD` (50 chỗ trong `src/content`): chỗ nào lên public thì chuyển thành câu hỏi cho Duy trong `DUY_QUEUE.md`; không bịa | `src/content/*` (đọc), Lead ghi DUY_QUEUE | worker rảnh viết danh sách, Lead gửi Duy | READY |
| 3 | GFX-P* sản xuất đồ họa theo hướng Duy chọn (sau spike + MAP-01) | chia mỗi ticket một hệ: nước, trời/hậu kỳ, vật liệu đất-đá, cây rừng, cây đồi, bờ biển, nhân vật | cả 4–6 worker cùng lúc | chờ spike |
| 3 | Ghép asset lib vào world theo khu | mỗi khu 1 ticket (`zones/<khu>.ts` + dressing) | cả đội | sau MAP-01 |
| 4 | Gate cuối + showcase cho Duy chấm | Lead chạy script, không code | Lead | cuối |

Khi một worker rảnh mà ưu tiên 1 chưa xong, lấy ưu tiên 2. Không ai ngồi chờ spike.

## 3. Vòng lặp của Lead (rẻ token)

1. Giao việc:
   - Codex: `CODEX_HOME=C:/Users/PC-LP/.codexN bash tools/lead/dispatch.sh <ID> <card> [effort]`;
   - Antigravity: `bash tools/lead/dispatch-agy.sh <ID> <card> [effort]`.

   Chạy nền.
2. Chờ bằng **một** lệnh nền `bash tools/lead/wait-any.sh <ID1> <ID2> …`. Lệnh này không tốn token, thoát khi có ticket DONE hoặc LIMIT. Không đọc log trong lúc chờ.
3. Ticket DONE:
   - đọc 30 dòng cuối `D:/tqa-worktrees/<ID>.last.md`;
   - xem **một** ảnh so sánh;
   - nếu đạt: `bash tools/lead/merge.sh <ID> <msg>` (gate chạy trong đó);
   - nếu chưa đạt: viết `docs/tickets/<ID>-returnN.md` cụ thể, đo được, rồi `resume.sh`. Tối đa 2 vòng; vòng 3 chia nhỏ ticket hoặc giao worker khác.
4. Ngay sau bước 3: **giao ticket READY tiếp theo cho worker vừa rảnh**, rồi quay lại bước 2.
5. Xung đột khi merge: `git merge main` trong worktree, gỡ xung đột nhỏ, commit, rồi `merge.sh`. Merge xong thì nhắn cho worker nào cần rebase.

## 4. Lượt dùng (quota) và reset

- **Codex hết lượt (LIMIT):** chuyển ticket sang tài khoản khác bằng `CODEX_HOME=… bash tools/lead/resume.sh <ID> <card>`. Thứ tự thử: tài khoản còn nhiều lượt nhất → Antigravity (`dispatch-agy.sh`, chạy tiếp trong cùng worktree) → hẹn giờ hồi lượt bằng `autoresume.sh`.
- **Reset usage:** hai tài khoản Codex có lượt reset đầy. Duy cho Lead dùng khi weekly còn **dưới 10 %** và hàng đợi còn việc. Lần đầu cần dùng thì hỏi Duy đó là tài khoản nào và cách bấm; ghi lại vào đây.
- **Thêm worker:** Duy đăng nhập `.codex4` và `.codex5` thì dùng ngay (`auth.json` xuất hiện). Mở thêm Blender bằng `bash tools/lead/blender-workers.sh 9880 9881` và thêm `BLENDER_PORT` cho tài khoản đó (xem `lead-workers.md`).
- **Một tài khoản chạy 2 ticket cùng lúc** được, nếu vùng file tách nhau. Nhưng nó tốn lượt nhanh gấp đôi; chỉ làm khi còn reset.
- **Claude (Lead):** tiết kiệm. Ở 97 % weekly thì bàn giao Lead cho Codex theo memory `claude-95-handoff-codex`.

## 5. Luật vẫn giữ (tóm tắt CLAUDE.md §6)

- Không bịa nội dung.
- Không ghi PASS khi chưa chạy.
- Không chạm cloud, không xử lý credential.
- Không push khi chưa có Duy duyệt từng lần.
- Mỗi asset phải có dòng trong `LICENSES.csv`.
- Commit trên main **kèm đường dẫn**.
- Worker chạy sandbox `workspace-write`; không dùng các cửa sổ YOLO.
