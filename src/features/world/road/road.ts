import { Group, Mesh } from "three";
import { hex, type PaletteKey } from "../art/palette";
import { pathLength } from "../layout/path";
import { createRampMaterial } from "../materials/ramp";
import { worldHeight } from "../terrain/height";
import { roadGeometryBuilder } from "./geometry";
import {
  createRoadLayout, ROAD_END, ROAD_LIFT, ROAD_START, ROAD_WIDTH,
  roadFrameAt, roadRandomAt, roadWidthAt,
} from "./layout";
import { createRoadInstances, createRoadWires } from "./posts";

// Duplicate band boundaries to keep crisp paint in the same draw call as asphalt.
// Refine both terrain shoulders (the existing flat walking strip is only 3 m).
// Longitudinal cells are <= 0.65 m; shoulder cells are <= 0.3 m.
export const ROAD_BANDS = [-2.5, -2.2, -2.05, -1.8, -1.5, -1, -0.5, -0.075, 0.075, 0.5, 1, 1.5, 1.8, 2.05, 2.2, 2.5] as const;
export const ROAD_SEGMENTS = Math.ceil((ROAD_END - ROAD_START) * pathLength() / 0.65);

function surfaceGeometry() {
  const builder = roadGeometryBuilder();
  const rows = Array.from({ length: ROAD_SEGMENTS + 1 }, (_, i) => {
    const t = ROAD_START + (ROAD_END - ROAD_START) * i / ROAD_SEGMENTS;
    const { point, right } = roadFrameAt(t);
    return ROAD_BANDS.map(offset => {
      const vertex = point.clone().addScaledVector(right, offset * roadWidthAt(t) / ROAD_WIDTH);
      vertex.y = worldHeight(vertex.x, vertex.z) + ROAD_LIFT;
      return vertex;
    });
  });
  for (let row = 0; row < ROAD_SEGMENTS; row++) {
    for (let band = 0; band < ROAD_BANDS.length - 1; band++) {
      const middle = Math.abs((ROAD_BANDS[band]! + ROAD_BANDS[band + 1]!) / 2);
      const pigment: PaletteKey = middle < 0.1 ? "laneYellow" : middle > 2.05 && middle < 2.2 ? "laneWhite" : "asphalt";
      const a = rows[row]![band]!, b = rows[row]![band + 1]!;
      const c = rows[row + 1]![band]!, d = rows[row + 1]![band + 1]!;
      const shade = pigment === "asphalt" ? 0.97 + roadRandomAt(a.x, a.z) * 0.03 : 1;
      builder.triangle(a, b, c, pigment, shade);
      builder.triangle(b, d, c, pigment, shade);
    }
  }
  return builder.finish();
}

/** Static coastal scenery; collider circles are quality-independent and physics-owned by the caller. */
export function createCoastRoad() {
  const group = new Group();
  group.name = "coast-road";
  const material = createRampMaterial(hex("laneWhite"));
  material.vertexColors = true;
  const surface = new Mesh(surfaceGeometry(), material);
  surface.name = "coast-asphalt-and-markings";
  surface.receiveShadow = true;
  const layout = createRoadLayout();
  const posts = createRoadInstances(layout.posts, false, material);
  const poles = createRoadInstances(layout.poles, true, material);
  const wires = createRoadWires(layout.poles);
  // Keep the module at four draws, including when the scene enables shadow maps.
  group.add(surface, posts, poles, wires);
  const triangles = surface.geometry.getAttribute("position").count / 3
    + posts.geometry.getAttribute("position").count / 3 * posts.count
    + poles.geometry.getAttribute("position").count / 3 * poles.count;
  let disposed = false;
  return {
    group,
    colliders: layout.colliders,
    layout,
    budget: Object.freeze({ drawCalls: 4, triangles }),
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of [surface, posts, poles, wires]) mesh.geometry.dispose();
      posts.dispose();
      poles.dispose();
      material.dispose();
      wires.material.dispose();
      group.clear();
    },
  };
}
