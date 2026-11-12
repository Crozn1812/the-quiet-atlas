FL-03 — Lead trả lại vòng 1. Ảnh so sánh trái=main, phải=FL-03: test-results/fl03-review/lead-r0.webp (First Light, Roots, Workshop).

Nhận xét: từ camera chơi, bản FL-03 gần như giống main. Ba yêu cầu chính của Duy chưa thấy:
1. **Sườn núi:** tảng đá rêu cũ vẫn là thứ nổi bật ở nguồn suối; núi chỉ là một khối xám mờ ở góc trên trái. Yêu cầu: tảng đá nguồn bị bỏ; một **vách/sườn núi đá** (nhiều tầng đá, gờ, rêu, vài cây bám) chiếm **≥ 60 % bề rộng khung** phía sau nguồn suối trong ảnh spawn First Light, đỉnh nằm cao hơn mép tán (che đường chân trời phía đó). Suối chảy ra từ chân vách.
2. **Tán kín trời:** trời vẫn chiếm phần lớn nửa trên khung ở Roots/Workshop. Yêu cầu đo được: viết `tools/review/sky-fraction.mjs` (tỉ lệ pixel là trời trong 45 % trên của ảnh, phân loại theo màu trời/sương thực tế của scene) và đạt **≤ 15 %** ở First Light, Roots, Workshop, Milestones trong ingame-shots High. Cách làm gợi ý: thêm một **tầng tán trần** (cụm lá lớn instanced, 9–16 m, chồng lên nhau, có khe) dọc hành lang rừng và các khu rừng; cây ven lối cao hơn, tán vươn qua lối đi. Giữ ngôn ngữ khối mặt phẳng R1.
3. **Tia nắng:** vẫn là 2 dải trắng to từ góc trên. Yêu cầu: **8–15 tia mảnh**, độ rộng khác nhau, xiên **từ trái sang phải**, xuất phát từ khe tán, mờ dần về đất, lấp lánh nhẹ theo lá rung. Không tia nào rộng hơn ~4 % bề rộng khung.
4. **Luma rừng** First Light 0,20–0,26 (hiện 0,180: hơi tối quá — sau khi đóng trời, nâng sương/ánh sáng tán để đạt).
5. Suối lội được và cá: giữ; thêm 1 ảnh nhân vật đứng giữa lòng suối, thấy cá.

CPU: không cần đo lại nhiều vòng; Lead đo một mình ở cổng đợt. Tránh xử lý mỗi khung mới ngoài shimmer/cá.
Được dùng Blender MCP (đã cấu hình cho Codex) hoặc script Blender nếu dựng vách núi dạng GLB; ngân sách ADR 0015, nạp deferred.
Bàn giao: ảnh High 8 khu + sky-fraction + luma, ảnh trước/sau đặt cạnh nhau.
