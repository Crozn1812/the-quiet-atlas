## TICKET B2-002 — Hậu kỳ "giấy" rẻ (fog màu giấy + paper grain thủ tục)

- Trạng thái: Assigned → Codex, đợt 15, nhánh `lane/B2-002`
- Đọc trước: `docs/tickets/_common-b2.md` (quy tắc chung, điều kiện xong, bàn giao)
- Spec: §7.4 (hậu kỳ theo quality), §8 (Low ≥ 30 FPS trên Iris Xe); ADR 0013 mục 5; taste brief §5.2–5.4
- Mục tiêu (người xem thấy): thế giới như vẽ trên giấy kem — xa nhạt dần về màu giấy, có hạt giấy rất nhẹ, không lòe loẹt.
- Việc: tạo `src/features/world/post/paper.ts` xuất `createPaperPass(renderer: WebGLRenderer, opts: { quality: "Low" | "Balanced" | "High" })` trả về `{ render(scene, camera): void; setSize(w, h): void; setQuality(q): void; dispose(): void }`.
  - Render scene vào `WebGLRenderTarget` có `DepthTexture`, rồi 1 pass full-screen `ShaderMaterial` (một tam giác phủ màn hình; không thư viện postprocessing):
    1. Fog theo độ sâu tuyến tính hóa (near/far của camera) trộn về `PALETTE.paper` (import `../art/palette`), smoothstep, `fogNear`/`fogFar` mặc định 15/65 m.
    2. Paper grain **thủ tục** (hash noise theo pixel + noise tần số thấp tạo vân giấy), biên độ ≤ 4 %, **tĩnh** (không đổi theo thời gian).
    3. Vignette rất nhẹ về màu giấy (không về đen).
  - **Low**: không render target/depth — `render` gọi thẳng `renderer.render`, dựa vào `scene.fog` (Lead đặt fog màu giấy); bỏ grain. Low = 0 pass phụ.
  - Không tạo texture ảnh (0 byte asset). Màu ra đúng sRGB (tone mapping + color space như render thẳng).
  - `setSize` tôn trọng `renderer.getPixelRatio()`; `dispose` giải phóng target, depth texture, material, geometry.
- Được sửa: `src/features/world/post/paper.ts` (+ file GLSL `.ts` cùng thư mục nếu muốn), `tests/unit/world/paper.test.ts`
- Test: mock WebGLRenderer tối thiểu (không GPU): Low không tạo render target; Balanced tạo đúng 1 target + depth; setSize nhân pixel ratio; setQuality Balanced→Low giải phóng target; dispose gọi dispose cho mọi tài nguyên; uniform màu giấy đúng palette.
