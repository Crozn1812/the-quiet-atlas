import { expect, it } from "vitest";
import { placeDressing } from "../../../src/features/world/dressing";
import { createShore } from "../../../src/features/world/shore";

// Lead batch 25: shore colliders join the world's collision boxes at their world position; dispose is idempotent.
it("turns every shore collider into a world-space box and disposes once", () => {
  const shore = createShore();
  const expected = shore.colliders.map(c => c.center.clone());
  shore.dispose();
  const dressing = placeDressing();
  try {
    expect(dressing.groups.map(group => group.name)).toContain("rocky-shore");
    expect(dressing.boxes.length).toBeGreaterThanOrEqual(expected.length);
    expected.forEach((centre, i) => expect(dressing.boxes[i]!.position.distanceTo(centre)).toBeLessThan(1e-9));
  } finally {
    dressing.dispose();
    dressing.dispose();
  }
});

// B2-163: every guard post and utility pole becomes an upright box from its foot to its top.
it("stands the coast road's posts and poles up as collision boxes", async () => {
  const { createCoastRoad } = await import("../../../src/features/world/road/road");
  const road = createCoastRoad();
  const solids = [...road.layout.posts, ...road.layout.poles];
  road.dispose();
  const dressing = placeDressing();
  try {
    for (const solid of solids) {
      const box = dressing.boxes.find(b => Math.hypot(b.position.x - solid.x, b.position.z - solid.z) < 1e-9)!;
      expect(box, `post at ${solid.x}, ${solid.z}`).toBeDefined();
      expect(box.position.y).toBeCloseTo(solid.y + solid.height / 2, 9);
      expect(box.geometry.parameters.height).toBeCloseTo(solid.height, 9);
    }
  } finally { dressing.dispose(); }
});
