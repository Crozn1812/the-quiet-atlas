# B2-030 — bàn dựng A / B / C

Chạy từ thư mục gốc repository, với dependency đã cài sẵn:

```sh
pnpm exec vite tools/styleframes
```

Mở <http://127.0.0.1:4190/?preset=A&shot=forest-dawn&quality=High&t=0>.
Windows nếu PowerShell chặn `pnpm.ps1`: dùng `pnpm.cmd exec vite tools/styleframes`.
Server chỉ bind loopback, `strictPort: true`: cổng 4190 bận thì báo lỗi thay vì đổi cổng.
`vite.config.ts` tại đây chỉ phục vụ bench độc lập; không sửa cấu hình gốc hay thêm script package.
Không có route/import trong Next; không cần nối bench vào `src/features/world/index.ts`.

## B2-209 — bộ chụp T10: 3 vị trí × 4 hướng

Từ root repository, mở server bằng lệnh sẵn có ở trên, rồi chạy ở terminal khác:

```sh
pnpm exec vite tools/styleframes
node tools/styleframes/t10.mjs <out>
```

Ví dụ `node tools/styleframes/t10.mjs ./t10-out`. Đối số thứ hai tùy chọn là `baseUrl`, mặc định
`http://127.0.0.1:4190`. Script mở `tour.html` tương đối với thư mục URL đó. Nếu chạy Vite với
`pnpm exec vite --config tools/styleframes/vite.config.ts --port 4190` (root là repository), dùng
`node tools/styleframes/t10.mjs ./t10-out http://127.0.0.1:4190/tools/styleframes/`.
Máy Lead cần có Microsoft Edge (`channel: msedge`) và dependency đã cài; script không tải trình duyệt.

| Vị trí | t theo chiều dài đường | Bối cảnh |
| --- | --- | --- |
| forest | 0,06 | Rừng bình minh, gần First Light, ngoài nền khu |
| hill | 0,55 | Đồi giữa |
| coast | 0,86 | Đường ven biển hoàng hôn |

Mỗi vị trí chụp yaw 0° (theo hướng đi), 90° (phải), 180° (quay lại), 270° (trái).
`tour.html?view=road&t=0.86&yaw=270` minh họa hướng núi; yaw 90 nhìn về vịnh.
Yaw mặc định 0, chỉ áp dụng cho `view=road`; phải = `(-fz, fx)`, trái = `(fz, -fx)`.
Hàm thuần export `roadLookDirection(t, yaw = 0)` lấy tiếp tuyến đường tại t, xoay trong mặt phẳng X/Z.
Máy cao 1,7 m trên mặt đường, cùng độ nghiêng xuống 0,5 m trên khoảng nhìn 20 m ở mọi hướng.
Ánh sáng và địa hình dùng composer hiện có theo vị trí, quality High.

Script chụp PNG 1600×900, DPR 1, chỉ sau khi `window.__frameReady === true` (ít nhất sáu frame).
Tên ảnh là `t10-<forest|hill|coast>-<0|90|180|270>.png`. Lỗi `pageerror` được ghi ra stderr kèm tên ảnh;
lỗi điều hướng, chờ sẵn sàng hoặc chụp cũng được ghi, các ảnh tiếp theo vẫn được thử.
Cuối lệnh in danh sách file đã ghi và `Errors: <số lỗi>`; có lỗi thì exit 1, thành công exit 0.
File cùng tên trong thư mục ra được ghi đè; chọn thư mục mới cho mỗi vòng duyệt để tránh lẫn ảnh cũ.

`t10-checklist.md` có đủ 12 dòng, hai cột **Duy: đạt/không** và **Người ngoài: đạt/không**,
năm tiêu chí về thế giới/phong cách, ánh sáng, lỗi hình, palette và chất liệu.
Hai người chấm độc lập; đạt khi ≥ 10/12 ảnh được cả hai người chấm đạt.
Checklist được tạo trước khi mở Edge; nếu lệnh lỗi, ảnh thiếu chưa đủ điều kiện chấm.

**Giới hạn / bàn giao:** chụp T10 **NOT RUN** trong sandbox; Lead chạy lệnh trên và duyệt hình/GPU thực tế.
Không chạy e2e/Lighthouse. Tool không tự chấm chất lượng mỹ thuật; chưa có kết quả hai người chấm.
Không cần nối vào `src/features/world/index.ts`: tour dùng trực tiếp composer hiện có, không thêm module runtime.
Lead giữ `index.ts` như hiện tại; mẫu sử dụng khi tích hợp chỉ là lệnh ngoài runtime:

```sh
pnpm exec vite tools/styleframes
node tools/styleframes/t10.mjs ./t10-out
```

## Chụp và quay cùng điều kiện

- Chốt cùng máy, viewport, zoom trình duyệt, DPR và quality cho cả sáu tổ hợp A/B/C × hai cảnh.
- Query: `preset=A|B|C`, `shot=forest-dawn|coast-dusk`, `quality=Low|Balanced|High`, `t=0..18` (giây), `clean=1` ẩn bảng.
- Mặc định: `A`, `forest-dawn`, `High`, `t=0`; giá trị lạ về mặc định. Thời gian hữu hạn vượt 18 được chặn ở 18; số âm/NaN/Infinity/số dạng hex hoặc exponent về 0. Field lặp dùng giá trị đầu tiên.
- Ảnh tĩnh: thêm `&clean=1`, đợi `window.__frameReady === true` rồi chụp bằng công cụ của Lead. Cờ chỉ bật sau ít nhất ba frame đã render; đổi hướng/cảnh/quality/thời gian hoặc resize đặt lại cờ.
- Sáu URL ảnh chuẩn: thay `preset` lần lượt A/B/C, `shot` lần lượt `forest-dawn`/`coast-dusk`, giữ `quality=High&t=0&clean=1`.
- Video: mở cùng URL sạch, chuẩn bị công cụ quay của Lead, nhấn Space để chạy một đường dolly 18 s từ t=0. Có ba frame đứng yên để warm up rồi mới chạy; cuối đường dừng ở t=18. Nhấn R về góc tĩnh, H hiện/ẩn bảng. Bảng cũng có nút chạy/dừng và thanh thời gian.
- `t` là nguồn thời gian của camera, không phải thời gian từ lúc tải. Khi đứng yên, không có chuyển động ngẫu nhiên hoặc thời gian thực trong scene/grain. Video dùng thời gian rAF để giữ đúng 18 s; frame bị rớt sẽ bỏ qua mẫu thời gian. Muốn so từng frame video, chụp chuỗi URL `t=n/30` qua công cụ của Lead.
- Overlay: preset, shot, quality, giây hiện tại, FPS từ cửa sổ trượt tối đa 2 s và tổng draw calls mỗi frame (cả scene, shadow, paper pass). Chờ đủ 2 s trước khi ghi FPS; số đo này cần đối chiếu trên Iris Xe thật.

Các lựa chọn và playback chỉ nằm trong bộ nhớ. Query chỉ được đọc lúc mở trang; không ghi URL, history, localStorage, sessionStorage hoặc cookie. Không tự chụp, tải ảnh, quay hoặc gửi dữ liệu.

## Dàn cảnh và tham số

`shots.ts` lấy điểm rừng giữa First Light/Workshop, điểm biển ở Quiet Shore từ `ZONES`, chuyển qua `pathRiverTAt`/`riverPointAt`. Camera nhìn xuôi lòng suối hoặc về cửa biển. Cả hai dolly dài 18 s, dịch khoảng 6 m, cao hơn `worldHeight` ít nhất 3,4 m. Cùng FOV, seed, terrain, ánh sáng và đường máy giữa các hướng.

`main.ts` dùng `createTilePool` (kèm collider Rapier thật), `buildTile`/`createTileMesh` cho phần nền ngoài hành lang, `scatterTile`/`createFoliage`, `createSkyDome`/`lightingAt`, ramp và merged paper pass hiện có. Candidate cây được cache theo cảnh; B chọn tập con cố định của A/C. Chất lượng điều khiển DPR, shadow, density và paper pass theo API sẵn có. Renderer dùng ACES như world hiện tại; không fork shader.

`presets.ts` ghi lý do bên cạnh từng nhóm tham số theo taste §5.2–5.4:

| Hướng | Nền | Tán | Ramp / sương / viền |
| --- | --- | --- | --- |
| A | Ngọc pha kem, trời rõ màu hơn | Xanh đầy, mật độ 1 | 4 bậc mềm, sương nhẹ, không ink |
| B | Nhiều kem, trời loãng | Ngọc/chàm giảm bão hòa, mật độ 0,58 | 3 bậc mềm, sương phân lớp mạnh, ink + bleed |
| C | Dùng nguyên object nền B | Dùng nguyên object tán A | Ramp nền B, ramp tán A; post của B |

Mỗi màu là recipe có nguồn `PALETTE`: pha trong linear space, sau đó chỉ giảm HSV saturation/value trong sRGB. Không thêm swatch hex. Màu overlay cũng lấy từ `PALETTE`. Cam/đỏ hiếm không dùng làm mảng nền. Nét mực của B/C là viền hậu kỳ toàn cảnh theo API, bao gồm cây.

## Bàn giao cho Lead / giới hạn

- **TODO nước:** `src/features/world/water/` chưa tồn tại. Hiện là lòng suối và địa hình bờ/cửa biển khô, chưa có mặt nước, sóng hay phản chiếu. Lead thêm factory nước tại TODO trong `buildScene()`, cố định seed/thời gian theo `options.t`, dispose khi đổi cảnh/đóng trang. Không thể duyệt chất liệu nước với bản này.
- API paper hiện chỉ bật ink ở **High**; Balanced có bleed/sương, Low dùng scene fog màu giấy, không merged paper pass/grain/ink. Muốn duyệt đầy đủ A/B/C dùng High.
- Đây là bench procedural từ module hiện có: chưa có asset sản xuất, nhân vật, xe, cloud/brush asset, mẫu overlay tạp chí hoặc khung ảnh film. Không dùng pixel/file tham chiếu ngoài.
- Chưa mở trình duyệt, chưa xác nhận hình bằng GPU, chưa chụp/quay hoặc đo Iris Xe trong sandbox. HTTP/build smoke không thay thế duyệt hình của Lead. Vite build có cảnh báo chunk >500 kB do gói Three/Rapier; bench riêng, không vào bundle Next.
- Không commit. Chỉ sửa `tools/styleframes/**` và `tests/unit/tools/styleframes.test.ts`.

Sau vòng duyệt, Lead chuyển **tham số đã chọn và helper paletteColor** vào module runtime phù hợp, rồi nối vào `index.ts` khi tích hợp terrain/foliage/sky mới. Không import `tools/styleframes/main.ts` hoặc gắn bench vào web. Hook minh họa bên dưới giả sử các factory mới đã được Lead dựng như trong `main.ts`, `p` là preset đã chọn và `frame` là camera sample:

```ts
terrainMaterial.color.setHex(paletteColor(p.background.terrain));
terrainMaterial.gradientMap = createRampGradient(p.background.ramp.steps, p.background.ramp.soft);
for (const kind of Object.values(foliage.species)) {
  kind.crowns.material.color.setHex(paletteColor(p.foliage.crown));
  kind.crowns.material.gradientMap = createRampGradient(p.foliage.ramp.steps, p.foliage.ramp.soft);
  kind.trunks.material.color.setHex(paletteColor(p.foliage.trunk));
  kind.trunks.material.gradientMap = kind.crowns.material.gradientMap;
}
paper.setMist({ ...p.background.mist, height: frame.mistHeight });
paper.setEdges(p.background.edges);
grade.skyTop.setHex(paletteColor(p.background.sky.dawn.top));
grade.skyHorizon.setHex(paletteColor(p.background.sky.dawn.horizon));
sky.update(grade);
```

Chọn `dusk` thay `dawn` ở cảnh biển. Lead còn áp dụng `p.foliage.density` vào tập candidate trước `foliage.setTiles`, và giữ shadow/DPR theo quality. Đoạn trên không tự thay đổi code runtime.

## Kiểm tra

Lệnh bắt buộc chạy từ root (Windows dùng `pnpm.cmd` nếu cần):

```text
pnpm lint       → $ eslint .       → exit 0, 0 warnings
pnpm typecheck  → $ tsc --noEmit   → exit 0
pnpm test       → Test Files 47 passed (47); Tests 402 passed (402) → exit 0
```

Unit test phủ nguồn màu và HSV ≤0,85, B có ink/A không, C bằng nền B + tán A, toàn đường camera trên terrain, thời lượng/độ chậm/tính tất định và query an toàn. Smoke bổ sung: Vite build riêng exit 0 (cảnh báo chunk lớn như trên), dev server đúng 4190 và HTTP 200 cho HTML/main/presets. Không chạy Next build, e2e, Lighthouse hoặc mở browser.
