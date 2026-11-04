## TICKET B2-060 — Cinematic mở đầu: đường camera + máy trạng thái (logic thuần)

- Trạng thái: Assigned → Codex, đợt 15c, nhánh `lane/B2-060`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/world/layout/` (river, zones); `src/features/world/terrain/height.ts`
- Spec: §2 ("cinematic cận cảnh lá, nước, sương rồi lộ nhân vật, có Skip; âm thanh chỉ phát sau thao tác bật"), §9 (reduced motion), §6.2; taste brief §5.2 ("nhìn từ trên cao xuống dòng suối uốn lượn như tranh, rồi hạ dần xuống lá, nước, sương"), §5.4 (chuyển động chậm, không nảy)
- Việc: `src/features/world/cinematic/`:
  1. `intro.ts`: đường camera 18–24 s tất định gồm các đoạn: (a) **trên cao** nhìn xuống thấy ≥ 2 khúc cua chữ S của suối (cao ≥ 120 m, góc nhìn gần thẳng đứng nghiêng nhẹ); (b) hạ dần dọc suối về phía spawn, sương dày lên (trả về hệ số `mistBoost` 0–1 cho paper pass); (c) cận cảnh mặt nước/lá gần spawn (cao 1–2 m); (d) xoay nhẹ lộ nhân vật ở spawn, kết thúc **khớp đúng** vị trí/hướng camera gameplay ban đầu (truyền vào). Nội suy bằng spline + easing mềm (không overshoot, không nảy).
  2. Không camera nào chui dưới terrain (`worldHeight` + 0,8 m) hay dưới mặt nước.
  3. `controller.ts`: trạng thái `idle → playing → done`, `skip()` → nhảy thẳng `done` (trả pose cuối), `tick(dt)` → `{ position, target, fov, mistBoost, letterbox }`; `reducedMotion` → bỏ bay, chỉ fade 0,4 s từ giấy sang cảnh spawn rồi `done`. Gameplay input khóa khi `playing`.
  4. Không âm thanh, không lưu trạng thái đã xem (mỗi lần Enter World đều phát, Skip luôn có — §6.2).
- Được sửa: `src/features/world/cinematic/**`, `tests/unit/world/cinematic.test.ts`
- Test: tổng thời lượng 18–24 s; điểm đầu cao ≥ 120 m; pose cuối trùng pose gameplay (sai số < 1e-3); không frame nào (mẫu 60 Hz) camera dưới terrain + 0,8 m; tốc độ camera liên tục (không giật: chênh vận tốc giữa 2 mẫu < ngưỡng); skip trả pose cuối ngay; reduced motion ≤ 0,5 s.
