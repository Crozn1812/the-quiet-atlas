## TICKET HR-FACE — khuôn mặt nhân vật là mặt thật của Duy
- Lane / milestone: L3 world / B3 (ADR 0019, cập nhật 16/11; taste.md §5.6 đã đổi)
- Worktree: slot W-C, E2E_PORT=4203. Làm **cực kỹ**: đây là khuôn mặt đại diện của cả dự án.

### Vì sao
Duy chấm mặt hiện tại (mẫu MakeHuman chung chung, HR-CHAR/HR-CHAR-B) là "khá đáng sợ" (uncanny). Duy muốn mặt nhân vật **giống chính Duy, chân thật từng góc cạnh**, nhìn ra là Duy. Duy là chủ chân dung và đồng ý dùng trong asset public.

### Tham chiếu
- Ảnh chính diện: `D:/the-quiet-atlas/docs/art-bible/refs/duy-face/duy-front-01.jpg` (gitignore; **không** copy ảnh gốc vào `public/`, `assets/` hay commit).
- Đặc điểm cần bắt được, so trực tiếp với ảnh:
  - Khung mặt oval hơi dài, cằm thon, gò má vừa.
  - Mắt một mí, hơi híp khi cười. Lông mày đậm, thẳng.
  - Mũi thẳng, đầu mũi tròn vừa. Môi vừa, cười lộ răng trên.
  - Tai hơi chìa. Da sáng ấm.
  - Tóc đen nâu ngắn, phần đỉnh dày dựng nhẹ và rối tự nhiên, hai bên ngắn gọn (không phải mái bằng).
  - Kính tròn gọng kim loại mảnh, màu vàng nhạt.
- Biểu cảm mặc định: thư thái, khóe miệng hơi cười, mắt hiền. Không giữ nụ cười hở răng cố định (dễ uncanny khi nhìn lâu). Nếu được, có thêm morph "cười" như ảnh cho cảnh intro/ending.

### Cách làm (gợi ý, Codex tự chọn nếu có cách tốt hơn)
1. Giữ body, rig 19 khớp, áo, tay nắm ghi đông, LOD và API hiện có (`character/hr-appearance.ts`, `baked-appearance.ts`). Chỉ thay đầu/mặt và tóc.
2. Dựng hình học mặt theo tỷ lệ đo từ ảnh: đặt landmark thủ công hoặc bằng công cụ có sẵn offline, khớp shape key MPFB2 hoặc sculpt trong Blender. Ghi rõ các tỷ lệ đã đo.
3. Texture da:
   - Chiếu ảnh chính diện lên UV mặt, khử ánh sáng/bóng đổ (de-light) để da không mang bóng của ảnh.
   - Hai bên má, thái dương, tai và cổ chưa có trong ảnh: tổng hợp liền mạch cùng tông da, không có đường nối.
   - Thêm normal và roughness cho lỗ chân lông, vùng chữ T hơi bóng.
4. Mắt: tròng nâu đen, có độ sâu, có lớp ẩm, không phản chiếu quá mức. Lông mi và lông mày dạng sợi (card).
5. Tóc theo ảnh: hair card nhiều lớp như HR-CHAR-B (alpha-to-coverage, anisotropy), kiểu tóc như ảnh.
6. Ánh sáng game: kiểm tra mặt dưới nắng sáng First Light, hoàng hôn Last Postcard, và bóng râm Roots, để mặt không xám, không bóng nhựa, không "đáng sợ".

### Bằng chứng bắt buộc
Ở `test-results/hr-face/`:
- **So sánh cùng góc với ảnh thật:** render chính diện đặt cạnh ảnh tham chiếu, cùng góc máy và tiêu cự gần đúng. Ghi danh sách điểm giống và khác.
- **Góc phụ:** studio 3/4 trái, 3/4 phải, nghiêng, sau đầu.
- **Trong game, Edge GPU High:** cận mặt, toàn thân, đang đi, đang lái xe.
- Một ảnh ở mức Low.
- FPS High, so trước và sau.

### Ràng buộc
- Chỉ dùng công cụ offline đã có trên máy (Blender 5.2, Node, sharp, KTX tools). Không tải mô hình hay dịch vụ online. Không gửi ảnh của Duy ra ngoài máy.
- `assets/LICENSES.csv`: texture sinh từ ảnh ghi là "Nguyễn Hữu Bảo Duy, own photo, owner consent 2026-11-16". Phần MPFB2 vẫn ghi CC0.
- Không logo, áo trơn.
- Được sửa: `src/features/world/character/`, `tools/assets/blender/hr-face*`, `public/world/character/`, `assets/LICENSES.csv`, test unit liên quan.
- Không được sửa: water/, shore/, fauna/, terrain/, vehicle/, scene/, zones/, lockfile, docs/.

### Điều kiện xong
- lint, typecheck, vitest, build.
- `E2E_PORT=4203 pnpm exec playwright test tests/e2e/world --workers=2`.
- check:assets, check:licenses.
- Đủ bằng chứng ảnh như trên.

### Bàn giao
Tóm tắt; lệnh đã chạy kèm output thật; ảnh so sánh; danh sách điểm chưa giống. Không commit.
