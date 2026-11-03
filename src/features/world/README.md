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
node tools/benchmark-physics/index.mjs
pnpm test
```

Benchmark imports Vite directly from the pinned devDependency; tạo bundle riêng trong OS temp và xóa sau
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

## P01-B procedural placeholder (L2-003)

`mountWorld(container, { collision: "rapier", quality: "Balanced", debug: false })`
keeps the existing Promise/unmount contract and chunk marker. Quality is optional:
Low/Balanced/High = 80/140/200 visible trees (40/70/100%), DPR caps 1/1.25/2,
shadow off/1024/2048. No assets, textures, baked AO or post-processing pipeline;
all terrain, trunks, crowns and capsule are **procedural placeholders**, not final art.
Dawn palette: sky/fog #e4c8a5, sun #ffce91, hemisphere #ffe2bb/#43574a,
terrain #657552, crowns #344e3d. Linear fog near/far 15/65 m, ACES tone mapping.

Terrain is 60×60 m, 60×60 cells, flat around spawn (0,4), with a continuous
northbound 20% ramp beginning at z=-2 and plateau at 5 m. Height array indexing
is `z + x * 61` (Rapier column-major); mesh and heightfield use the same Float32Array.
Seed 73021 fixes tree layout: 140 west-grove and 60 east-grove trunks, a clear
central walking corridor. All 200 cylinder colliders remain in Rapier at every
quality; reduced quality can therefore leave invisible obstacles in groves.
The raycast option remains an experimental mesh-based comparison from P01-A;
it does not provide Rapier's quality-independent trunk collider guarantee.

`debug: true` is a developer opt-in, never enabled by default or persisted.
It appends an output containing rolling RAF FPS/frame interval and renderer draw
calls, triangles, geometry/texture counts. This instrumentation is not a T08
result. Unmount disposes instances, geometries/materials, shadow target, renderer,
physics world (including heightfield/trunks), listeners, observer, RAF and output.

`node tools/benchmark-physics/index.mjs` runs offline: structural terrain/forest
counts and a Vite world library gzip breakdown, then CPU controller timings.
These counts exclude capsule, camera culling and shadow passes; actual browser
renderer draw calls and visual/lifecycle QA remain NOT RUN. Browser FPS is deferred
to P01-F. Label machine **desktop dGPU RTX 3060**, per ADR 0007, never iGPU.

## P01-C controller and recovery

This section supersedes the P01-A world-axis movement description above.
WASD follows the camera's horizontal world direction, including the initial
fixed offset; hold either Shift to run. Speeds are 3 m/s walking and 5 m/s running.
Diagonal input is normalized. Camera orbit remains P01-D work.
Rapier uses a 45 degree slope limit, 0.3 m autostep (0.2 m minimum width),
0.25 m ground snap and gravity -9.81 m/s². The shared 60 degree test ramp is
at (-4, 1.65, 0), approached from +Z; it must block climbing.

Session progress lives only in memory. A stable grounded point is promoted after
0.5 simulation seconds. Falling below Y=-10 or failing to advance 0.1 m with
movement input for 3 simulation seconds returns to the last safe point, clearing
velocity without deleting secrets or visited zones. Pause resets recovery timers.

L1 can attach a Return to path button without changing the mount API:

```ts
container.dispatchEvent(new CustomEvent("tqa:return-to-path"));
```

Dispatch on the exact container passed to `mountWorld`; no detail payload is needed.
It also works while paused, preserving pause reasons and clearing held input.
Unmount removes the listener. No browser storage, URL or backend writes occur.
Headless logic checks do not certify browser T03 latency or the T04 five-minute
20-trunk collision checklist. T03/T04 video: **NOT RUN**.