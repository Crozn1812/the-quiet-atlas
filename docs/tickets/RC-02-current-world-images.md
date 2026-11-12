## RC-02 — Ảnh sản phẩm sau R1
- Trạng thái: doing; Lead tự thi công trong checkout RC-01.
- Vùng file: public/zones/*.webp, public/welcome/*.webp, assets/LICENSES.csv; bằng chứng docs/showcase/35-rc/.
- Mục tiêu: bưu thiếp và Welcome phản ánh đúng world R1, không dùng ảnh trước R1.
- Không đổi runtime/geometry/shader.
- Phép thử: zone-content-shots (8 ảnh High 960×640 ≤60KB + overlay desktop/mobile axe); welcome-shots hero/after; gate; full e2e, bundle/load-budget/Lighthouse trên commit nguồn cuối.
- Review: Lead đã mở đủ 8 bưu thiếp và 3 hero ứng viên, chọn hero-0 (biển, chân trời rõ, landmark phía phải). Bưu thiếp không có HUD, landmark đọc được; ảnh Old Trail khá trống, giữ để Duy chấm.
- Nguồn: source 3bb0752; Edge High, localhost:4185. Lượt capture đầu dùng export webpack do dependency junction; render runtime cùng source. Sau đó đã có dependency vật lý để build Turbopack chuẩn, cần kiểm lại.
