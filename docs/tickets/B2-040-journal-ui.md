## TICKET B2-040 — Atlas Journal UI (sổ tay, dấu mộc) — component, chưa nối world

- Trạng thái: Assigned → Codex, đợt 15c, nhánh `lane/B2-040`
- Đọc trước: `docs/tickets/_common-b2.md`; `src/features/journal/model.ts` (B2-014); `src/components/portfolio/WorldMenu*` (cách menu world đang làm focus trap, Esc, nạp lazy); `src/components/portfolio/memory/` (B2-032 phong cách giấy)
- Spec: §7.2 (sổ tay vẽ tay, J hoặc biểu tượng nhỏ, 8 dòng, bấm mở thẳng overlay, khu đã ghé có dấu mộc, không bản đồ/vị trí, secrets không xuất hiện, sau secret đầu có trang trắng), §9 (a11y: bàn phím, focus, reduced motion), §8 (JS ban đầu không tăng — chỉ nạp sau Enter World); taste brief §5.4 (UI im lặng, chữ ít, chuyển động chậm, không nảy), §5.8 (đóng dấu mộc)
- Việc: `src/components/portfolio/journal/`:
  1. `AtlasJournal.tsx` (client, **chỉ import động** từ nơi đã lazy sau Enter World — không import từ Welcome/Quick): props `{ entries, blankPages, title, locale, onOpenZone(zoneId), onClose() }` (dữ liệu từ selectors của `features/journal/model` — **không import** `features/world`; import type từ `features/journal` được phép).
  2. Dạng `dialog` modal: focus vào tiêu đề khi mở, focus trap, Esc/J đóng, trả focus về phần tử mở. 8 dòng là `button` (tên khu), dòng đã ghé có **dấu mộc** SVG inline nhỏ (vòng tròn đỏ son `#B5432F` nét không đều, chữ không có — chỉ hình), `aria-label` có "đã ghé"/"visited". Trang trắng: n khối giấy trống cuối sổ, `aria-hidden`, không chữ.
  3. Phong cách: nền giấy `#EEE8D8`, chữ mực `#2B2A26`, serif Noto Serif tự host, viền mảnh, không bóng đổ đậm. Mở/đóng: fade 200 ms; `prefers-reduced-motion` → không animation.
  4. Nhãn EN/VI tối thiểu: "Close"/"Đóng", "visited"/"đã ghé".
- Được sửa: `src/components/portfolio/journal/**`, `tests/unit/portfolio/journal.test.tsx`
- Test (renderToStaticMarkup + kiểm DOM tĩnh): 8 button đúng thứ tự; dòng stamped có svg + aria "visited"; không xuất hiện tên secret/ tọa độ; blank pages = prop; nhãn vi đúng; file không import `features/world`.
- Thêm vào điều kiện xong: `pnpm build` + `pnpm check:bundle` exit 0 (JS ban đầu Welcome/Quick không đổi).
