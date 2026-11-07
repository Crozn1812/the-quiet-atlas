import { Color, Mesh, MeshToonMaterial, Raycaster, Vector3 } from "three";
import { expect, it } from "vitest";
import { hex } from "../../../src/features/world/art/palette";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { waterLevelAt } from "../../../src/features/world/terrain/height";
import { createTileMesh } from "../../../src/features/world/terrain/mesh";
import { nearestRiver } from "../../../src/features/world/terrain/samples";
import { buildTile, TILE_SIZE } from "../../../src/features/world/terrain/tiles";
import { createRibbonGeometry } from "../../../src/features/world/water/ribbon";

it("diagnoses the Quiet Shore left bank with terrain raycasts", () => {
  const point = pathPointAt(0.89);
  const forward = pathPointAt(0.891).sub(pathPointAt(0.889)).normalize();
  const left = new Vector3(forward.z, 0, -forward.x);
  const material = new MeshToonMaterial();
  const water = new Mesh(createRibbonGeometry(), material);
  water.updateMatrixWorld(true);
  const bankLumas: number[] = [];
  try {
    for (const offset of [4, 6, 8, 10, 12, 14, 16, 18, 20]) {
      const target = point.clone().addScaledVector(left, offset);
      const tile = buildTile(Math.floor(target.x / TILE_SIZE), Math.floor(target.z / TILE_SIZE));
      const mesh = createTileMesh(tile, material);
      try {
        const ray = new Raycaster(new Vector3(target.x, 100, target.z), new Vector3(0, -1, 0));
        const hit = ray.intersectObject(mesh)[0]!;
        expect(hit).toBeDefined();
        // Centre of the broad dark strip is water, not a back-facing cliff.
        if (offset === 8) {
          expect(ray.intersectObjects([mesh, water])[0]!.object).toBe(water);
          expect(hit.point.y).toBeLessThan(waterLevelAt(target.z) - 0.6);
          expect(hit.face!.normal.y).toBeGreaterThan(0.99);
        }
        if (offset === 16) {
          expect(ray.intersectObjects([mesh, water])[0]!.object).toBe(mesh);
          expect(hit.point.y).toBeGreaterThan(waterLevelAt(target.z));
          expect(hit.face!.normal.y).toBeGreaterThan(Math.cos(35 * Math.PI / 180));
          expect(nearestRiver(target.x, target.z).distance).toBeCloseTo(8, 3);
        }
        const colors = mesh.geometry.getAttribute("color");
        if (offset === 14 || offset === 16) {
          const i = hit.face!.a;
          const color = new Color().setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
          const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
          bankLumas.push(luma);
          // Linear vertex pigment, not the mean luma of a rendered frame.
          expect(luma).toBeGreaterThanOrEqual(0.24);
          expect(luma).toBeLessThanOrEqual(0.32);
          expect(color.r).toBeGreaterThan(color.g);
          expect(color.g).toBeGreaterThan(color.b);
          for (const key of ["asphalt", "grass"] as const) {
            const other = new Color(hex(key));
            expect(Math.hypot(color.r - other.r, color.g - other.g, color.b - other.b)).toBeGreaterThan(0.1);
          }
        }
      } finally { mesh.geometry.dispose(); }
    }
    expect(bankLumas).toHaveLength(2);
  } finally { water.geometry.dispose(); material.dispose(); }
});
