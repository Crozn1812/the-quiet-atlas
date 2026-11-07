# ADR 0014: Đợt sản xuất đồ họa (asset GLB + texture KTX2)

- Trạng thái: **Accepted** (2026-11-07, Duy: "Có, mở đợt đồ họa")
- Liên quan: ADR 0013 (hướng A "Tranh chân thật", art bible đã khóa), `docs/art-bible/asset-budgets.md`, spec §8

## Bối cảnh

Đến đợt 29, thế giới đã có đủ:
- cấu trúc 8 khu;
- ánh sáng theo art bible;
- cảnh mở đầu và cảnh kết;
- tương tác.

Nhưng hình ảnh vẫn ở mức khung:
- cây procedural low-poly, mọc thưa;
- mặt đất chỉ có màu đỉnh trên lưới 2 m, nên nhòe và phẳng;
- đá và prop còn đơn giản;
- nước phẳng;
- chưa có AO.

Ràng buộc cũ "chỉ hình học thủ tục TypeScript, không ảnh hay GLB mới" (`_asset-common.md`) đang chặn chất lượng.

## Quyết định

1. Từ đợt 30 cho phép:
   - **GLB** dựng bằng script Blender trong `tools/assets/blender/`, tối ưu bằng `tools/assets/optimize.mjs` (meshopt);
   - **texture KTX2** (ETC1S cho màu, UASTC cho normal) do **dự án tự sinh** bằng script Node hoặc Blender (nhiễu, vân đá, cỏ, cát). Không dùng pixel của bên thứ ba.
   Mỗi file public có một dòng trong `assets/LICENSES.csv`, ghi "project-original".
2. Ngân sách giữ nguyên:
   - bắt đầu chơi ≤ 8 MB (hiện 2,0 MB);
   - cả world ≤ 30 MB;
   - vào chơi ≤ 6 s (hiện 5,2 s);
   - FPS ở mức Low trên Iris Xe theo spec §8;
   - trần tam giác mỗi biến thể theo `asset-budgets.md`.
   Không nâng trần để hợp thức hóa kết quả.
3. Thứ tự các trụ G:
   - **G-01** texture mặt đất (cỏ/rêu, đất, đá, cát), splat theo mặt nạ màu đỉnh sẵn có, dùng triplanar cho vách;
   - **G-02** cây lá rộng và thông dựng bằng Blender, có cành thật, tán nhiều thùy, có LOD;
   - **G-03** đá, khúc gỗ, prop có chi tiết, AO nướng vào màu đỉnh;
   - **G-04** ánh sáng: AO màn hình nhẹ (High bật; Balanced nửa độ phân giải hoặc tắt) và bóng mềm hơn;
   - **G-05** nước: normal gợn dạng KTX2, phản chiếu trời theo Fresnel, bọt ở bờ.
4. **Vòng duyệt gu trước khi sản xuất hàng loạt** (ADR 0013 §4):
   - mỗi trụ làm mẫu ngay trong engine;
   - chụp trước/sau đủ 8 khu cùng cảnh mở đầu và cảnh kết; đo thời gian tải và CPU;
   - Duy đánh dấu giữ/sửa/bỏ ở `docs/showcase/30-do-hoa/checklist.md`;
   - chỉ sau đó mới nhân rộng.
5. Asset nặng mà khung đầu không cần thì tải **sau** khi vào chơi (deferred). Asset cần cho khung đầu tính vào 8 MB.

## Hệ quả

- Với các ticket G, mục 1 ở trên thay cho mục "không file ảnh hay GLB mới" trong `_asset-common.md`.
- FPS trên Iris Xe (T08/T09) càng quan trọng. Mỗi trụ có công tắc theo mức chất lượng; ở Low thì tắt phần nặng.
