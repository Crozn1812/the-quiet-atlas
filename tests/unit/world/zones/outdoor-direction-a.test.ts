import { Box3, BufferGeometry, Color, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PALETTE } from "../../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../../src/features/world/materials/ramp";
import { createHorizonScene } from "../../../../src/features/world/zones/horizon";
import { createLastPostcardScene } from "../../../../src/features/world/zones/last-postcard";
import { createMilestonesScene } from "../../../../src/features/world/zones/milestones";
import { createQuietShoreScene } from "../../../../src/features/world/zones/quiet-shore";

/** Weld flat-shaded seams to inspect individual props even inside merged material batches. */
function componentBounds(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position");
  const parents = Array.from({ length: positions.count }, (_, i) => i);
  const root = (i: number): number => {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]!]!;
      i = parents[i]!;
    }
    return i;
  };
  const join = (a: number, b: number) => { parents[root(a)] = root(b); };
  const welded = new Map<string, number>();
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => n.toFixed(5)).join(",");
    const previous = welded.get(key);
    if (previous !== undefined) join(i, previous);
    else welded.set(key, i);
  }
  const count = geometry.index?.count ?? positions.count;
  for (let i = 0; i < count; i += 3) {
    const indices = [0, 1, 2].map(offset => geometry.index?.getX(i + offset) ?? i + offset);
    join(indices[0]!, indices[1]!);
    join(indices[0]!, indices[2]!);
  }
  const bounds = new Map<number, Box3>();
  for (let i = 0; i < positions.count; i++) {
    const id = root(i), box = bounds.get(id) ?? new Box3();
    box.expandByPoint(new Vector3().fromBufferAttribute(positions, i));
    bounds.set(id, box);
  }
  return [...bounds.values()];
}

describe("direction A outdoor ground and pigments", () => {
  for (const [name, factory] of Object.entries({
    milestones: createMilestonesScene, horizon: createHorizonScene,
    "quiet-shore": createQuietShoreScene, "last-postcard": createLastPostcardScene,
  })) {
    it(`${name}: has no large thin ground discs, including within merged batches`, () => {
      const scene = factory({ seed: 177, heightAt: () => 0,
        onPath: x => Math.abs(x) <= 2.6, underWater: () => false });
      try {
        scene.group.traverse(node => {
          expect(node.name).not.toMatch(/disc|disk|patch|plinth/i);
          if (!(node instanceof Mesh)) return;
          for (const box of componentBounds(node.geometry)) {
            const size = box.getSize(new Vector3());
            const groundDisc = box.max.y <= 0.2 && size.y <= 0.15 && Math.min(size.x, size.z) > 2;
            expect(groundDisc, `${node.name}: ${size.toArray()}`).toBe(false);
          }
          // Required natural whites have their own recipes; other materials stay away from paper.
          if (/-(white|paint|roof|cream|paper)$/.test(node.name)) return;
          const paper = new Color(PALETTE.paper);
          const color = node.material.color as Color;
          expect(new Vector3(...color.toArray()).distanceTo(new Vector3(...paper.toArray()))).toBeGreaterThan(0.2);
        });
      } finally {
        scene.dispose();
        disposeRampGradients();
      }
    });
  }
});
