import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three";
import type { InteractionTarget } from "../../interaction/targets";
import { RAILING_COPY } from "../../../i18n/railing";
import { hex } from "../art/palette";
import { pathLength } from "../layout/path";
import { ZONES } from "../layout/zones";
import { createRampMaterial } from "../materials/ramp";
import { HEIGHT } from "../scene";
import { roadBaseHeight, waterLevelAt, worldHeight } from "../terrain/height";
import { roadGeometryBuilder } from "./geometry";
import { ROAD_LIFT, roadFrameAt } from "./layout";

export const RAIL_HEIGHT = 1.15;
export const RAIL_DEPTH = .18;
export const RAIL_OFFSET = 3.65;
export interface RailBay { a: Vector3; b: Vector3; terminal: boolean }

/** Fixed gaps at zone access/pull-offs; bollards remain on their existing lattice. */
export function createRailingLayout() {
  const bays: RailBay[] = [];
  const length = pathLength();
  for (let s = .89 * length; s < length - 4; s += 3) {
    const points = [s, Math.min(s + 2.85, length - 4)].map(station => {
      const { point, right } = roadFrameAt(station / length);
      point.addScaledVector(right, RAIL_OFFSET);
      point.y = worldHeight(point.x, point.z);
      return point;
    });
    const [a, b] = points as [Vector3, Vector3];
    const mid = a.clone().lerp(b, .5);
    if (ZONES.some(zone => mid.distanceTo(new Vector3(zone.position.x, mid.y, zone.position.z)) < zone.radius + 3)
      || [a, mid, b].some(p => worldHeight(p.x, p.z) < waterLevelAt(p.z) + .1)) continue;
    bays.push({ a, b, terminal: false });
  }
  const { point, right } = roadFrameAt(1);
  // Entire 5 m carriageway plus both gravel shoulders. No taper at the barrier.
  for (let i = 0; i < 3; i++) {
    const at = (x: number) => {
      const p = point.clone().addScaledVector(right, x);
      p.y = roadBaseHeight(p.x, p.z) + ROAD_LIFT;
      return p;
    };
    bays.push({ a: at(-3.6 + i * 2.4), b: at(-1.2 + i * 2.4), terminal: true });
  }
  return bays;
}

function bayGeometry(variant: number) {
  const builder = roadGeometryBuilder();
  // A timber/steel coastal fence: matte grey double beams, white posts, tiny faded red bands.
  for (const y of [.65, RAIL_HEIGHT]) {
    builder.add(new BoxGeometry(1.015, .12, .12).translate(0, y - .06, 0), "rock");
  }
  builder.add(new BoxGeometry(.055, 1.18 + variant * .008, RAIL_DEPTH).translate(-.49, .59, 0), "laneWhite");
  builder.add(new BoxGeometry(.057, .09, RAIL_DEPTH + .002).translate(-.49, .94, 0), "vermilion");
  // Pale wash, using only locked palette pigments.
  const geometry = builder.finish();
  return geometry;
}

/** Standalone dressing module. Register colliders with BOTH physics and swept-box walking. */
export function createCoastRailing(protectedTargets: readonly InteractionTarget[] = []) {
  const layout = createRailingLayout();
  const group = new Group();
  group.name = "coast-railing";
  const material = createRampMaterial(hex("laneWhite"));
  material.vertexColors = true;
  const transform = new Object3D();
  const colliders = layout.map(({ a, b }) => {
    const center = a.clone().lerp(b, .5).add(new Vector3(0, .6, 0));
    return { center, size: new Vector3(Math.hypot(b.x - a.x, b.z - a.z) + .04, 1.2, RAIL_DEPTH),
      yaw: Math.atan2(-(b.z - a.z), b.x - a.x) };
  });
  const meshes = [0, 1, 2].map(variant => {
    const items = colliders.filter((_, i) => i % 3 === variant);
    const mesh = new InstancedMesh(bayGeometry(variant), material, items.length);
    mesh.name = `coast-railing-${variant}`;
    items.forEach(({ center, size, yaw }, i) => {
      transform.position.copy(center).add(new Vector3(0, -.6, 0));
      transform.rotation.set(0, yaw, 0);
      transform.scale.set(size.x, 1, 1);
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  });
  // A shallow gravel/earth bank meets the terminal deck and descends to the beach.
  // Stay above the existing terrain; no global height or zone foundation changes.
  const bankBuilder = roadGeometryBuilder();
  const end = roadFrameAt(1);
  const outward = new Vector3(-Math.sin(end.yaw), 0, -Math.cos(end.yaw));
  const bankPoint = (x: number, distance: number) => {
    const p = end.point.clone().addScaledVector(end.right, x).addScaledVector(outward, distance);
    const crest = roadBaseHeight(end.point.x, end.point.z) + ROAD_LIFT;
    p.y = Math.max(worldHeight(p.x, p.z) + .008, crest - distance * .07);
    return p;
  };
  for (let d = 0; d < 10; d++) for (let x = -3.6; x < 3.59; x += 1.2) {
    const a = bankPoint(x, d), b = bankPoint(x + 1.2, d);
    const c = bankPoint(x, d + 1), e = bankPoint(x + 1.2, d + 1);
    bankBuilder.triangle(a, c, b, "sand"); bankBuilder.triangle(b, c, e, "sand");
  }
  const bank = new Mesh(bankBuilder.finish(), material);
  bank.name = "terminal-coastal-bank";
  group.add(bank);
  // Match the world's existing zoneBoxes contract. These are registered, never scene-rendered.
  const collisionMaterial = new MeshBasicMaterial();
  const boxes = colliders.map(({ center, size, yaw }) => {
    const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z), collisionMaterial);
    mesh.name = "coast-railing-collider";
    mesh.position.copy(center); mesh.rotation.y = yaw; mesh.updateMatrixWorld(true);
    return mesh;
  });
  const { point, right, yaw } = roadFrameAt(1);
  const forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const candidates = [-2.85, 2.85, 0].map(offset => {
    const p = point.clone().addScaledVector(right, offset).addScaledVector(forward, -.45);
    p.y = roadBaseHeight(p.x, p.z) + ROAD_LIFT + HEIGHT;
    return p;
  });
  // Keep the entire lookout reach outside other interaction spheres, including streamed content.
  const position = candidates.find(p => protectedTargets.every(target =>
    p.distanceTo(new Vector3(target.position.x, target.position.y, target.position.z)) > (target.reach ?? 2.5) + .9));
  const target: InteractionTarget | undefined = position ? {
    id: "coast-lookout", kind: "lookout", zoneId: "last-postcard", position, reach: .9,
    label: { vi: RAILING_COPY.vi.label, en: RAILING_COPY.en.label },
  } : undefined;
  function placeLookout(targets: readonly InteractionTarget[]) {
    const safe = candidates.find(p => [...protectedTargets, ...targets].every(other =>
      p.distanceTo(new Vector3(other.position.x, other.position.y, other.position.z)) > (other.reach ?? 2.5) + .9));
    if (target && safe) Object.assign(target.position, safe);
  }
  let disposed = false;
  return { group, layout, colliders, boxes, placeLookout, cameraObstacles: meshes, target, forward,
    budget: { drawCalls: 4, trianglesPerBay: 48, triangles: layout.length * 48 + 120, assetBytes: 0 },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.dispose(); }
      for (const mesh of boxes) mesh.geometry.dispose();
      bank.geometry.dispose();
      collisionMaterial.dispose();
      material.dispose(); group.clear();
    },
  };
}
