## TICKET FISH-01 — Đàn cá sẫm màu bơi tới bơi lui dưới suối (Duy yêu cầu 14/11)

- Lane / milestone: L3 World / hướng C.
- Hiện tại: `src/features/world/water/fish.ts` có 6 con cá nhỏ màu đá ánh vàng, chỉ ở đoạn suối First Light (t 0,01–0,05).
- Muốn: **nhiều đàn cá sẫm màu** (xám ô liu/nâu đen, lưng sẫm, bụng nhạt hơn một chút, nhìn qua mặt nước như bóng cá thật) dọc suối, mỗi đàn **5–9 con**, **bơi tới bơi lui** theo dòng: cả đàn đi ngược dòng một quãng rồi quay đầu, con trong đàn lệch pha nhẹ, uốn đuôi, thỉnh thoảng tản ra rồi tụ lại. Khi người chơi bước sát mép nước (≤ 2,5 m) hoặc lội suối, đàn gần đó **giật mình tản ra nhanh** rồi tụ lại sau vài giây.
- Vị trí: 4–6 đàn ở các đoạn suối nước đủ sâu (dùng `water/depth.ts`, `waterLevelAt`), gồm First Light, Old Trail, Roots, đoạn gần cửa biển; không bơi lên bờ, không xuyên đá/cầu. Giữ đàn First Light hiện có (đổi sang màu sẫm).
- Kỹ thuật: một `InstancedMesh` cho mọi cá (một draw); chuyển động tính trong **vertex shader** (uniform time + tham số mỗi instance: tâm đàn, pha, quãng bơi) để JS không cập nhật ma trận mỗi frame; phản ứng giật mình chỉ cần một uniform vị trí người chơi. Hình cá: thân thon + đuôi uốn (≤ 120 tam giác/con), vật liệu tối với chút phản quang lưng; ở dưới nước dùng độ trong theo độ sâu của GFX-P4 (cá sâu mờ đi).
- Low: giảm còn 1–2 đàn gần người chơi, không giật mình. Reduced motion: bơi chậm, không tản đột ngột. Cull ngoài 60 m.
- Ngân sách: +1 draw call, ≤ 8 000 tam giác, 0 byte asset (procedural), CPU ABBA ≤ +2 ms/s.
- Được sửa: `src/features/world/water/fish.ts`, file mới `water/fish-*.ts`, test tương ứng. Nối `index.ts` ≤ 5 dòng nếu cần vị trí người chơi (ghi trong bàn giao).
- Không được sửa: `water/material.ts`, `water/sea.ts`, `shore/**` (ticket SURF-01 đang sửa), khu `zones/**`.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định 43/43; ảnh High 3 đoạn suối có đàn cá + Low 1; clip 10 s cá bơi và tản ra (nếu ghi được). Không commit.
