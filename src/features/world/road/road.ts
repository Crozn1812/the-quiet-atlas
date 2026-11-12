import { Group, Mesh } from "three";
import { hex } from "../art/palette";
import { pathLength } from "../layout/path";
import { createRampMaterial } from "../materials/ramp";
import { createSurfaceSampler } from "../terrain/height";
import { roadGeometryBuilder } from "./geometry";
import { drapeRoadTriangle } from "./drape";
import {
  createRoadLayout, ROAD_END, ROAD_LIFT, ROAD_START, roadFrameAt,
} from "./layout";
import { createRoadInstances, createRoadWires } from "./posts";
import { roadBandOffsetAt, roadSurfaceColorAt } from "./surface";

// Duplicate band boundaries to keep crisp paint in the same draw call as asphalt.
// Refine both terrain shoulders (the existing flat walking strip is only 3 m).
// Longitudinal cells are <= 0.8 m; shoulder cells are <= 0.35 m.
export const ROAD_BANDS = [-3.3, -3.05, -2.8, -2.5, -2.2, -2.1, -1.8, -1.55, -0.65, -0.06,
  0.06, 0.65, 1.55, 1.8, 2.1, 2.2, 2.5, 2.8, 3.05, 3.3] as const;
export const ROAD_CELL_LENGTH = .8;
export const ROAD_SEGMENTS = Math.ceil((ROAD_END - ROAD_START) * pathLength() / ROAD_CELL_LENGTH);
// Retain the established strip elsewhere; only the terminal needs exact cell clipping.
export const ROAD_TERMINAL_ROW = Math.floor(ROAD_SEGMENTS - 15 / ROAD_CELL_LENGTH);

export function* buildRoadSurface(): Generator<void, import("three").BufferGeometry> {
  const builder = roadGeometryBuilder();
  const surfaceHeight = createSurfaceSampler();
  const seam = roadFrameAt(ROAD_START + (ROAD_END - ROAD_START) * ROAD_TERMINAL_ROW / ROAD_SEGMENTS);
  // Ease away the old strip's clearance over 2 m; shared boundary vertices
  // retain their height, so the exact terminal mesh cannot open a seam.
  const preserveSeam = (p: import("three").Vector3) => Math.max(0, Math.min(1, 1 -
    (-(p.x - seam.point.x) * Math.sin(seam.yaw) - (p.z - seam.point.z) * Math.cos(seam.yaw)) / 2));
  const rows = [];
  for (let i = 0; i <= ROAD_SEGMENTS; i++) {
    yield;
    const t = ROAD_START + (ROAD_END - ROAD_START) * i / ROAD_SEGMENTS;
    const { point, right } = roadFrameAt(t);
    rows.push(ROAD_BANDS.map(offset => {
      const vertex = point.clone().addScaledVector(right, roadBandOffsetAt(offset, t));
      vertex.y = surfaceHeight(vertex.x, vertex.z) + ROAD_LIFT;
      return vertex;
    }));
  }
  // A narrow marking can straddle a terrain-cell diagonal. Raise only the
  // affected vertices enough to keep its interior above the walking surface.
  const lifts = rows.map(row => row.map(() => 0));
  const sample = rows[0]![0]!.clone();
  for (let row = 0; row < ROAD_SEGMENTS; row++) {
    yield;
    for (let band = 0; band < ROAD_BANDS.length - 1; band++) {
      const a = rows[row]![band]!, b = rows[row]![band + 1]!;
      const c = rows[row + 1]![band]!, d = rows[row + 1]![band + 1]!;
      let extra = 0;
      for (const [start, across, down] of [[a, b, c], [d, c, b]] as const) {
        for (let u = 0; u <= 8; u++) for (let v = 0; v <= 8 - u; v++) {
          sample.copy(start).multiplyScalar(1 - (u + v) / 8)
            .addScaledVector(across, u / 8).addScaledVector(down, v / 8);
          extra = Math.max(extra, surfaceHeight(sample.x, sample.z) + 0.025 - sample.y);
        }
      }
      for (const r of [row, row + 1]) for (const j of [band, band + 1]) {
        lifts[r]![j] = Math.max(lifts[r]![j]!, extra);
      }
    }
  }
  rows.forEach((row, r) => row.forEach((point, j) => { point.y += lifts[r]![j]!; }));
  for (let row = 0; row < ROAD_SEGMENTS; row++) {
    yield;
    const t = ROAD_START + (ROAD_END - ROAD_START) * row / ROAD_SEGMENTS;
    const nextT = ROAD_START + (ROAD_END - ROAD_START) * (row + 1) / ROAD_SEGMENTS;
    for (let band = 0; band < ROAD_BANDS.length - 1; band++) {
      const left = ROAD_BANDS[band]!, right = ROAD_BANDS[band + 1]!;
      const middle = (left + right) / 2;
      const a = rows[row]![band]!, b = rows[row]![band + 1]!;
      const c = rows[row + 1]![band]!, d = rows[row + 1]![band + 1]!;
      const ca = roadSurfaceColorAt(a.x, a.z, left, middle, t), cb = roadSurfaceColorAt(b.x, b.z, right, middle, t);
      const cc = roadSurfaceColorAt(c.x, c.z, left, middle, nextT), cd = roadSurfaceColorAt(d.x, d.z, right, middle, nextT);
      if (row >= ROAD_TERMINAL_ROW) {
        drapeRoadTriangle([a, b, c], [ca, cb, cc], surfaceHeight, ROAD_LIFT, builder.triangle, preserveSeam);
        drapeRoadTriangle([b, d, c], [cb, cd, cc], surfaceHeight, ROAD_LIFT, builder.triangle, preserveSeam);
      } else {
        builder.triangle(a, b, c, [ca, cb, cc]);
        builder.triangle(b, d, c, [cb, cd, cc]);
      }
    }
  }
  return builder.finish();
}

function surfaceGeometry() {
  const build = buildRoadSurface();
  let step = build.next();
  while (!step.done) step = build.next();
  return step.value;
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
