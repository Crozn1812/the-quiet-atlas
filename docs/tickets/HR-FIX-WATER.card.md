## TICKET HR-FIX-WATER — Nước và sinh vật: cá, mặt suối và cây thủy sinh, bọt sóng, dòng thác, chim (đọc HR-common.md trước)

- Lane / milestone: L3 World + asset / B3 hyper-real, sửa theo **tests/review/HR-AUDIT.md** (đã merge).
- Ảnh gốc của audit: `D:/tqa-worktrees/hr-audit-gallery/` (mở `index.html`). Script chụp lại cùng góc: `tools/review/hr-audit.mjs`.
- Sửa các mục audit: **A18, A19, A20, A23 (phần dòng nước), A25**. Đọc từng dòng trong HR-AUDIT.md (mô tả, tọa độ, file nghi vấn), sửa đến khi ảnh cùng góc **không còn lỗi đã ghi**. Hướng siêu thực: hình khối thật (bo cạnh, mòn, chi tiết liên kết), vật liệu PBR từ texture CC0 có thớ/vân đúng chiều, không màu khối trơn. Giữ collider, vị trí tương tác, chữ và nội dung; không đổi gameplay. Low/renderer phần mềm có thể giữ bản rẻ.
- Được sửa: `src/features/world/water/**`, `src/features/world/shore/**`, `src/features/world/fauna/**`, `src/features/world/terrain/spring.ts`, `public/world/lib/` (thêm asset mới), manifest (thêm), `tools/assets/blender/` (script mới của ticket), `assets/LICENSES.csv`, test liên quan. **Không sửa** file ngoài danh sách (ticket HR-FIX khác đang làm song song).
- Hiệu năng: High ≥ 60 FPS RTX 3060 ở các góc audit liên quan; ghi số trước/sau.
- Xong: gate PASS; build 1 lần **sau thay đổi cuối**; e2e world `--workers=2` 43/43 trên build đó với **E2E_PORT riêng của slot**; ảnh trước/sau **cùng góc audit** cho từng mục (dùng `hr-audit.mjs`), kèm bảng mục → đã sửa / còn lại + lý do; `check:assets`/`check:licenses` PASS. Không commit.
