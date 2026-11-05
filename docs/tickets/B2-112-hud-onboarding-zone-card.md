## TICKET B2-112 — HUD: biểu tượng Sổ Atlas, gợi ý phím 10 s đầu, thẻ tên khu khi bước vào

- Trạng thái: Assigned → Codex, đợt 21, nhánh `lane/B2-112`
- Đọc trước:
  - `_common-b2.md`
  - `src/components/portfolio/WorldEntry.tsx`: HUD `world-hud` (Quick, CV, Email, Sound, Menu).
  - `src/components/portfolio/journal/WorldJournal.tsx`: sự kiện `tqa:toggle-journal` trên container.
  - Spec §6.4:
    - "Atlas Journal: J — Biểu tượng góc";
    - "Gợi ý phím hiện 10 giây đầu rồi tự ẩn".
  - Spec §2.1: không icon UI lớn phủ lên world.
  - Taste §5.4: UI im lặng, chữ ít, chuyển động chậm, không nảy.
  - §9: a11y, reduced motion.
  - §8: không tăng JS ban đầu quá 1 KB.
- **Hợp đồng (Lead nối phía world ở B2-100):** world phát `tqa:zone-enter { zoneId }` khi người chơi bước vào bán kính một khu (mỗi lần vào, có hysteresis).

### Việc

1. **Biểu tượng Sổ Atlas ở HUD**, chỉ hiện khi đang trong world.
   - Icon cuốn sổ nét mảnh, cùng phong cách các icon HUD hiện có.
   - Nhãn "Sổ Atlas" / "Atlas Journal".
   - Bấm thì gửi `tqa:toggle-journal` tới container world.
2. **Gợi ý phím lúc mới vào world**: một dòng chữ nhỏ ở mép dưới.
   - Nội dung: "WASD đi · ←→ hoặc kéo để xoay · E tương tác · J sổ · Esc menu" (EN tương ứng).
   - Hiện 10 s sau khi intro xong (`data-world-intro` = `done`), rồi mờ dần trong 600 ms.
   - Reduced motion thì tắt ngay, không mờ dần.
   - Không lấy focus. Có `aria-live="polite"` một lần.
3. **Thẻ tên khu**: nghe `tqa:zone-enter`, hiện tên khu và một dòng phụ.
   - Phong cách tạp chí: serif, chữ hoa nhỏ, căn giữa phía trên.
   - Nhãn theo khu:

     | Khu | EN | VI |
     |---|---|---|
     | First Light | "About me" | "Giới thiệu" |
     | Roots | "Skills" | "Kỹ năng" |
     | Workshop | "Selected projects" | "Dự án tiêu biểu" |
     | Milestones | "Certificates & learning" | "Chứng chỉ & học tập" |
     | Old Trail | "Journey" | "Hành trình" |
     | Horizon | "Future direction" | "Định hướng" |
     | Quiet Shore | "Hobbies & personality" | "Sở thích" |
     | Last Postcard | "Contact & CV" | "Liên hệ & CV" |

   - Hiện 3 s, fade 400 ms. Reduced motion: không fade.
   - Không lặp quá 1 lần / khu / 20 s.
   - `aria-live="polite"`. Không chặn input.
4. Mọi chữ có đủ EN/VI và đổi theo `setLocale`.
5. Mã của 3 mục trên **nạp lazy sau Enter World**, giống cách WorldMenu đang làm.

### Được sửa

- `src/components/portfolio/WorldEntry.tsx`
- `src/components/portfolio/hud/**` (mới)
- `src/app/**/*.css` hoặc module CSS mới của HUD
- `tests/unit/portfolio/hud*.test.tsx`

### Test

- Icon chỉ hiện trong world, bấm gửi toggle.
- Gợi ý phím hiện sau intro, ẩn sau 10 s (fake timer); reduced motion ẩn ngay.
- `zone-enter` hiện đúng tên khu và nhãn theo locale, chống lặp 20 s.
- Đổi locale cập nhật chữ.
- Không import tĩnh vào bundle Welcome (kiểm bằng grep, tương tự các test lazy hiện có).

### Điều kiện xong

- `pnpm lint` (0 warning), `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:bundle` đều exit 0.
- Dán số JS Welcome. Không commit.
