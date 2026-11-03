# L2-001 physics spike

Điểm vào duy nhất cho shell: `index.ts`. Chưa nối route nào. Cảnh hình học
placeholder: mặt phẳng 30 m, dốc 15°, ba cột; capsule bán kính 0,35 m,
nửa đoạn trụ 0,55 m. WASD theo trục cảnh; camera cố định theo capsule.
Đây chưa phải controller/camera hoàn chỉnh của P01-C/D.

Loader mẫu cho Lead đặt trong client shell (container cần chiều cao khác 0):

```ts
let teardown: (() => void) | undefined;
let entering = false;
let generation = 0;

async function onEnterWorld(container: HTMLElement) {
  if (entering || teardown) return;
  entering = true;
  const current = ++generation;
  try {
    // Chỉ gọi từ hành động Enter World; không prefetch, không import tĩnh.
    const { mountWorld } = await import("@/features/world");
    if (current !== generation) return;
    const unmount = await mountWorld(container, { collision: "rapier" });
    if (current !== generation) unmount();
    else teardown = unmount;
  } catch (error) {
    if (current === generation) {
      // Shell chuyển recoverableError và hiển thị đường về Quick HTML.
      console.error(error);
    }
  } finally {
    entering = false;
  }
}

function onLeaveWorld() {
  generation++;
  teardown?.();
  teardown = undefined;
}
```

`collision: "raycast"` chọn B và không import Rapier. Mặc định là A.
Hàm unmount idempotent hủy RAF, listener, observer, physics và GPU/context.
Nếu rời shell trong khi mount đang chờ, loader phải gọi unmount ngay khi promise
hoàn tất như mẫu. Chỉ một mount trên một container tại một thời điểm.
Không persistence. Hidden tab dừng RAF, blur dừng simulation; resume xóa phím,
vận tốc và accumulator. Focus vào input/dialog cũng xóa input gameplay.
Fixed 60 Hz, tối đa 5 bước/frame, bỏ backlog dư.

## Đo lại offline

```sh
node src/features/world/benchmark.mjs
pnpm test
```

Benchmark dùng Vite có sẵn qua Vitest, tạo bundle riêng trong OS temp và xóa sau
đo. Không cài dependency. Gzip từng bundle collision tự chứa; không tính renderer
và shell, không phải số transfer toàn world của Next. Chạy ba process mới để đo
init nguội ở mức process (không đảm bảo cache đĩa nguội).

840 bước/chu kỳ: tiến/lùi qua dốc 180 bước mỗi hướng, phải 60 bước, tiến/lùi
về cột 180 bước mỗi hướng, trái 60 bước. Va chạm làm vị trí cuối khác vị trí đầu;
tạo controller mới mỗi chu kỳ đo, ngoài timer, để không trôi khỏi cảnh. Warm-up
8.400 bước; đo 84.000 bước, bao gồm controller + world.step với A, toàn thuật toán
raycast với B. Không đo render, GPU hay browser time-to-playable.

B dùng capsule đứng với các ray quét tại ba cao độ và ba độ lệch ngang, cộng
năm ray hỗ trợ chân. Đây là xấp xỉ hữu hạn: có thể hụt góc, chưa có slide/autostep
tổng quát và không thay thế shape sweep chính xác. Không dùng B cho production
khi chưa bổ sung các ca góc/cạnh, dốc gắt, bậc và tunneling.

Xem quyết định và số đo tại `docs/adr/0002-physics.draft.md`.
