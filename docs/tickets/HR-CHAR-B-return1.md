## HR-CHAR-B — trả vòng 1 (Lead): chỉ tóc
Giữ nguyên: áo (nếp gọn, đạt), tay nắm ghi đông (đạt), mọi thứ khác.
Tóc bị kém đi so với trước. Ảnh: `test-results/hr-char-b/studio/after-face.png`. Tóc giờ là một khối liền, trơn bóng như mũ bảo hiểm, mép mái trước trán rách răng cưa, không thấy sợi nào. Bản trước có sợi tóc nhưng sợi bay lởm chởm và bị alias.
Cần ở giữa hai bản, giống tóc thật ngắn của nam:
1. Thấy được lọn và sợi trên bề mặt: hair card nhiều lớp, có texture sợi (alpha) và anisotropic highlight dọc theo sợi. Không còn khối trơn bóng.
2. Mép tóc (mái, thái dương, gáy) thưa dần, mềm, không có cạnh rách hay răng cưa. Dùng alpha-to-coverage hoặc alpha test kèm dither; sort hoặc depth pre-pass để không nhấp nháy.
3. Không có sợi bay rời khỏi khối tóc quá 1–2 cm.
4. Chân tóc ở trán và thái dương có lớp da đầu mờ chuyển dần, không phải đường cắt.
So với ảnh chụp thật tóc ngắn nam ở cùng góc. Chụp lại after-face, after-front, world close, cận tóc ba góc (trước, nghiêng, sau) ở `test-results/hr-char-b-r1/`.
Điều kiện xong như card (E2E_PORT=4203). Không commit.
