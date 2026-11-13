# GFX-P5 — trả lại lượt 2 (lượt cuối)

1. **Asset quá lớn:** world 10,04 MB (main) → 18,12 MB, tức P5 thêm ~8 MB cho một nhân vật và một xe. Còn 8 khu dressing phải nằm trong trần 30 MB. Trần cho P5: **≤ 2 MB tổng thêm**. Cách: một atlas chung nhân vật + xe; High 1K, Balanced/Low 512; ETC1S cho màu, UASTC chỉ cho normal nếu thật cần; bỏ map nào không thấy khác trên ảnh cận (ví dụ roughness gộp vào kênh của texture khác, AO bake vào màu). Ghi byte từng file trước/sau.
2. **Timeout lên xe 1/43 lặp 3 lượt:** khả năng cao do giải mã/upload texture lớn trong lúc test lên xe (main thread). Sau khi giảm asset ở bước 1: đo lại. Texture nhân vật/xe phải nạp sau khi world `done` và **không upload GPU trong lúc đang chuyển trạng thái lên/xuống xe** (hoãn tới khi transition xong, nếu không thì upload từng phần mỗi frame).
3. Đối chứng cùng máy, cùng lúc: chạy `world-vehicle.spec.ts` config mặc định `--workers=2` 3 lượt trên **`out` của main** (`e92409b`, build trong worktree của bạn bằng `git stash`? — không được, sandbox không ghi `.git`; thay vào đó dùng server main ở `D:/the-quiet-atlas/out` nếu có, nếu không ghi NOT RUN). Ghi bảng main vs P5.
- Không sửa test, timeout, logic xe. Được **một lần build**.
- Xong: e2e world `--workers=2` config mặc định 43/43, `check:assets` (tổng world ≤ 12,1 MB), load-budget, ảnh cận High nhân vật/xe trước/sau giảm, gate PASS. Không commit.
