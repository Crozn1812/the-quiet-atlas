import { InstancedMesh, Mesh, Scene } from "three";
import { expect, it } from "vitest";
import { createFoliage } from "../../../src/features/world/foliage/instances";
import { placeDressing } from "../../../src/features/world/dressing";
import { placeZoneScenes } from "../../../src/features/world/zones";
import { surfaceHeight } from "../../../src/features/world/scene/compose";

// Lead batch 25: WebGL guarantees only 16 vertex attributes ("Too many attributes" broke 28 e2e tests on SwiftShader).
// Instancing spends 4 (matrix) + 1 (colour) more; the crown-fade adds crownAlpha at runtime, counted here as +1.
function slots(mesh: Mesh) {
  let total = 0;
  for (const attribute of Object.values(mesh.geometry.attributes)) total += Math.ceil(attribute.itemSize / 4);
  if (mesh instanceof InstancedMesh) total += 4 + 1;
  return total;
}

it("keeps every world mesh within WebGL's guaranteed 16 vertex attributes", () => {
  const scene = new Scene();
  const foliage = createFoliage(64);
  const dressing = placeDressing();
  const zones = placeZoneScenes(surfaceHeight);
  scene.add(foliage.group, ...dressing.groups, ...zones.map(zone => zone.group));
  try {
    const over: string[] = [];
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const crown = object instanceof InstancedMesh && object.geometry.getAttribute("treeStyle") ? 1 : 0;
      if (slots(object) + crown > 16) over.push(`${object.name || object.geometry.type}: ${slots(object) + crown}`);
    });
    expect(over).toEqual([]);
  } finally {
    foliage.dispose();
    dressing.dispose();
    zones.forEach(zone => zone.dispose());
  }
});
