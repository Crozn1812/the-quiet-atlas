# ADR 0016: Chữ trong world chỉ dùng tiếng Anh

- Trạng thái: **Accepted, chờ Duy xác nhận phạm vi** (2026-11-12). Duy, góp ý playtest vòng 1: "trong game là thuần tiếng anh giúp mình nha".
- Thay ADR 0008 (ngôn ngữ world đi theo trang) cho **phần trong world**.

## Quyết định (cách hiểu hiện tại, theo bản Codex đã làm)

- **Trong world: chỉ tiếng Anh.** Gồm HUD, gợi ý phím, nhãn E, Sổ Atlas, Menu, "Travel…", nút Skip, chữ trên bảng gỗ, thơ bí mật, nội dung overlay khu.
- **Ngoài world: theo ngôn ngữ trang** (`/vi/`, `/en/`). Gồm Welcome, Quick Portfolio, các trang case study, CV.
- Đổi ngôn ngữ trong Menu vẫn đổi ngôn ngữ trang (URL), nhưng chữ trong world không đổi.
- Nếu Duy muốn overlay nội dung trong world vẫn theo ngôn ngữ trang, chỉ cần sửa lại mục này; phần code đã tách sẵn.
