## TICKET AUDIO-BIRDS — Tiếng chim hót thật (thay âm tổng hợp)

- Lane / milestone: L3 World (audio) / B3 hyper-real. Theo HR-BIRDS: Duy muốn "chim bay hót"; HR-BIRDS dùng tổng hợp vì sandbox không tải được.
- Lead đã tải sẵn 5 bản thu **CC0** từ Wikimedia Commons vào `assets/audio-src/birds/` (nguồn, tác giả, link trong `SOURCES.md`): chim may áo (tailorbird), chim sẻ, chích chòe, chào mào (bulbul), hải âu.
- Việc:
  1. Dùng ffmpeg cắt các **câu hót sạch** 1–4 s (bỏ đoạn ồn, tiếng người, tiếng xe; fade in/out 20–50 ms; normalize loudness tương đương nhau), mono, **OGG Opus ~48–64 kbps** vào `public/audio/birds/<loài>-<n>.ogg`, mỗi loài 3–8 clip. Hải âu vài clip cho bờ biển.
  2. Mỗi file public một dòng `assets/LICENSES.csv` (nguồn = trang Commons trong SOURCES.md, CC0, tác giả). Ghi lệnh ffmpeg tái tạo vào `tools/assets/audio/birds-cut.mjs` (hoặc .sh).
  3. Nối vào `src/features/audio/birds.ts`: phát clip thật theo vị trí chim/cây (PannerNode HRTF như hiện có), chọn loài theo khu (rừng: may áo, chích chòe, chào mào, sẻ; biển: hải âu), ngẫu nhiên clip + pitch ±3 % + khoảng nghỉ; buổi chiều thưa hơn. Nạp **deferred sau Enter World**, lỗi mạng thì rơi về tổng hợp hiện có. Giữ tắt tiếng, không phát trước tương tác, dispose sạch.
- Được sửa: `public/audio/birds/`, `assets/LICENSES.csv`, `tools/assets/audio/**`, `src/features/audio/birds.ts` (+ mix nếu cần), test audio.
- Không được sửa: `assets/audio-src/**` (chỉ đọc), `src/features/world/**`, lockfile, package.json.
- Xong: gate PASS, `check:licenses` PASS, build 1 lần, e2e world 43/43; bảng file (loài, thời lượng, byte); một file WAV/OGG ghép 30 s "nghe thử rừng" ở `test-results/audio-birds/preview.ogg` để Lead/Duy nghe. Không commit.
