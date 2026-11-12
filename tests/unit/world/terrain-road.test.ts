import { Vector3, type Mesh } from "three";
import { expect, it } from "vitest";
import { createCoastRoad } from "../../../src/features/world/road/road";
import { worldHeight } from "../../../src/features/world/terrain/height";
import { nearestPath } from "../../../src/features/world/terrain/samples";

const gridHeights = new Map<string, number>();
function gridHeight(x: number, z: number) {
  const key = `${x},${z}`;
  let height = gridHeights.get(key);
  if (height === undefined) {
    height = Math.fround(worldHeight(x, z));
    gridHeights.set(key, height);
  }
  return height;
}

function terrainHeight(x: number, z: number) {
  const gx = Math.floor(x / 2) * 2, gz = Math.floor(z / 2) * 2;
  const tx = (x - gx) / 2, tz = (z - gz) / 2;
  const a = gridHeight(gx, gz), b = gridHeight(gx + 2, gz);
  const c = gridHeight(gx, gz + 2), d = gridHeight(gx + 2, gz + 2);
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz
    : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

it("keeps asphalt and shoulders just above the rendered 2 m walking surface", () => {
  const road = createCoastRoad();
  try {
    const position = (road.group.children[0] as Mesh).geometry.getAttribute("position");
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), p = new Vector3();
    let minimum = Infinity, worst = "", maxRoadMovement = 0;
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      for (const vertex of [a, b, c]) {
        // Measure separation from the triangles the player actually walks on.
        maxRoadMovement = Math.max(maxRoadMovement, Math.abs(vertex.y - terrainHeight(vertex.x, vertex.z)));
      }
      // Road cells are <= 0.68 m along and <= 0.35 m across: this
      // eighth-triangle lattice is denser than the requested 0.5 m grid.
      for (let u = 0; u <= 8; u++) for (let v = 0; v <= 8 - u; v++) {
        p.copy(a).multiplyScalar(u / 8).addScaledVector(b, v / 8).addScaledVector(c, 1 - (u + v) / 8);
        const clearance = p.y - terrainHeight(p.x, p.z);
        if (clearance < minimum) { minimum = clearance; worst = JSON.stringify({ x: p.x, z: p.z, path: nearestPath(p.x, p.z) }); }
      }
    }
    expect(minimum, worst).toBeGreaterThanOrEqual(0.005);
    expect(maxRoadMovement).toBeLessThanOrEqual(0.13); // Float32 mesh coordinates.
    console.info(`B2-195 road: minimum clearance=${minimum.toFixed(6)} m; max grade movement=${maxRoadMovement.toFixed(6)} m`);
  } finally { road.dispose(); }
});
