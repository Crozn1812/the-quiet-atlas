## HR-FAR — trả lại vòng 2 (cuối cùng; Lead so `before/1600x900-high-*-far.png` với `ingame-high/*-far.png`)

Vòng 1 đã sửa được sọc dọc và khối "súp lơ". Nhưng **ảnh sau gần như giống hệt ảnh trước**: núi xa vẫn là **hình nón đối xứng, mặt trơn một màu xanh xám**, nên mục tiêu siêu thực của ticket chưa đạt. Vòng này làm cho núi xa thật:

1. **Hình núi:** heightfield dạng dãy núi bị xói mòn, dùng ridged multifractal + domain warp, hoặc bake trong Blender rồi xuất mesh. Gồm sống núi chính, sống phụ tỏa ra, thung lũng chữ V, vai núi; đỉnh lệch, không đối xứng. **Không còn silhouette nào là hình nón.**
2. **Phân lớp xa gần:** 3–4 lớp dãy núi. Lớp gần có màu rừng xanh đậm, thấy được cấu trúc tán (texture tán rừng nhìn từ xa) và sườn đá lộ ở chỗ dốc. Lớp xa nhạt dần sang xanh lam theo aerial perspective. Có sương đọng ở thung lũng giữa các lớp.
3. **Ánh sáng:** sườn hướng mặt trời sáng ấm, sườn khuất tối lạnh. Có bóng của sống núi trên sườn (bake vào texture cũng được).
4. Không sửa `terrain/**` (vách gần, HR-TERRAIN-CLIFF), `foliage/**`/`props/**` (cây đồi, HR-PROPS2), `sky/**` (mây, HR-SKY).

Điều kiện xong giữ như card. Cần ảnh trước/sau ở 4 góc `-far`, và thêm 1 ảnh cận tele (FOV hẹp) vào dãy núi xa nhất để thấy chi tiết. Không commit.
