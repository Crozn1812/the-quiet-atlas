import { reportBudget } from "./report-budget";
import { Box3, InstancedMesh, Mesh, Scene, Vector3 } from "three";
import { afterEach, expect, it } from "vitest";
import { createGd110, disposeGd110 } from "../../../src/features/world/vehicle/mesh";
import { createWorldScene, surfaceHeight } from "../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";
import { createFarLandscape } from "../../../src/features/world/scene/far-landscape";
import { placeZoneScenes, zoneFoliageBounds } from "../../../src/features/world/zones";
import { createForestSunShafts } from "../../../src/features/world/zones/first-light";
import { placeDressing } from "../../../src/features/world/dressing";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";

// Measured from the input mesh before this ticket; the surrounding world is unchanged.
const ORIGINAL_TRIANGLES = 2604;
function triangles(root: Scene | ReturnType<typeof createGd110>) {
  let total = 0;
  root.traverseVisible(node => {
    if (!(node instanceof Mesh)) return;
    const submitted = Math.min(node.geometry.drawRange.count,
      node.geometry.index?.count ?? node.geometry.getAttribute("position").count);
    total += submitted / 3 * (node instanceof InstancedMesh ? node.count : 1);
  });
  return total;
}

afterEach(disposeRampGradients);

it("reports vehicle triangle, envelope and Node construction measurements", () => {
  const samples: number[] = [];
  for (let i = 0; i < 31; i++) {
    const start = performance.now();
    const bike = createGd110();
    samples.push(performance.now() - start);
    try {
      if (i !== 30) continue;
      const count = triangles(bike);
      reportBudget("tests/unit/world/vehicle-budget.test.ts:36 count", count, 8000);
      const size = new Box3().setFromObject(bike).getSize(new Vector3()).toArray().map(n => n.toFixed(6));
      const median = samples.sort((a, b) => a - b)[15]!;
      // Report timing rather than asserting a host-dependent wall clock in the shared unit suite.
      process.stdout.write(`B2-189 GD110: triangles=${ORIGINAL_TRIANGLES} -> ${count}; draws=3 -> 1; `
        + `size XYZ=${size.join(" x ")} m; Node median (31 builds)=${median.toFixed(2)} ms\n`);
    } finally { disposeGd110(bike); }
  }
});

it("keeps the High procedural world triangle increase below 25% at spawn", () => {
  const scene = new Scene();
  const cleanup: (() => void)[] = [];
  try {
    const zones = placeZoneScenes(surfaceHeight);
    cleanup.push(() => zones.forEach(zone => zone.dispose()));
    zones.forEach(zone => scene.add(zone.group));
    const dressing = placeDressing();
    cleanup.push(() => dressing.dispose());
    dressing.groups.forEach(group => scene.add(group));
    const far = createFarLandscape();
    cleanup.push(() => far.dispose());
    scene.add(far.mesh);
    const sun = createForestSunShafts(surfaceHeight);
    cleanup.push(() => sun.dispose());
    scene.add(sun.group);
    const composition = createWorldScene({ ...createMeshPhysics(), scene, quality: "High",
      zoneBoxes: [...zones.flatMap(zone => zone.boxes), ...dressing.boxes, ...dressing.surfaces],
      zoneBounds: zoneFoliageBounds(zones) });
    cleanup.push(() => composition.dispose());
    // Eager optional scenery + resident terrain/foliage. The fetched character, UI and post pass
    // are excluded; all are unchanged, so including them would only reduce this percentage.
    const surrounding = triangles(scene);
    const bike = createGd110();
    cleanup.push(() => disposeGd110(bike));
    scene.add(bike);
    const before = surrounding + ORIGINAL_TRIANGLES, after = triangles(scene);
    expect(after - before).toBe(triangles(bike) - ORIGINAL_TRIANGLES);
    reportBudget("tests/unit/world/vehicle-budget.test.ts:74 after", after, before * 1.25);
    process.stdout.write(`B2-189 procedural world / High / spawn: triangles=${before} -> ${after}; `
      + `increase=${((after / before - 1) * 100).toFixed(3)}% (limit=25%)\n`);
  } finally { cleanup.reverse().forEach(dispose => dispose()); }
  // Full eager scenery setup is a budget census, not a startup timing gate.
}, 60_000);
