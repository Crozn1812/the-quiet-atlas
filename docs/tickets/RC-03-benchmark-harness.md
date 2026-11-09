# RC-03 — Khôi phục harness đo T08 sau đổi Menu

- Lane: QA / RC-01.
- Mục tiêu: benchmark chọn đúng quality qua radio Menu hiện tại và báo RAM của máy thực tế, để Duy có thể đo Iris Xe.
- Được sửa: `tests/perf/frame-harness.ts`, ticket này; unit test liên quan nếu cần. Không sửa logic world, ngưỡng, thời lượng hay kịch bản benchmark.
- Nguồn: `src/components/portfolio/WorldMenu.ts`, `tests/e2e/helpers.ts`, ADR 0007, spec V6 §8/T08/T09.

## Thay đổi

- Thay locator combobox cũ bằng radio `world-menu-quality`; nút đóng dùng tiền tố × nên không lệ thuộc VI/EN.
- Khi quality đích đã được chọn, chuyển sang quality khác rồi quay lại bằng input thật **trước warm-up**. Radio đã chọn không phát `change`; chuyển này bảo đảm sự kiện manual quality tắt adaptive quality. Kiểm chính xác một sự kiện đích, listener một lần để không tích lũy.
- RAM lấy `os.totalmem()` tại lúc ghi báo cáo; nhãn nêu rõ GiB bộ nhớ khả dụng theo OS. Giữ trường `osTotalMemGB` để tương thích bằng chứng cũ, bỏ hằng 32 GB của desktop.

## Kiểm tra và bàn giao

- Đã chạy tại checkout RC-01 (2026-11-09): `node node_modules/eslint/bin/eslint.js tests/perf/frame-harness.ts --max-warnings=0` **PASS**, exit 0; `node node_modules/typescript/bin/tsc --noEmit` **PASS**, exit 0; `node node_modules/vitest/vitest.mjs run tests/unit/tools/frame-budget.test.ts --maxWorkers=1` **PASS**, 1 file / 18 test, exit 0. Bộ unit này kiểm giới hạn/phương pháp và tính toán thống kê, chưa kiểm thao tác radio trong trình duyệt.
- Lượt dùng `pnpm.cmd` trước đó cũng chạy script nhưng cảnh báo bước tự kiểm dependency bị chặn bởi quyền store lock; các lệnh Node trực tiếp ở trên đã chạy lại, không thay config/dependency.
- T08/T09 trên laptop Iris Xe: **NOT RUN** trong ticket; không chạy benchmark/browser nặng ở đây. Lead/Duy cần đo riêng bằng cấu hình `tests/perf/playwright.frame.config.ts`; kiểm ba lần Low hợp lệ và báo cáo máy.
- Trạng thái khi thi công: chưa merge, chưa commit; không đổi giới hạn hiệu năng.
