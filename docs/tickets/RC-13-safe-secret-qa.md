## RC-13 — Hook QA không đặt người chơi xuyên ghế

- Vùng: src/features/world/index.ts, tests/unit/world/intro-wiring.test.ts.
- Trạng thái: doing.
- Ảnh ending từ visitSecret(unwritten-page) đặt actor tại tâm ghế, xuyên mặt ghế. Đi bộ thật có swept box chặn; đây là lỗi pose trong bằng chứng QA, không phải bằng chứng người chơi đi xuyên ghế.
- Sửa: hook đứng cạnh ghế (x+1.8m, ngoài collider+capsule, vẫn trong bán kính khám phá 2.5m), dùng cao độ rendered surface rồi gọi discover thật như cũ. Không thêm animation ngồi hoặc đổi trải nghiệm người chơi.
- Kiểm: unit vị trí hook và event not-yet; chụp lại ending, phím E thật tại điểm tiếp cận; QA cameraDistance chỉ trả scalar được thêm vào whitelist unit, không lộ controller/camera mutable.
