## TICKET MS-C — Milestones: hình nộm gần thực, mảnh chứng chỉ hàn gắn vào cơ thể (Duy yêu cầu 14/11)

- Lane / milestone: L3 World / đồ họa hướng C (ADR 0018), khu Milestones.
- Ý Duy: tượng chứng chỉ thành **hình người gần thực, toàn thân**, đang bước đi; các **mảnh chứng chỉ như kính** bay xoáy quanh theo **dải sáng vàng**, rồi **hàn gắn vào cơ thể** (đường nứt vàng kiểu kintsugi), tạo nên con người hoàn thiện.
- Tham chiếu: `docs/art-bible/refs/milestones-shards-duy.png` (gitignore, chỉ lấy cảm hứng). **Không chép** bố cục, khuôn mặt, chữ hay pixel của ảnh. **Áo trơn, không logo** (ảnh có logo trên áo: bỏ). Không thành phố/nhà cao tầng: giữ sườn đồi Milestones hiện tại.

### Nội dung: không bịa
- Chữ trên mảnh **chỉ** lấy từ `milestoneCertificates()` (đọc `src/content/certificates.json`, dùng `inscription` tiếng Anh sẵn có). Không thêm mảnh "IELTS", "Français", "SQL"… như ảnh tham chiếu. Hiện có 4: CCNA và DevOps VTI (đạt), AWS SAA và Linux/CEH (dự định).
- **Đạt** → mảnh đã hàn vào thân (ngực/vai/tay), mép có đường vàng phát sáng nhẹ, mảnh kính trong mờ lộ vân bên trong.
- **Dự định** → trên thân còn **khe trống đúng hình mảnh**; mảnh tương ứng lơ lửng gần đó, quay chậm theo dải sáng, chưa khớp. Đây là ý nghĩa thật: chưa thi thì chưa hoàn thiện.
- Thêm/bớt chứng chỉ trong JSON → số mảnh tự đổi, không sửa code.

### Hình và kỹ thuật
- Thân: dùng lại mô hình nhân vật 19 xương (`public/world/character/`), một **tư thế bước đi đông cứng** (lấy một khung của clip walk, bake vào geometry tĩnh, không skinned lúc chạy). Vật liệu gần thực **sứ/đá trắng mờ** (PBR, roughness cao, SSS giả bằng wrap lighting), vết nứt vàng theo đường biên mảnh.
- Mảnh kính: không dùng `transmission` (đắt). Dùng Fresnel + phản chiếu env (IBL GFX-P1) + alpha, mép sáng; chữ khắc nhẹ lên mảnh (texture canvas tạo lúc build hoặc lúc chạy, cache).
- Dải sáng: 2–3 dải xoắn quanh thân, một draw (tube mỏng hoặc ribbon), additive, bloom nhẹ ở High.
- Hoạt cảnh: khi người chơi lại gần (≤ 12 m) mảnh dự định xoay chậm và dải sáng chạy; **reduced motion** → tĩnh. Animation trong vertex shader (uniform time), **không** update object mỗi frame bằng JS.
- Low: không dải sáng, không bloom, mảnh đục đơn giản; giữ đọc được chữ.
- Giữ nguyên **vị trí tượng, điểm E, collider, overlay chứng chỉ** hiện có.

### Ngân sách
- Tam giác khu ≤ +25 000 High; draw call khu tăng ≤ 4; asset thêm ≤ 1,5 MB (deferred); CPU ABBA ≤ +10 ms/s ở Milestones.

### Phạm vi
- Được sửa: `src/features/world/zones/milestones.ts`, `zones/milestones-statue*.ts` (mới), `zones/milestones-dressing.ts` (chỉ nếu va chạm), `tools/assets/blender/milestones-*` (mới), `public/world/milestones/` (mới), `assets/LICENSES.csv`, test của khu.
- Không được sửa: `index.ts`, `character/**`, `post/**`, `src/content/**`, khu khác.
- Xong: gate PASS; build một lần; e2e world `--workers=2` config mặc định 43/43; ảnh High 3 góc (trước/sau, có một góc thấy rõ khe trống) + Low 1 góc + clip 10 s hoạt cảnh (nếu ghi được); `check:assets`; bảng tam giác/draw/byte. Không commit.
