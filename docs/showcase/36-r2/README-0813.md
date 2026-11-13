# Đợt R2 — trạng thái sáng 13/11 (main d43f9b1)

Ảnh High 8 khu: `main-0813-sheet.webp` (từng khu: `main-0813/`). Ảnh review từng ticket: `lead-review/`, `antigravity/`.

Duy chấm (giữ / sửa / bỏ) khi FL-03 xong; dưới đây là trạng thái kỹ thuật, chưa phải bản để chấm cuối.

| # | Feedback | Ticket | Trạng thái |
|---|---|---|---|
| 1, 2, 10 | Sườn núi, tán rừng kín trời, tia nắng, rừng tối | FL-03 | Đang làm (Codex vòng 2): tán kín trời, vách núi, độ sáng đạt; còn sửa đá lơ lửng, tia nắng, ám xanh |
| 3 | Lái A/D, ghi-đông, lên/xuống xe | VH-02 | Đã merge `d43f9b1` |
| 4 | Bỏ mascot | MS-01 | Đã merge `122de81` |
| 5, 8, 9 | Sơ đồ dự án to, mỗi kỹ năng một dòng, CCNA | UI-05 | Đã merge `4e52f79` |
| 6 | Bí mật to, huyền bí | SC-01 | Đã merge `4d76f65` |
| 7 | Cây cổ thụ elf ở Roots + bảng kỹ năng | RT-02 | Đã merge `bb911ea` |
| 9 | Tượng đá Duy ghép từ chứng chỉ | MS-02, MS-02b | Đã merge `c278102`, `8d5d820` |
| 11 | Cổng đình làng có lửa | WS-02 | Đã merge `9cbbb86` |
| 12 | Ngồi ghế ngắm cảnh Horizon | HZ-02 | Đã merge (`cebecd7` + `dd1aaf2`) |
| 13, 14, 15 | Đầu đường, chân lún, tựa lan can | RD-02 | Đã merge `063a747` |
| — | Âm chuông gió bí mật | B2-091 | Đã merge `7367882` |

## Kiểm tra cả đợt (main d43f9b1, Edge, máy desktop)
- Unit (gate merge VH-02): PASS 1768.
- Full e2e 4 worker: FAIL 22 / PASS 136.
  - 18 test portfolio còn mô tả giao diện trước vòng 1 (link "CV" → nay "Contact & CV", mailto → Gmail, h2 CV → trong Contact). Đã giao Codex E2E-R2 sửa test, không đổi giao diện.
  - 4 test world (world.spec vi, world-vehicle ×3) timeout khi máy đang build song song; chạy lại riêng: PASS 5/5 (2 worker) và 3/3 (1 worker).
- Load-budget, Lighthouse, CPU so sánh: NOT RUN, chạy sau khi FL-03 vào main.
- Iris Xe (máy nghiệm thu): NOT RUN.
