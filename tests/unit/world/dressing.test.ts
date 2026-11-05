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
    expect(dressing.boxes).toHaveLength(expected.length);
    dressing.boxes.forEach((box, i) => expect(box.position.distanceTo(expected[i]!)).toBeLessThan(1e-9));
  } finally {
    dressing.dispose();
    dressing.dispose();
  }
});
