## TICKET FIX-PATCH — Mảng xanh sẫm phẳng nổi trên đường đất (Workshop, Roots, Milestones)

- Lane / milestone: L3 World / hướng C, lỗi hình.
- Bằng chứng: showcase main `c8531eb`, ảnh `high-workshop-01`, `high-roots-01`, `high-milestones-01` (chạy `node tools/review/final-showcase.mjs out <dest>` hoặc `ingame-shots.mjs`): trên đường đất có các **đa giác phẳng màu xanh sẫm/ô liu**, cạnh cứng, nằm ngay trên mặt đường, trông như bóng hay decal đặt sai, hoặc vũng nước/tấm cỏ không bám địa hình.
- Việc:
  1. Tìm nguồn: dùng hook QA/debug để lấy tên mesh dưới các mảng đó (raycast từ camera ở góc chuẩn), ghi `name`, module tạo ra, commit đưa vào (`git log -S`).
  2. Sửa ở đúng module sở hữu: không đặt trên đường (dùng mask đường/corridor có sẵn), bám địa hình, mép mềm (alpha/fade) hoặc bỏ nếu là thừa. Không đổi vị trí điểm tương tác, collider.
  3. Test unit: không instance nào của loại đó nằm trong hành lang đường của 3 khu (dùng hàm corridor có sẵn).
- Được sửa: module sở hữu lỗi (ghi rõ trong bàn giao trước khi sửa nếu là `index.ts`, `layout/`, `terrain/height.ts` — khi đó chỉ sửa ≤ 10 dòng), test tương ứng.
- Không được sửa: `zones/milestones*` (MS-C2 đang sửa), test e2e, config.
- Xong: gate PASS; build một lần; e2e world `--workers=2` 43/43; ảnh trước/sau 3 khu cùng góc. Không commit.
