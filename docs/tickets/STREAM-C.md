## TICKET STREAM-C — Suối: mép mềm và mặt nước phản chiếu trời thấy được (ADR 0018)

- Lane / milestone: L3 World / hướng C, chưa đạt ADR 0018 mục "Nước: phản chiếu trời + Fresnel".
- Bằng chứng: showcase main `c8531eb`, `high-old-trail-01` và `high-horizon-01`: mép suối là **đường răng cưa cứng** (bậc thang theo lưới địa hình), mặt nước gần như **một màu phẳng xanh xám**, không thấy trời phản chiếu, không thấy độ trong ở chỗ nông. Biển (GFX-P4, SURF-01) không thuộc ticket này.
- Việc:
  1. **Mép:** bỏ răng cưa: mép nước theo đường cong mượt (ribbon rộng hơn chìm dưới đất + fade alpha theo độ sâu `water/depth.ts`, hoặc soft edge bằng depth texture), có dải ướt sẫm trên đất sát mép và bọt rất nhẹ ở chỗ chảy xiết.
  2. **Mặt nước:** phản chiếu IBL/trời theo Fresnel rõ hơn ở góc nhìn thấp; chỗ nông thấy sỏi lòng suối (texture P2) qua nước; chỗ sâu sẫm; gợn nước chạy theo dòng (normal map cuộn theo tiếp tuyến suối), lấp lánh nhẹ hướng mặt trời.
  3. Giữ đàn cá FISH-01 nhìn thấy được (mờ theo độ sâu, không bị mặt nước che kín), giữ lội suối, cầu, collider.
  4. Low: không phản chiếu, một màu có gradient độ sâu, mép vẫn mềm.
- Ngân sách: draw call +0–1; asset ≤ 300 KB; CPU ABBA ≤ +3 ms/s.
- Được sửa: `src/features/world/water/ribbon.ts`, `water/material.ts` (phần suối), `water/surface.ts` (phần suối), `water/depth.ts`, `terrain/spring.ts` (chỉ vật liệu mép), test.
- Không được sửa: `water/sea.ts`, `shore/**` (biển), `water/fish*.ts`, `materials/cc0.ts`, khu `zones/**`. Nếu FIX-PATCH (Codex A) phát hiện các mảng xanh là vũng nước của suối, phối hợp qua bàn giao, không sửa trùng.
- Xong: gate PASS; build một lần; e2e world `--workers=2` 43/43; ảnh trước/sau High Old Trail, Horizon, First Light (góc chuẩn + một góc thấp sát mặt nước) + Low 1. Không commit.
