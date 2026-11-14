## TICKET HR-FAR-B — Hoàn thiện núi xa (chia nhỏ từ HR-FAR sau 2 vòng trả lại)

Làm tiếp trên worktree hiện tại (phần HR-FAR vòng 2 chưa commit đã có sẵn). Hình dãy núi vòng 2 **đã đúng hướng** (sống núi, đỉnh lệch, nhiều lớp): giữ nguyên. Chỉ sửa 4 điểm (ảnh `round2-confirm/*-far.png`, `*-tele20.png`):

1. **Màu bạc trắng như sữa.** Lớp gần nhất phải có rừng xanh đậm, độ tương phản rõ. Chỉ các lớp xa mới nhạt dần sang xanh lam. Giảm mật độ sương/aerial perspective theo khoảng cách thật, không phủ đều một màu bạc hà.
2. **Texture tán rừng lặp thành đốm tròn như da báo** (thấy rõ ở tele20 và milestones-far). Làm lại theo nhiều tầng tần số: mảng rừng lớn, bóng tán vừa, nhiễu nhỏ; có xen sườn đá xám ở chỗ dốc. Không có hoa văn tròn lặp lại.
3. **Đỉnh nhọn mảnh như kim, có cái nổi lơ lửng** (milestones-far bên phải). Kẹp độ dốc tối đa của heightfield, không có đỉnh mảnh hơn khoảng 25° mỗi bên. Mọi lớp núi phải có chân chìm xuống dưới đường chân trời, không có mảnh nào lơ lửng.
4. **Milestones 52,53 FPS < 60.** Giảm độ phân giải lưới lớp xa, dùng LOD hoặc gộp draw. Đo lại cả 4 góc.

Không sửa `terrain/**`, `foliage/**`, `props/**`, `sky/**`, `vehicle/**`.
Xong khi:
- gate PASS;
- build 1 lần **sau thay đổi cuối**, rồi e2e world `--workers=2` 43/43 trên build đó;
- có ảnh 4 góc `-far` + tele20, đặt cạnh ảnh `round2-confirm`;
- FPS High ≥ 60 ở cả 4 góc.
Không commit.
