## TICKET B2-070: Secrets, mô hình thuần (Set ID, điều kiện mở ending)

- Trạng thái: Assigned → Codex, đợt 19, nhánh `lane/B2-070`
- Đọc trước:
  - `_common-b2.md`
  - Spec §2 dòng "Secrets: Reflection, Forgotten Sound, Unmarked Road (tùy thứ tự); The Unwritten Page tại ghế gỗ mở ending 30–45 giây sau khi đủ ba secret…"
  - Spec §7.5 (Set ID, secret thứ tư trước đủ ba chỉ có phản hồi ẩn dụ nhẹ, ending chỉ mở đúng điều kiện), §6.2 (memory-only), §13 Q16
  - `src/features/journal/model.ts` (`SecretId`, `findSecret`, `endingUnlocked`)
  - `src/features/world/layout/` (`ZONES`, `riverPointAt`, path), `terrain/height.ts`
  - Taste: `docs/art-bible/taste.md` dòng Reflection (gương tròn giữa vòm dây leo có hoa cam) và Quiet Shore (ghế gỗ)
- Spec §7.2: "Bốn địa điểm bí mật không có bảng chỉ đường".

### Việc

Tạo thư mục mới `src/features/story/`:

1. **`secrets.ts`**: 4 secret dùng đúng `SecretId` của journal. Mỗi secret có:
   - Vị trí trong world, lệch khỏi đường đi 12–40 m (phải đi vòng mới thấy, không nằm trên tuyến chính).
   - Không trùng zone. Không dưới nước. Đất khô ≥ 0,4 m.
   - Bán kính kích hoạt 2,5 m.
   - Gợi ý cảnh quan (`landmark`).

   | Secret | Vị trí | Landmark |
   |---|---|---|
   | Reflection | gần The Roots / bờ suối | gương tròn trong vòm dây leo |
   | Forgotten Sound | trong rừng giữa Workshop và Milestones | `"wind-chime"` |
   | Unmarked Road | lối mòn rẽ từ Old Trail | `"faint-trail"` |
   | Unwritten Page | ghế gỗ tại The Quiet Shore | `"bench"`; chỉ là secret thứ 4 |
2. **`story.ts`**: reducer thuần `storyReducer(state, action)`.
   - State: `{ found: ReadonlySet<SecretId>, endingState: "locked" | "ready" | "playing" | "seen", lastFeedback }`.
   - Action `discover(id)`:
     - Lặp lại hoặc sai thứ tự đều không đếm trùng (Set).
     - `unwritten-page` trước khi đủ 3: không thêm vào Set; trả `feedback: "not-yet"` (phản hồi ẩn dụ nhẹ, không văn bản cụ thể ở đây).
     - Đủ 3 rồi chạm `unwritten-page`: chuyển `ready`.
   - Action `startEnding`: chỉ được khi đang `ready`. Mở lặp không tạo instance thứ hai.
   - Action `finishEnding(valid: boolean)`: chỉ đánh dấu `seen` khi transition hợp lệ, gồm cả Skip.
   - Action `reset`: về trạng thái ban đầu (phiên mới).
3. **`nearestSecret(position)`**: trả secret trong bán kính hoặc `null`. Thuần, không DOM.
4. Văn bản phản hồi ẩn dụ EN/VI, ngắn, ≤ 12 từ, không tiết lộ chuyện riêng:
   - 1 câu cho mỗi secret khi tìm thấy.
   - 1 câu "chưa tới lúc" cho Unwritten Page.

   Đánh dấu `// TBD: Duy duyệt câu chữ` (không bịa chuyện đời tư).

### Được sửa

- `src/features/story/**`
- `tests/unit/story/secrets.test.ts`

### Test (Q16)

- Lặp và sai thứ tự không đếm trùng.
- Unwritten Page trước đủ 3 trả `not-yet` và không mở ending.
- Đủ 3 rồi chạm Unwritten Page thì `ready`; `startEnding` hai lần chỉ một lần.
- Skip được tính là hoàn thành hợp lệ; transition không hợp lệ không đánh dấu `seen`.
- Vị trí:
  - lệch khỏi path 12–40 m;
  - không trong zone;
  - đất khô;
  - Unwritten Page cách zone Quiet Shore ≤ 30 m.
- Không có storage: grep mã nguồn trong test.

### Điều kiện xong

`pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test` đều exit 0. Không commit.
