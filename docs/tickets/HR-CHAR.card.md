## TICKET HR-CHAR — Nhân vật siêu thực (đọc HR-common.md trước)

- Lane / milestone: L3 World + asset / B3 hyper-real. Quyết định: ADR 0019, mục "Cập nhật 15/11" (Duy chốt Q-50). Audit A08.
- Hiện trạng: `public/world/character/character-duy-c.glb` (hướng C, GFX-P5) có mặt trơn, tai mũi tối giản, tóc là các búi đen, khớp tay chân chia đoạn, áo ít nếp, giày màu khối (ảnh `D:/tqa-worktrees/hr-audit-gallery/` mục A08).
- Mô tả bắt buộc (`docs/art-bible/character.md`, taste.md §5.6):
  - nam trẻ Việt Nam, dáng mảnh, cao khoảng 1,72 m, tỉ lệ người thật;
  - tóc đen ngắn hơi rối, mái lòa xòa;
  - kính tròn gọng kim loại mảnh;
  - sơ mi trắng/kem rộng xắn tay, quần short đen, tất trắng, giày vải xanh lá;
  - túi tote vải kem;
  - không logo.
  
  **Khuôn mặt người thật nhưng không giống ảnh của ai cụ thể** (không dùng ảnh trong `refs/` để dựng mặt).
- Việc:
  1. Dựng bằng Blender CLI. Base mesh người dùng nguồn có giấy phép rõ (ví dụ MakeHuman/MPFB với asset CC0, hoặc tự dựng). Gồm:
     - da: SSS giả, có pore/normal, roughness biến thiên vùng mũi và trán;
     - mắt: có giác mạc, phản chiếu;
     - tóc: dạng hair cards có alpha, nhiều lớp;
     - quần áo: mô phỏng hoặc sculpt nếp vải, vải có thớ, đường may, cổ áo, nút áo;
     - giày: vải canvas, đế cao su;
     - kính: tròng có phản chiếu.
     
     **Nếu sandbox không tải được tài nguyên:** ghi rõ URL, giấy phép và file cần vào bàn giao, rồi dừng ở mức làm được. Lead sẽ tải về.
  2. **Giữ hợp đồng runtime**: tên xương và skeleton tương thích `character/animator.ts`, `ride.ts`, `lean.ts` (đi, chạy, đứng, ngồi xe, nghiêng); chiều cao, gốc tọa độ, điểm ngồi khớp xe GD110. Nếu cần retarget thì retarget trong Blender, không đổi API.
  3. LOD0 (cận, góc lái xe), LOD1 (xa); meshopt + KTX2; nạp deferred như hiện tại. `fallback.ts` giữ bản rẻ cho Low và renderer phần mềm.
- Được sửa: `src/features/world/character/**`, `public/world/character/` (thêm hoặc thay), `tools/assets/blender/character*`, `tools/assets/blender/hr-char*`, manifest, `assets/LICENSES.csv`, `docs/art-bible/character.md` (chỉ phần thông số), test. **Không sửa** `vehicle/**`, `foliage/**`, `zones/**`, `water/**`, `terrain/**`.
- Hiệu năng: High ≥ 60 FPS RTX 3060 khi lái và khi đi bộ; ghi số trước/sau.
- Xong khi:
  - gate PASS;
  - build 1 lần **sau thay đổi cuối**, rồi e2e world `--workers=2` 43/43 trên build đó, dùng **E2E_PORT riêng của slot**;
  - có ảnh studio trước/sau ở 4 góc + cận mặt + cận tay/giày, 1 ảnh đi bộ và 1 ảnh lái xe trong world, 1 ảnh Low;
  - `check:assets` và `check:licenses` PASS.
- Không commit.
