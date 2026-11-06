## TICKET B2-213: tán lá mềm kiểu tranh (hết mặt lục giác phẳng)

- Đọc `_finish-common.md`. Được sửa: `src/features/world/foliage/instances.ts` (shader lá), `src/features/world/foliage/shapes.ts` (chỉ nếu cần thêm thuộc tính UV cho cụm lá), test foliage. Không thêm vertex attribute vượt 16 (test attribute-budget).

### Vấn đề

- Mỗi cụm lá là một khối icosa thấp đổ bóng ramp → nhìn thấy rõ **mặt lục giác phẳng**, viền cứng → chất low-poly, "khung".

### Việc

1. Viền cụm lá **răng cưa mềm**: trong fragment shader, dùng noise 3D theo vị trí object-space (tần số 6–10/m) để `discard` ở mép silhouette (dựa vào `dot(normal, viewDir)` gần 0 → vùng mép) tạo mép lá lởm chởm; giữ alpha-to-coverage tắt (dùng discard), shadow pass dùng cùng logic.
2. **Biến sáng trong cụm**: noise tần số cao (15–25/m) điều chế ramp ±12 % để thấy "chùm lá" bên trong mặt phẳng, không mặt phẳng trơn.
3. Normal làm mượt theo tâm cụm (đã có) giữ nguyên.
4. Hiệu năng: không thêm draw call/pass; chi phí shader thêm ≤ 2 noise 3D mỗi fragment.

### Test thay mắt

- Mô phỏng CPU hàm mép: trên vòng silhouette của 1 cụm, tỉ lệ điểm bị discard 25–55 %, và chu vi mép (đếm đổi trạng thái) ≥ 3 lần hình tròn trơn.
- Hàm biến sáng: độ lệch chuẩn luma trong cụm ≥ 0,04 và ≤ 0,12 (không nhiễu sạn).
- Test foliage/attribute-budget pass.
