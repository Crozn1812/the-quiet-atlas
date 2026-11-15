import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute,
  InstancedMesh, LineBasicMaterial, LineSegments, Object3D, Vector3, type MeshToonMaterial,
} from "three";
import { PALETTE } from "../art/palette";
import { roadGeometryBuilder } from "./geometry";
import type { RoadPost } from "./layout";

export const WIRE_OFFSETS = [-0.9, 0, 0.9] as const;
export const WIRE_HEIGHT = 0.972;
export const WIRE_SAG = 0.65;
export const WIRE_SEGMENTS = 24;

function bollardGeometry() {
  const builder = roadGeometryBuilder();
  // Octagonal body with a bevelled red cap; dimensions measured along the tilted shaft.
  const rings = [[0, 0.1], [0.68, 0.1], [0.87, 0.1], [0.9, 0.075]] as const;
  const sides=24;
  const point = (ring: number, side: number) => {
    const [y, radius] = rings[ring]!;
    return new Vector3(Math.cos(side * Math.PI*2 / sides) * radius, y, Math.sin(side * Math.PI*2 / sides) * radius);
  };
  for (let side = 0; side < sides; side++) {
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const color = ring === 0 ? "laneWhite" : "vermilion";
      builder.triangle(point(ring, side), point(ring + 1, side), point(ring, side + 1), color);
      builder.triangle(point(ring, side + 1), point(ring + 1, side), point(ring + 1, side + 1), color);
    }
    builder.triangle(new Vector3(), point(0, side), point(0, side + 1), "laneWhite");
    builder.triangle(new Vector3(0, 0.9, 0), point(3, side + 1), point(3, side), "vermilion");
  }
  return builder.finish();
}

function poleGeometry() {
  const builder = roadGeometryBuilder();
  // Metre-wide axes, unit height; instance scaling varies each pole between 7 and 8 m.
  builder.add(new CylinderGeometry(0.11, 0.17, 1, 8).translate(0, 0.5, 0), "rockDark", true);
  builder.add(new BoxGeometry(2.4, 0.025, 0.16).translate(0, 0.91, 0), "rockDark", true);
  for (const x of WIRE_OFFSETS) {
    builder.add(new CylinderGeometry(0.055, 0.065, 0.05, 6).translate(x, 0.947, 0), "rock");
  }
  return builder.finish();
}

export function createRoadInstances(items: readonly RoadPost[], utility: boolean, material: MeshToonMaterial) {
  const mesh = new InstancedMesh(utility ? poleGeometry() : bollardGeometry(), material, items.length);
  mesh.name = utility ? "coast-utility-poles" : "coast-bollards";
  const transform = new Object3D();
  items.forEach((item, index) => {
    transform.position.set(item.x, item.y, item.z);
    transform.rotation.set(0, item.yaw, item.lean);
    transform.scale.set(1, utility ? item.height : 1, 1);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

export function wireAnchor(pole: RoadPost, offset: number): Vector3 {
  return new Vector3(pole.x + Math.cos(pole.yaw) * offset,
    pole.y + pole.height * WIRE_HEIGHT, pole.z - Math.sin(pole.yaw) * offset);
}

/** Three thin, texture-free conductors; one draw call, zero triangles. */
export function createRoadWires(poles: readonly RoadPost[]) {
  const positions: number[] = [];
  for (let i = 1; i < poles.length; i++) {
    for (const offset of WIRE_OFFSETS) {
      const a = wireAnchor(poles[i - 1]!, offset), b = wireAnchor(poles[i]!, offset);
      const at = (t: number) => a.clone().lerp(b, t).add(new Vector3(0, -4 * WIRE_SAG * t * (1 - t), 0));
      for (let segment = 0; segment < WIRE_SEGMENTS; segment++) {
        positions.push(...at(segment / WIRE_SEGMENTS).toArray(), ...at((segment + 1) / WIRE_SEGMENTS).toArray());
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new LineSegments(geometry, new LineBasicMaterial({ color: PALETTE.ink }));
  mesh.name = "coast-utility-wires";
  return mesh;
}
