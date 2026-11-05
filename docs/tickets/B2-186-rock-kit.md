## TICKET B2-186: bộ đá (đá cuội, tảng lớn, vách) dùng chung

- Được sửa: tạo `src/features/world/props/rocks.ts`; sửa `src/features/world/shore/geometry.ts` (**chỉ** `createShoreRockGeometry`, chuyển sang dùng kit); test mới `tests/unit/world/rocks.test.ts` + test shore liên quan.
- Không sửa `foliage/ground.ts` (B2-185 đang sửa); Lead sẽ đổi `createRock` sang kit sau.
- Đọc `_dirA-common.md`, `_asset-common.md`.

### Việc

1. Export `createRockGeometry(kind: "pebble" | "stone" | "boulder" | "slab", seed: number): BufferGeometry`.
   - Hình: khối đa diện bị cắt mặt phẳng (mặt vỡ phẳng + cạnh vát), không phải cầu méo. Boulder có 1–2 vết nứt lõm; slab dẹt như đá phiến xếp lớp.
   - Vertex color: mặt hướng lên sáng hơn và ngả `grass` (rêu) ở rừng nếu tham số `mossy`; mặt hướng xuống tối (`rockDark`); cạnh vát sáng nhẹ để đọc khối.
   - Tam giác: pebble ≤ 80, stone ≤ 200, boulder ≤ 400, slab ≤ 160.
   - ≥ 4 biến thể/loại theo seed.
2. Export `createRockStack(seed)`: chồng 3–5 slab/stone cân bằng (như chồng đá xếp ven biển), ≤ 700 tam giác.
3. `createShoreRockGeometry` dùng kit (boulder/stone); giữ chữ ký và kích thước bounding để collider không đổi (test so bounding ±5 %).

### Test

- Tam giác theo loại; bounding hợp lý (pebble 0,1–0,3 m, stone 0,3–0,8 m, boulder 1,2–3 m).
- Normal mặt vỡ: ≥ 30 % mặt có normal gần như song song (mặt phẳng lớn), để chắc không phải cầu méo.
- Màu thuộc PALETTE; tất định; shore test cũ pass.
