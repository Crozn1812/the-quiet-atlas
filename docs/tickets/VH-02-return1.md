VH-02 — Lead trả lại vòng 1.

Đạt: A rẽ trái / D rẽ phải (đo cross = -1.45, đúng phải); animation lên xe nhấc chân qua yên tốt; tay theo ghi-đông.

Chưa đạt — XUỐNG XE KHÔNG HOẠT ĐỘNG khi bật chuyển động (không reduced-motion), bản build High trong Edge:
1. nearVehicle → E (lên xe), giữ W 1.5 s, giữ D 1.5 s, nhả.
2. Giữ S tới khi xe đứng yên hẳn (vị trí không đổi > 0.002 m / 250 ms), nhả S.
3. Bấm E → data-world-vehicle vẫn "manual", nhân vật vẫn ngồi trên xe, KHÔNG hiện thông báo lỗi nào ("Stop, then press E" / "No safe place to stand").
Tái hiện: `node tools/review/bike-check.mjs http://127.0.0.1:4512 <outPrefix>` (script đã đặt trong worktree; in "vehicle manual" là lỗi, phải in "vehicle parked").

Yêu cầu:
- Tìm nguyên nhân (speed không về < dismountSpeed? phím E bị nuốt bởi nearestSecret/discover? rider.transitioning kẹt? S chuyển sang lùi?).
- UX: bấm E khi xe còn lăn chậm thì xe tự phanh dừng rồi xuống (không bắt người chơi canh speed 0). Nếu không xuống được thì luôn hiện thông báo lý do.
- Thêm e2e (không reduced-motion) phủ đúng luồng trên: lái, phanh, E → "parked", nhân vật đứng thẳng cạnh xe.
- Chụp lại vh-dismount ở 300/900/1800 ms cho thấy bước xuống, đứng thẳng.
- Giữ bike-check.mjs trong tools/review/ (được phép thêm).
Chạy lại gate + e2e world --workers=2, bàn giao như cũ.
