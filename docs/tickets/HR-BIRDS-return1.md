## HR-BIRDS — trả lại vòng 1 (Lead)

Lead đã rebase W-D lên main mới nhất. Phần kỹ thuật tốt (gate, e2e 43/43, nối index.ts gọn, hải âu xa nhìn ổn). Chưa đạt thước đo siêu thực (HR-common.md), đặc biệt Duy muốn **nghe chim hót thật**:

1. **Âm thanh**: oscillator tổng hợp 3 kiểu sẽ nghe như đồ chơi điện tử. Thay bằng **bản thu chim hót thật CC0** (Freesound, chỉ file có license "Creative Commons 0"; ghi URL, tác giả, license từng file vào `assets/LICENSES.csv`). KHÔNG dùng xeno-canto (đa số CC BY-NC) hay file không ghi license. Ít nhất 5 loài rừng nhiệt đới/chim sẻ/chích chòe/cu gáy + tiếng hải âu, sóng không tính. Cắt thành đoạn ngắn 1–4 s, OGG/Opus mono ~48–64 kbps vào `public/audio/birds/`, nạp **sau** Enter World (deferred), phát ngẫu nhiên theo vị trí cây (PannerNode/HRTF), buổi chiều thưa hơn. Giữ tắt tiếng/không phát trước tương tác. Nếu không tải được file CC0 trong sandbox (mạng chặn) thì ghi BLOCKED rõ và giữ tổng hợp làm fallback — không bịa nguồn.
2. **Chim đậu cận cảnh** (ảnh perch-detail) là khối tròn thô. Làm mô hình chim nhỏ có hình dáng thật (mỏ, đầu, đuôi, cánh gấp, chân), 2–3 bộ màu loài khác nhau, texture/vertex color có vằn lông; đập cánh khi bay bằng shader/bone. Có thể tạo trong Blender (CLI) hoặc model CC0 (Quaternius/Poly Pizza CC0, ghi license).
3. Chim đậu phải nhìn thấy được trên cành cây ở khoảng cách chơi bình thường (không chỉ cận cực gần).

Build 1 lần cuối. Xong: gate, e2e world 43/43, ảnh trước/sau High + cận chim đậu + Low, danh sách file âm thanh kèm URL CC0. Không commit.
