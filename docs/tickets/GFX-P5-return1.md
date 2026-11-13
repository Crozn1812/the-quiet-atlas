# GFX-P5 — trả lại lượt 1

- **Lead đã rebase** W-A lên main `e92409b` (đã có GFX-P2 vật liệu ảnh `5258866`). `LICENSES.csv` gộp hai bên. Thay đổi của bạn vẫn chưa commit. Không tự rebase (sandbox không ghi được `.git`).
- Chặn merge: e2e world 2 worker config mặc định 41/43, timeout chuyển trạng thái lên xe. Main hiện tại 43/43 (P2 đo trên cùng config). GFX-P2 gặp đúng lỗi này và sửa bằng cách: ở **Low, adaptive Low và renderer phần mềm** dùng vật liệu rẻ (màu phẳng, không normal/roughness map, không bake texture) — xem `src/features/world/materials/cc0.ts` cách nó chọn đường rẻ, dùng lại cùng cách phát hiện. Làm tương tự cho nhân vật và xe: High phần cứng giữ PBR; còn lại chi phí frame ngang main. LOD xa của nhân vật/xe cũng dùng ở đây.
- Không sửa test, timeout, logic xe.
- Làm rõ bàn giao: "không cần thêm dòng index.ts" hay "mẫu nối 6 dòng"? Nếu cần nối, ghi chính xác đoạn code.
- Được **một lần build**. Xong: e2e world `--workers=2` config mặc định 43/43 (dán output), load-budget, `check:assets` (ghi tổng world sau P2), ảnh cận nhân vật/xe High, gate PASS. Không commit.
