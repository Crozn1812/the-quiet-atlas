import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bindHrStructure } from "../props/hr-structures";
import { bindFasteners } from "../props/fasteners";
import type { InteractionTarget } from "../../interaction/targets";
import { RAILING_COPY } from "../../../i18n/railing";
import { hex } from "../art/palette";
import { pathLength } from "../layout/path";
import { ZONES } from "../layout/zones";
import { createRampMaterial } from "../materials/ramp";
import { HEIGHT } from "../scene";
import { surfaceHeight, waterLevelAt } from "../terrain/height";
import { roadGeometryBuilder } from "./geometry";
import { ROAD_LIFT, roadFrameAt } from "./layout";

export const RAIL_HEIGHT = 1.15;
export const RAIL_DEPTH = .18;
export const RAIL_OFFSET = 3.6;
export interface RailBay { a: Vector3; b: Vector3; terminal: boolean }

/** Fixed gaps at zone access/pull-offs; bollards remain on their existing lattice. */
export function createRailingLayout() {
  const bays: RailBay[] = [];
  const length = pathLength();
  const { point, right } = roadFrameAt(1);
  const terminalHeight = Math.max(...[-3.6, -1.2, 1.2, 3.6].map(x =>
    surfaceHeight(point.x + right.x * x, point.z + right.z * x))) + ROAD_LIFT;
  for (let s = .89 * length; s < length; s += 3) {
    const points = [s, Math.min(s + 3, length)].map(station => {
      const { point, right } = roadFrameAt(station / length);
      point.addScaledVector(right, RAIL_OFFSET);
      const ground = surfaceHeight(point.x, point.z) + ROAD_LIFT;
      const blend = Math.max(0, 1 - (length - station) / 9);
      point.y = ground + (terminalHeight - ground) * blend;
      return point;
    });
    const [a, b] = points as [Vector3, Vector3];
    const mid = a.clone().lerp(b, .5);
    const terminalApproach = s > length - 28;
    if ((!terminalApproach && ZONES.some(zone => mid.distanceTo(new Vector3(zone.position.x, mid.y, zone.position.z)) < zone.radius + 3))
      || [a, mid, b].some(p => surfaceHeight(p.x, p.z) < waterLevelAt(p.z) + .1)) continue;
    bays.push({ a, b, terminal: false });
  }
  // Entire 5 m carriageway plus both gravel shoulders. No taper at the barrier.
  for (let i = 0; i < 3; i++) {
    const at = (x: number) => {
      const p = point.clone().addScaledVector(right, x);
      p.y = terminalHeight;
      return p;
    };
    bays.push({ a: at(-3.6 + i * 2.4), b: at(-1.2 + i * 2.4), terminal: true });
  }
  return bays;
}

function bayGeometry() {
  const builder = roadGeometryBuilder();
  // A timber/steel coastal fence: matte grey double beams, white posts, tiny faded red bands.
  for (const y of [.65, RAIL_HEIGHT]) {
    builder.add(new RoundedBoxGeometry(1.015, .12, .12, 2, .018).translate(0, y - .06, 0), "rock");
  }
  builder.add(new RoundedBoxGeometry(.055, 1.18, RAIL_DEPTH, 2, .014).translate(-.5, .59, 0), "laneWhite");
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
  const shear = new Matrix4();
  const colliders = layout.map(({ a, b }) => {
    const center = a.clone().lerp(b, .5).add(new Vector3(0, .6, 0));
    return { center, size: new Vector3(Math.hypot(b.x - a.x, b.z - a.z) + .04, 1.2, RAIL_DEPTH),
      yaw: Math.atan2(-(b.z - a.z), b.x - a.x), rise: b.y - a.y };
  });
  const meshes = [0, 1, 2].map(variant => {
    const items = colliders.filter((_, i) => i % 3 === variant);
    const mesh = new InstancedMesh(bayGeometry(), material, items.length);
    mesh.name = `coast-railing-${variant}`;
    items.forEach(({ center, size, yaw, rise }, i) => {
      transform.position.copy(center).add(new Vector3(0, -.6, 0));
      transform.rotation.set(0, yaw, 0);
      transform.scale.set(size.x, 1, 1);
      transform.updateMatrix();
      shear.identity();
      shear.elements[1] = rise;
      mesh.setMatrixAt(i, transform.matrix.multiply(shear));
    });
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  });
  const releases=meshes.flatMap(mesh=>{
    const bolts=[.59,1.09].flatMap(y=>[-1,1].map(side=>new CylinderGeometry(.009,.01,.012,12).rotateX(Math.PI/2).translate(-.495,y,side*.069)));
    const geometry=mergeGeometries(bolts)!;bolts.forEach(g=>g.dispose());
    return [bindHrStructure(mesh,false,true),bindFasteners(mesh,geometry)];
  });
  // A shallow gravel/earth bank meets the terminal deck and descends to the beach.
  // Stay above the existing terrain; no global height or zone foundation changes.
  const bankBuilder = roadGeometryBuilder();
  const end = roadFrameAt(1);
  const outward = new Vector3(-Math.sin(end.yaw), 0, -Math.cos(end.yaw));
  const bankPoint = (x: number, distance: number) => {
    const p = end.point.clone().addScaledVector(end.right, x).addScaledVector(outward, distance);
    p.y = surfaceHeight(p.x, p.z) + .008;
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
    const p = point.clone().addScaledVector(right, offset).addScaledVector(forward, -.85);
    p.y = surfaceHeight(p.x, p.z) + ROAD_LIFT + HEIGHT;
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
    budget: { drawCalls: 4, trianglesPerBay: meshes[0]!.geometry.getAttribute("position").count/3,
      triangles: meshes.reduce((n,m)=>n+m.geometry.getAttribute("position").count/3*m.count,0)+120, assetBytes: 0 },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      releases.reverse().forEach(release=>release());
      for (const mesh of meshes) { mesh.geometry.dispose(); mesh.dispose(); }
      for (const mesh of boxes) mesh.geometry.dispose();
      bank.geometry.dispose();
      collisionMaterial.dispose();
      material.dispose(); group.clear();
    },
  };
}
