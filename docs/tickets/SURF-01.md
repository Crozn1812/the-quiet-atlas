## TICKET SURF-01 — Sóng biển vỗ bờ nhìn thấy và nghe thấy (Duy yêu cầu 14/11)

- Lane / milestone: L3 World / hướng C.
- Hiện tại: biển GFX-P4 có phản chiếu trời, Fresnel, bọt nhẹ ở bờ; âm biển là tiếng ồn lọc thấp, điều biến chậm (`src/features/audio/ambience.ts`, kênh `sea`). Chưa thấy từng con sóng vỗ vào bờ, chưa nghe nhịp sóng.
- Muốn ở Quiet Shore, Horizon, Last Postcard:
  - **Nhìn:** từng đợt sóng nhỏ cuộn vào bờ: gợn sóng dâng gần bờ, **vỡ thành bọt trắng**, **tràn lên cát rồi rút xuống** (mép nước tiến/lùi 1–3 m), cát ướt sẫm hơn chỗ nước vừa rút, chu kỳ 6–9 s, các đoạn bờ lệch pha. Ngoài khơi: sóng dài nhẹ.
  - **Nghe:** mỗi đợt sóng có tiếng **ào → vỗ → rút rì rào**, **khớp nhịp với hình** (cùng một đồng hồ sóng). To dần khi lại gần bờ, nhỏ đi khi vào rừng; stereo theo hướng bờ.
- Kỹ thuật hình: dịch chuyển mép nước và bọt trong shader của biển/bờ (uniform time, pha theo vị trí dọc bờ), không mesh mới cập nhật bằng JS mỗi frame. Cát ướt: tham số trong vật liệu bờ (dùng P2 `materials/cc0.ts` qua API có sẵn, không sửa file đó). Low: chỉ dải bọt tiến/lùi đơn giản.
- Kỹ thuật âm: được chọn một trong hai, ghi lý do:
  1. Tổng hợp trong `ambience.ts` (noise + envelope từng đợt), hoặc
  2. **Bản ghi CC0** sóng vỗ (Freesound CC0 / Poly Haven nếu có), mỗi file một dòng `assets/LICENSES.csv` kèm URL nguồn và giấy phép, OGG/Opus ≤ 300 KB tổng, nạp deferred, phát theo nhịp đợt sóng.
  Không dùng âm có giấy phép không rõ. Tôn trọng nút tắt tiếng và âm lượng hiện có; không phát trước khi người chơi tương tác (chính sách autoplay).
- Ngân sách: draw call +0–1; asset ≤ 300 KB; CPU ABBA ≤ +3 ms/s ở bờ biển.
- Được sửa: `src/features/world/water/sea.ts`, `water/surface.ts` (chỉ phần biển), `shore/**`, `src/features/audio/**`, `public/audio/` (nếu dùng bản ghi), `assets/LICENSES.csv`, test. Nối `index.ts` ≤ 5 dòng (đồng hồ sóng dùng chung hình/âm), ghi trong bàn giao.
- Không được sửa: `water/fish.ts` (FISH-01), `zones/**`, `materials/cc0.ts`.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định 43/43; ảnh High 3 bờ (lúc sóng tràn lên và lúc rút) + Low 1; clip 15–20 s có tiếng ở Quiet Shore (nếu ghi được); `check:licenses`, `check:assets`. Không commit.
