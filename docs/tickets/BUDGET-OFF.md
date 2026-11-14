## TICKET BUDGET-OFF — Gate ngân sách chuyển sang chế độ báo cáo (Duy bỏ trần, ADR 0019)

- Lane / milestone: L5 Platform + L4 QA.
- Bối cảnh: Duy 14/11: "không có giới hạn gì cả". ADR 0019 (cập nhật) bỏ trần tổng world MB, byte, tam giác, draw call, thời gian tới lúc chơi được, CPU. Các script/test hiện **fail** khi vượt trần (30 MB world, ≤ 10 s, byte bắt đầu chơi…), sẽ làm CI đỏ khi asset siêu thực vào.
- Việc:
  1. Liệt kê mọi nơi chặn theo trần: `package.json` scripts `check:assets`, `check:bundle`, `test:perf`/load-budget (tests/e2e hoặc tests/perf), `tools/checks/**`, workflow `.github/workflows/**`, script deploy REL-03 (asset-budget trước OIDC), test unit kiểm byte/tam giác/draw của từng khu, `tools/lead/gate.sh` nếu có.
  2. Đổi phần **trần** sang **báo cáo**: in số đo + so với lần trước, exit 0. Giữ **chặn** các kiểm tra không phải trần: license thiếu dòng, leaks, **0 chunk 3D trước Enter World**, lỗi console/page, e2e chức năng, file hỏng (KTX2/GLB không đọc được).
  3. Test unit đang khẳng định trần (vd. `≤ 25000` tam giác, `≤ 8` draw, `≤ 200 ms` build) → đổi thành ghi số hoặc kiểm bất biến không phải trần (vd. "có LOD", "instanced"), **không xóa** test bất biến khác.
  4. Ghi trong `docs/runbook/full-check.md` cách đọc báo cáo.
- Được sửa: `tools/checks/**`, `tests/**` (chỉ chỗ khẳng định trần), `.github/workflows/**`, `docs/runbook/**`. `package.json`: **ghi đề xuất** trong bàn giao, Lead sửa.
- Không được sửa: `src/**`, `public/**`, lockfile.
- Xong: liệt kê từng chỗ đã đổi (file:dòng, trước/sau); `pnpm check:assets`, `check:bundle`, `check:licenses`, `check:leaks` exit 0 trên main; gate PASS. Không build nếu không cần. Không commit.
