## TICKET HR-FAR — Đồi núi xa và đường chân trời siêu thực (đọc HR-common.md trước)

- Lane / milestone: L3 World / B3 hyper-real.
- Bối cảnh: cảnh gần đã siêu thực (rừng HR, suối, vách, biển, ánh sáng HR-LIGHT), nhưng **đồi núi xa** (`scene/far-landscape.ts`) vẫn là khối xanh đậm nhiều mặt phẳng, cạnh gãy thấy rõ (ví dụ góc Workshop, Old Trail, Horizon), và cây xa trên đồi Horizon là vài cây rời trên sườn trơn.
- Việc:
  1. Đồi/núi xa: lưới mịn hơn với noise nhiều tầng (ridge, xói mòn), silhouette **phủ rừng** (texture/impostor tán rừng nhìn từ xa, sáng tối theo hướng nắng), sườn đá lộ ở chỗ dốc, chuyển màu xanh xám theo khoảng cách (khớp aerial haze của HR-LIGHT), không còn mặt phẳng/cạnh gãy thấy được ở High.
  2. Sườn đồi gần Horizon: thêm cụm rừng/bụi theo sinh cảnh bằng impostor/instancing của kho HR-TREE1 (không đặt trên lối đi, tuabin gió, khu tương tác).
  3. Giữ FIX-PATCH (nền xa không đâm xuyên lối mòn) và giữ test của nó.
- Được sửa: `src/features/world/scene/far-landscape.ts`, file mới `scene/far-*.ts`, `public/world/far/`, `assets/LICENSES.csv`, test. **Không sửa** `foliage/**`, `zones/*-dressing.ts` (HR-PROPS đang làm), `post/**`.
- Hiệu năng: High ≥ 60 FPS RTX 3060 (như PERF-HR); ghi số trước/sau.
- Xong: gate PASS; build 1 lần **sau thay đổi cuối**; e2e world `--workers=2` 43/43 trên build đó; ảnh High trước/sau cùng góc (Workshop, Old Trail, Horizon, Milestones nhìn xa) + Low. Không commit.
