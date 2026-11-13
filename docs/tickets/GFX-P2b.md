## TICKET GFX-P2b — vật liệu ảnh không được làm chậm frame khi GPU yếu (tách từ GFX-P2, vòng 3)

- Bối cảnh: GFX-P2 đạt mọi gate trừ e2e world 41/43: `world-vehicle.spec.ts:45` ("brake to rest", "E while rolling") — `transitioning` vẫn true ở hạn lên xe 15 s, trên config mặc định (SwiftShader, 2 worker). Main `d51fc89` không có P2 thì 43/43. Kết luận: shading ảnh làm frame quá chậm trên renderer phần mềm, chuyển cảnh lên xe tính theo frame nên trễ.
- Việc (làm tiếp trong W-C, mọi thay đổi P2 còn nguyên):
  1. Đo: thời gian frame trung bình ở First Light và chỗ đỗ xe, main vs P2, trên SwiftShader (dùng build của bạn + `out` main nếu có; nếu không, dùng số frame/giây trong trace). Ghi bảng.
  2. Sửa để chi phí shading trên renderer phần mềm và ở **Low/adaptive Low** ngang main: không triplanar, không normal map, một lần lấy mẫu texture 512 (hoặc màu phẳng như main) — chọn theo `quality` thật đang dùng, kể cả khi adaptive quality hạ xuống giữa chừng. Phát hiện renderer phần mềm (nếu đã có trong mã) chỉ được dùng để chọn đường rẻ, không được tắt test hay đổi luật chơi.
  3. Chuyển cảnh lên xe không được phụ thuộc số frame nếu đó là nguyên nhân phụ — **không** sửa logic xe trong ticket này; nếu thấy cần, ghi đề xuất.
- Được sửa: `src/features/world/materials/**`, `terrain/detail.ts`, test của các file này.
- Không được sửa: test e2e, config Playwright, `index.ts`, `vehicle/**`, timeout.
- Được **một lần build**. Điều kiện xong: e2e world `--workers=2` config mặc định **43/43** (dán output), load-budget PASS, ảnh High First Light + Workshop không đổi so với bản P2 trước, gate PASS. Cập nhật `GFX-P2-handoff.md`. Không commit.
