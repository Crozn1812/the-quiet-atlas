import { reportBudget } from "./report-budget";
import { expect, it, vi } from "vitest";
import { InstancedMesh, Mesh, Scene, Vector3 } from "three";
import { createWorldScene } from "../../../src/features/world/scene/compose";
import { createMeshPhysics } from "../../../src/features/world/scene/mesh-physics";
import { ZONES } from "../../../src/features/world/layout/zones";

// Compare the actual streamed composer against the shipped coast, at identical sites/quality.
const mode = vi.hoisted(() => ({ r1: true }));
vi.mock("../../../src/features/world/foliage/coast-r1", async importOriginal => {
  const original = await importOriginal<typeof import("../../../src/features/world/foliage/coast-r1")>();
  return { ...original,
    coastR1Weight: (t: number) => mode.r1 ? original.coastR1Weight(t) : 0,
    isCoastR1Tree: (tree: Parameters<typeof original.isCoastR1Tree>[0]) => mode.r1 && original.isCoastR1Tree(tree),
  };
});

it("keeps High submissions below the shipped triangle/draw budgets, including the coast visible from Horizon", () => {
  const measure = (r1: boolean) => {
    mode.r1 = r1;
    const scene = new Scene(), backend = createMeshPhysics();
    const world = createWorldScene({ ...backend, scene, quality: "High", paper: { setGrade() {}, setMist() {} } });
    try {
      return ["first-light", "horizon", "quiet-shore", "last-postcard"].map(id => {
        const zone = ZONES.find(z => z.id === id)!;
        world.update(new Vector3().copy(zone.position), 0);
        let triangles = 0, draws = 0, bytes = 0;
        const arrays = new Set<ArrayBufferLike>();
        scene.traverseVisible(object => {
          if (!(object instanceof Mesh)) return;
          const count = object instanceof InstancedMesh ? object.count : 1;
          if (!count) return;
          triangles += Math.min(object.geometry.drawRange.count,
            object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3 * count;
          draws += Array.isArray(object.material) ? object.material.length : 1;
          // The shipped terrain did not allocate the new surface mask. Exclude that
          // buffer from the counterfactual's memory total, while retaining equal tile topology.
          const attributes = Object.entries(object.geometry.attributes)
            .filter(([name]) => r1 || name !== "coastSurface").map(([, attribute]) => attribute);
          for (const attribute of [...attributes, object.geometry.index,
            ...(object instanceof InstancedMesh ? [object.instanceMatrix] : [])]) {
            if (!attribute || !("array" in attribute) || arrays.has(attribute.array.buffer)) continue;
            arrays.add(attribute.array.buffer); bytes += attribute.array.byteLength;
          }
        });
        return { id, triangles, draws, bytes };
      });
    } finally { world.dispose(); }
  };
  try {
    const before = measure(false), after = measure(true);
    after.forEach((result, i) => {
      const base = before[i]!;
      reportBudget("tests/unit/world/coast-r1-budget.test.ts:53 result.triangles", result.triangles, base.triangles * 1.25);
      reportBudget("tests/unit/world/coast-r1-budget.test.ts:54 result.draws", result.draws, base.draws + 3);
      if (result.id === "first-light") expect(result.triangles).toBe(base.triangles);
      process.stdout.write(`R1-C High ${result.id}: triangles ${base.triangles}->${result.triangles}; draws ${base.draws}->${result.draws}; geometry/instance bytes ${base.bytes}->${result.bytes}\n`);
    });
  } finally { mode.r1 = true; }
}, 60_000);
