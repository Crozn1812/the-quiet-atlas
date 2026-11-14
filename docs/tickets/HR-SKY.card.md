## TICKET HR-SKY — Mây và bầu trời thật (đọc HR-common.md trước)

- Lane / milestone: L3 World / B3 hyper-real.
- Hiện trạng (ảnh `D:/tqa-worktrees/W-D/test-results/hr-far/production/*-far.png`): mây là các khối dẹt màu kem, viền rõ, đáy phẳng như mây hoạt hình. Trời là gradient xanh đều, cả bầu trời không có tầng lớp.
- Việc:
  1. Mây nhiều tầng: cumulus có đáy phẳng xám xanh, đỉnh sáng, mép tơi (raymarch nhẹ hoặc impostor từ volumetric bake), mây ti mỏng tầng cao, sương mù chân trời. Có ánh xuyên qua mây ở rìa (silver lining) theo hướng mặt trời của world.
  2. Bầu trời vật lý (atmospheric scattering): đậm ở thiên đỉnh, nhạt và ấm dần ở chân trời, khớp màu sương mù và ánh sáng hiện có. Không đổi hướng mặt trời và giờ trong ngày đã chốt.
  3. Mây trôi chậm. Low và renderer phần mềm dùng skybox tĩnh bake từ bản High.
- Được sửa: `src/features/world/sky/**`, `public/world/tex/` (thêm), `assets/LICENSES.csv`, test. **Không sửa** `scene/far-*` (HR-FAR), `terrain/**`, `foliage/**`, `props/**`, `post/**`, `vehicle/**`.
- Hiệu năng: High ≥ 60 FPS RTX 3060; ghi số trước/sau.
- Xong khi:
  - gate PASS;
  - build 1 lần **sau thay đổi cuối**, rồi e2e world `--workers=2` 43/43 trên build đó;
  - có ảnh High trước/sau cùng góc ở 4 khu, nhìn lên trời và chân trời; 1 ảnh Low;
  - `check:assets` và `check:licenses` PASS.
- Không commit.
