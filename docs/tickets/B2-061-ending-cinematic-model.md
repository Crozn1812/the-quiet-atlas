## TICKET B2-061: Cinematic ending, đường camera và máy trạng thái (logic thuần)

- Trạng thái: Assigned → Codex, đợt 19, nhánh `lane/B2-061`
- Đọc trước:
  - `_common-b2.md`
  - `src/features/world/cinematic/intro.ts` + `controller.ts` (B2-060): làm theo đúng mẫu này
  - `src/features/world/layout/` (`ZONES`, river)
  - `terrain/height.ts`, `waterLevelAt`
- Spec:
  - §2: ending 30–45 s, mở tại ghế gỗ.
  - §7.5: Skip; khung cuối dẫn nhẹ sang The Last Postcard.
  - §9: reduced motion.
  - Taste §5.2–5.4: biển hoàng hôn, chuyển động chậm.

### Việc

1. **`src/features/world/cinematic/ending.ts`**: `createEnding({ bench, gameplayPose })`. Đường camera tất định 36 s, gồm các đoạn:

   | Đoạn | Nội dung |
   |---|---|
   | a | Cận cảnh ghế gỗ và nhân vật ngồi, nhìn ra biển |
   | b | Lùi chậm, nâng lên thấy bờ, cửa suối và biển hoàng hôn |
   | c | Lướt dọc bờ về phía The Last Postcard |
   | d | Dừng ở khung nhìn về Last Postcard, rồi trả pose gameplay đặt nhân vật cạnh Last Postcard |

   - Trả thêm các hệ số `sunsetBoost` 0–1 (cho grade), `mistBoost`, `letterbox`, `paperOpacity`.
   - Nội suy spline cộng easing, không overshoot.
   - Không camera nào chui dưới terrain hoặc mặt nước (dùng cùng kiểu `floorAt` của intro).
2. **`src/features/world/cinematic/ending-controller.ts`**:
   - Trạng thái `idle → playing → done`.
   - `skip()` nhảy tới pose cuối.
   - Reduced motion: chỉ fade giấy 0,6 s rồi đặt ở Last Postcard.
   - Trả `finalPlayerPosition` (cạnh Last Postcard, đất khô).
   - Có thể dùng chung tiện ích với `controller.ts` nhưng **không sửa** intro.

### Được sửa

- `src/features/world/cinematic/ending*.ts`
- `tests/unit/world/ending.test.ts`

### Test

- Thời lượng 30–45 s.
- Pose đầu cách ghế ≤ 6 m.
- Pose cuối nhìn về Last Postcard: góc giữa hướng nhìn và hướng tới zone ≤ 25°.
- Không frame nào (lấy mẫu 60 Hz) nằm dưới terrain + 0,8 m hoặc dưới mặt nước.
- Vận tốc liên tục.
- `skip` trả pose cuối.
- Reduced motion ≤ 0,8 s.
- `finalPlayerPosition` khô và cách Last Postcard ≤ 10 m.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
