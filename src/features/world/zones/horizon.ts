import {
  Box3, BufferGeometry, CircleGeometry, Color, CylinderGeometry, Float32BufferAttribute,
  Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Ray, Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HORIZON_BENCH_COPY } from "../../../i18n/railing";
import { ZONE_IDS, type InteractionTarget } from "../../interaction/targets";
import { PALETTE } from "../art/palette";
import { ZONES } from "../layout/zones";
import { riverPointAt } from "../layout/river";
import { deferBakedBatch, type BakedBatchPart } from "../props/batched";
import type { PropAsset } from "../props/deferred";
import { createPropMaterial } from "../props/materials";
import { createRockGeometry } from "../props/rocks";
import { createBenchGeometry, createPlankGeometry, createPostGeometry } from "../props/wood";
import { HEIGHT } from "../scene";
import { PATH_WIDTH, TERRAIN_SEED, waterLevelAt } from "../terrain/height";
import { nearestPath } from "../terrain/samples";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory } from "./types";
import { createHorizonDressing } from "./horizon-dressing";
import { bindSetpieces } from "./setpiece-hr";

type Surface = "natural" | "paint" | "white" | "iron" | "lens";
type Point = readonly [number, number, number];
type Site = readonly [number, number];

function pigment(surface: Surface): MeshToonMaterial | MeshStandardMaterial {
  const material = createPropMaterial("paper");
  switch (surface) {
    // Kit geometry already carries linear-space palette pigments: avoid tinting twice.
    case "natural": material.color.setRGB(1, 1, 1); break;
    case "paint": material.color.set(PALETTE.cloud).lerp(new Color(PALETTE.rock), 0.22); break;
    case "white": material.color.set(PALETTE.paper); break;
    case "iron": material.color.set(PALETTE.rockDark).lerp(new Color(PALETTE.ink), 0.32); break;
    case "lens": material.color.set(PALETTE.seaDeep); break;
  }
  if (surface === "natural") return material;
  // Weathered painted housings, matte iron and dark glass respond to P1's IBL.
  // These manufactured surfaces retain their pigments without a stone/bark photo.
  const pbr = new MeshStandardMaterial({ color: material.color, vertexColors: true,
    roughness: surface === "lens" ? 0.48 : surface === "iron" ? 0.86 : 0.94,
    metalness: surface === "iron" ? 0.18 : 0 });
  material.dispose();
  return pbr;
}

/** Six-sided elliptical rings soften both ends of the nacelle (48 triangles). */
function nacelle(): BufferGeometry {
  const positions: number[] = [];
  const rings = [[-0.425, 0.52], [-0.31, 1], [0.28, 1], [0.425, 0.55]].map(([x, radius]) =>
    Array.from({ length: 6 }, (_, i) => {
      const angle = i * Math.PI / 3;
      return [x!, Math.cos(angle) * 0.18 * radius!, Math.sin(angle) * 0.21 * radius!];
    }));
  const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    triangle([-0.425, 0, 0], rings[0]![next]!, rings[0]![i]!);
    triangle([0.425, 0, 0], rings[3]![i]!, rings[3]![next]!);
    for (let j = 0; j < 3; j++) {
      const a = rings[j]![i]!, b = rings[j]![next]!, c = rings[j + 1]![next]!, d = rings[j + 1]![i]!;
      triangle(a, b, c); triangle(a, c, d);
    }
  }
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3));
}

/** Three closed airfoil sections: broad root, swept middle, fine tip; 20 triangles. */
function turbineBlade(): BufferGeometry {
  const positions: number[] = [];
  const rings = [[0.13, 0.105, 0.035, 0.32], [1.08, 0.125, 0.022, 0.17], [2.11, 0.025, 0.008, 0.035]]
    .map(([y, chord, thickness, twist]) => [[thickness!, 0], [0, chord!], [-thickness!, 0], [0, -chord!]]
      .map(([x, z]) => [x! * Math.cos(twist!) - z! * Math.sin(twist!), y!,
        x! * Math.sin(twist!) + z! * Math.cos(twist!) + y! * 0.055]));
  const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...c, ...b);
  triangle(rings[0]![0]!, rings[0]![2]!, rings[0]![1]!);
  triangle(rings[0]![0]!, rings[0]![3]!, rings[0]![2]!);
  triangle(rings[2]![0]!, rings[2]![1]!, rings[2]![2]!);
  triangle(rings[2]![0]!, rings[2]![2]!, rings[2]![3]!);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const a = rings[j]![i]!, b = rings[j]![next]!, c = rings[j + 1]![next]!, d = rings[j + 1]![i]!;
      triangle(a, b, c); triangle(a, c, d);
    }
  }
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3));
}

/** Two crossed, double-sided dry leaves; one tuft stays well below the grass budget. */
function dryGrass(seed: number): BufferGeometry {
  const positions: number[] = [], colors: number[] = [];
  const color = new Color(PALETTE.grassDry).lerp(new Color(PALETTE.sand), (seed >>> 0) % 7 / 18);
  for (let i = 0; i < 2; i++) {
    const angle = i * Math.PI / 2 + seed * 0.7, dx = Math.cos(angle), dz = Math.sin(angle);
    const a = [-dx * 0.035, -0.04, -dz * 0.035], b = [dx * 0.035, -0.04, dz * 0.035];
    const tip = [dx * 0.1, 0.19 + (seed >>> 0) % 5 * 0.025, dz * 0.1];
    positions.push(...a, ...b, ...tip, ...tip, ...b, ...a);
    for (let j = 0; j < 6; j++) colors.push(color.r, color.g, color.b);
  }
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3))
    .setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/** Four rings give each block a small bevel, with a subtly skewed silhouette. */
function block([width, height, depth]: Point, center: Point): BufferGeometry {
  const bevel = Math.min(width, height, depth) * 0.12;
  const positions: number[] = [];
  const rings = [0, 1, 1, 0].map((outer, ring) => {
    const w = width / 2 - (outer ? 0 : bevel), h = height / 2 - (outer ? 0 : bevel);
    const z = [-depth / 2, -depth / 2 + bevel, depth / 2 - bevel, depth / 2][ring]!;
    return [[-w, -h, z], [w, -h, z], [w - bevel * 0.2, h, z], [-w, h, z]];
  });
  const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c);
  triangle(rings[0]![0]!, rings[0]![2]!, rings[0]![1]!);
  triangle(rings[0]![0]!, rings[0]![3]!, rings[0]![2]!);
  triangle(rings[3]![0]!, rings[3]![1]!, rings[3]![2]!);
  triangle(rings[3]![0]!, rings[3]![2]!, rings[3]![3]!);
  for (let ring = 0; ring < 3; ring++) {
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      triangle(rings[ring]![side]!, rings[ring]![next]!, rings[ring + 1]![next]!);
      triangle(rings[ring]![side]!, rings[ring + 1]![next]!, rings[ring + 1]![side]!);
    }
  }
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3)).translate(...center);
}

/** Check the whole swept footprint, including its interior, before allocating scene resources. */
function dryFootprint(context: ZoneSceneContext, [x, z]: Site, rx: number, rz: number): boolean {
  const nx = Math.ceil(rx * 2 / 0.35), nz = Math.ceil(rz * 2 / 0.35);
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const px = x - rx + rx * 2 * i / nx, pz = z - rz + rz * 2 * j / nz;
      const y = context.heightAt(px, pz);
      if (Math.abs(px) <= PATH_CLEARANCE || context.onPath(px, pz) || context.underWater(px, pz)
        // Lead (B2-100): the zone radius is horizontal (streamed tiles must contain the zone); height is free.
        || !Number.isFinite(y) || Math.hypot(px, pz) > ZONE_BUDGET.radius) return false;
    }
  }
  return true;
}

function siteFor(context: ZoneSceneContext, sites: readonly Site[], rx: number, rz: number): Site {
  const site = sites.find(site => dryFootprint(context, site, rx, rz));
  if (!site) throw new RangeError("Horizon requires a dry, path-clear overlook and two distant turbine sites.");
  return site;
}

/** One merged mesh per pigment per pivot; the two moving rotors share the tower material. */
function builder(root: Group, context: ZoneSceneContext) {
  const batches = new Map<Group, Map<Surface, BufferGeometry[]>>();
  const baked = new Map<BufferGeometry, Omit<BakedBatchPart, "index">>();
  return {
    add(part: BufferGeometry, surface: Surface, parent = root, grounded = true, asset?: PropAsset, yaw = 0) {
      const geometry = part.index ? part.toNonIndexed() : part;
      if (geometry !== part) part.dispose();
      if (asset) {
        geometry.computeBoundingBox();
        baked.set(geometry, { asset, yaw, bounds: geometry.boundingBox!.clone() });
      }
      // All primitives use the same attributes before mergeGeometries.
      geometry.deleteAttribute("normal");
      geometry.deleteAttribute("uv");
      geometry.clearGroups();
      const vertices = geometry.getAttribute("position"), pigment = geometry.getAttribute("color"), colors: number[] = [];
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
        if (grounded) vertices.setY(i, y + context.heightAt(x, z));
        const wash = 0.96 + Math.sin(x * 17 + z * 23 + y * 5 + (context.seed >>> 0) % 997) * 0.025;
        colors.push(pigment ? pigment.getX(i) : wash, pigment ? pigment.getY(i) : wash, pigment ? pigment.getZ(i) : wash);
      }
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
      let surfaces = batches.get(parent);
      if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
      const parts = surfaces.get(surface) ?? [];
      parts.push(geometry);
      surfaces.set(surface, parts);
    },
    finish() {
      const geometries: BufferGeometry[] = [], materials = new Map<Surface, MeshToonMaterial | MeshStandardMaterial>();
      const releaseDetails: (() => void)[] = [];
      for (const [parent, surfaces] of batches) {
        for (const [surface, parts] of surfaces) {
          const geometry = mergeGeometries(parts)!;
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          geometries.push(geometry);
          let material = materials.get(surface);
          if (!material) { material = pigment(surface); materials.set(surface, material); }
          const mesh = new Mesh(geometry, material);
          mesh.name = `horizon-${surface}`;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          parent.add(mesh);
          releaseDetails.push(deferBakedBatch(mesh, parts, parts.flatMap((part, index) => {
            const entry = baked.get(part);
            return entry ? [{ ...entry, index }] : [];
          }), context.heightAt));
          parts.forEach(part => part.dispose());
        }
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        releaseDetails.forEach(release => release());
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        // The shared ramp texture belongs to the world, not this zone.
      };
    },
  };
}

export function horizonSites(context: ZoneSceneContext) {
  // Keep the viewer 2.05 m from the corridor edge, within E range even at ground level.
  const viewer = siteFor(context, [0, 2, -2, 4, -4].map(z => [4.65, z] as const), 0.6, 0.5);
  const bench = siteFor(context, [[6.4, viewer[1] - 3], [6.4, viewer[1] + 3]], 0.45, 1.15);
  const rail = siteFor(context, [[8.4, viewer[1] + 1], [8.4, viewer[1] - 1]], 0.2, 2);
  const turbines = [
    siteFor(context, [[19.5, 9.5], [18.5, 12], [21, 4]], 2.6, 2.6),
    siteFor(context, [[23, -7], [22, -11], [21, -14]], 2.6, 2.6),
  ] as const;
  return { viewer, bench, rail, turbines };
}

/** Resolve the Horizon bench interaction target and seated/standing frames in world space. */
export function resolveHorizonBench(height: (x: number, z: number) => number) {
  const layout = ZONES.find(zone => zone.id === "horizon")!;
  const yaw = Math.atan2(layout.lookDirection.x, layout.lookDirection.z);
  const anchor = new Vector3(layout.position.x, height(layout.position.x, layout.position.z), layout.position.z);
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const resolve = (side: number) => {
    const transform = new Matrix4().compose(anchor, rotation, new Vector3(side, 1, 1));
    const worldPoint = (x: number, z: number) => new Vector3(x, 0, z).applyMatrix4(transform);
    const { bench: [bx, bz] } = horizonSites({
      heightAt(x, z) { const p = worldPoint(x, z); return height(p.x, p.z) - anchor.y; },
      onPath(x, z) { const p = worldPoint(x, z); return Math.abs(x) <= PATH_CLEARANCE || nearestPath(p.x, p.z).distance <= PATH_WIDTH / 2; },
      underWater(x, z) { const p = worldPoint(x, z); return height(p.x, p.z) <= waterLevelAt(p.z); },
      seed: TERRAIN_SEED + ZONE_IDS.indexOf("horizon"),
    });
    const seatZ = bz - 0.2;
    const stand = worldPoint(bx - 0.85, seatZ);
    stand.y = height(stand.x, stand.z) + HEIGHT;
    const seat = worldPoint(bx + 0.02, seatZ);
    seat.y = height(seat.x, seat.z) + HEIGHT;
    // Look seaward at the current mouth, keeping the authored lateral framing.
    const forward = riverPointAt(1).add(new Vector3(-20, 0, 0)).sub(seat).setY(0).normalize();
    const along = new Vector3(layout.lookDirection.x, 0, layout.lookDirection.z).normalize();
    const target: InteractionTarget = {
      id: "horizon-bench", kind: "lookout", zoneId: "horizon", position: stand.clone(), reach: 1.4,
      label: { vi: HORIZON_BENCH_COPY.vi.label, en: HORIZON_BENCH_COPY.en.label },
    };
    return { target, stand, seat, forward, along };
  };
  try { return resolve(1); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return resolve(-1);
  }
}

/** The viewer and seat face local +X (seaward). No text, glow, or moving foreground props. */
export const createHorizonScene: ZoneSceneFactory = context => {
  const { viewer, bench, rail, turbines } = horizonSites(context);
  const group = new Group();
  group.name = "horizon-overlook";
  const build = builder(group, context), colliders: ZoneCollider[] = [], rotors: Group[] = [];
  const collider = ([x, z]: Site, size: Point, y = size[1] / 2) => {
    // Enclose terrain-warped props, including both ends on a slope.
    const heights = [-1, 1].flatMap(a => [-1, 1].map(b => context.heightAt(x + a * size[0] / 2, z + b * size[2] / 2)));
    const low = Math.min(...heights), high = Math.max(...heights);
    colliders.push({ center: new Vector3(x, y + (low + high) / 2, z),
      size: new Vector3(size[0], size[1] + high - low, size[2]) });
  };
  const cylinder = (top: number, bottom: number, height: number, center: Point, surface: Surface) =>
    build.add(new CylinderGeometry(top, bottom, height, 6).translate(...center), surface);
  const foundation = ([x, z]: Site, width: number, seed: number) => {
    const stone = createRockGeometry("stone", seed);
    const size = stone.boundingBox!.getSize(new Vector3());
    build.add(stone.scale(width / size.x, 0.14 / size.y, width / size.z).translate(x, -0.04, z), "natural");
  };

  // The host terrain supplies the grass; no flat pigment discs beneath the furniture.
  const [vx, vz] = viewer;
  foundation(viewer, 0.8, context.seed + 11);
  cylinder(0.105, 0.15, 1, [vx, 0.55, vz], "iron");
  build.add(block([0.25, 0.22, 0.48], [vx, 1.04, vz]), "iron");
  for (const dz of [-0.16, 0.16]) {
    build.add(new CylinderGeometry(0.14, 0.105, 0.55, 6).rotateZ(-Math.PI / 2)
      .translate(vx + 0.1, 1.25, vz + dz), "paint");
    build.add(new CylinderGeometry(0.075, 0.075, 0.12, 6).rotateZ(-Math.PI / 2)
      .translate(vx - 0.23, 1.25, vz + dz), "iron");
    build.add(new CircleGeometry(0.115, 6).rotateY(Math.PI / 2)
      .translate(vx + 0.377, 1.25, vz + dz), "lens");
  }
  collider(viewer, [1.05, 1.5, 0.75]);

  const [bx, bz] = bench;
  // Kit back is +Z: rotate its open -Z side to seaward +X; sink the feet 4 cm.
  build.add(createBenchGeometry(context.seed + 31).rotateY(-Math.PI / 2).translate(bx, -0.04, bz),
    "natural", group, true, "prop-bench", -Math.PI / 2);
  for (const [i, dz] of [-0.87, 0.88].entries()) {
    build.add(createRockGeometry("stone", context.seed + 71 + i).scale(0.45, 0.45, 0.45)
      .rotateY(i * 1.7).translate(bx + 0.21, -0.04, bz + dz), "natural", group, true,
    i ? "rock-large-2" : "rock-large-1", i * 1.7);
  }
  for (const [i, dz] of [-0.82, 0.08, 0.86].entries()) {
    build.add(dryGrass(context.seed + 91 + i).translate(bx - 0.32, 0, bz + dz), "natural");
  }
  // A small closed sketchbook rests on the seat: no lettering or extra material.
  build.add(block([0.18, 0.028, 0.24], [bx + 0.035, 0.452, bz + 0.35]), "white");
  collider(bench, [0.75, 0.6, 2.2]);
  const [rx, rz] = rail;
  const railParts: BufferGeometry[] = [];
  for (const [i, dz] of [-1.8, 0, 1.8].entries()) {
    railParts.push(createPostGeometry(1.12, context.seed + 101 + i).translate(rx, -0.04, rz + dz));
  }
  for (const [i, y] of [0.5, 0.98].entries()) {
    railParts.push(createPlankGeometry(3.8, context.seed + 111 + i).scale(1, 1, 0.5)
      .rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(rx, y, rz));
  }
  build.add(mergeGeometries(railParts)!, "natural", group, true, "prop-fence", Math.PI / 2);
  railParts.forEach(part => part.dispose());
  collider(rail, [0.3, 1.12, 4]);

  turbines.forEach(([x, z], index) => {
    const height = 7.2 - index * 0.6;
    foundation([x, z], 0.9, context.seed + 131 + index);
    cylinder(0.14, 0.28, height + 0.04, [x, height / 2 - 0.02, z], "white");
    // Rigid housing follows the same terrain anchor as its rotor, without terrain shearing.
    build.add(nacelle().translate(x, context.heightAt(x, z) + height, z), "white", group, false);
    const rotor = new Group();
    rotor.name = `horizon-rotor-${index}`;
    rotor.position.set(x + 0.49, context.heightAt(x, z) + height, z);
    rotor.rotation.x = index * 0.8 + ((context.seed >>> 0) % 31) * 0.025;
    group.add(rotor);
    rotors.push(rotor);
    build.add(new CylinderGeometry(0.09, 0.21, 0.22, 6).rotateZ(-Math.PI / 2), "white", rotor, false);
    for (let blade = 0; blade < 3; blade++) {
      build.add(turbineBlade().rotateX(blade * Math.PI * 2 / 3), "white", rotor, false);
    }
    collider([x, z], [0.62, height + 0.25, 0.62]);
  });
  const dispose = build.finish();
  const dressing = createHorizonDressing(context, { viewer, bench, rail }, colliders);
  if (dressing) group.add(dressing.mesh);
  // The target lies in the gap between the two tubes. Preserve click ownership after removing
  // the grass disc by picking the existing viewer collider, without an invisible mesh or draw.
  const viewerBody = group.getObjectByName("horizon-iron") as Mesh;
  const raycast = viewerBody.raycast.bind(viewerBody);
  const viewerBounds = new Box3().setFromCenterAndSize(colliders[0]!.center, colliders[0]!.size);
  const inverse = new Matrix4(), localRay = new Ray(), point = new Vector3();
  viewerBody.raycast = (raycaster, intersections) => {
    const before = intersections.length;
    raycast(raycaster, intersections);
    if (intersections.length > before) return;
    inverse.copy(viewerBody.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverse);
    if (!localRay.intersectBox(viewerBounds, point)) return;
    point.applyMatrix4(viewerBody.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(point);
    if (distance >= raycaster.near && distance <= raycaster.far) {
      intersections.push({ distance, point: point.clone(), object: viewerBody });
    }
  };
  // HR-FIX-SETPIECE A14: authored tower viewer and turbines replace only the render of these solids.
  const direct = (name: string) => group.children.filter((child): child is Mesh => child instanceof Mesh && child.name === name);
  const turbineBoxes = turbines.map(([x, z]) => new Box3().setFromCenterAndSize(
    new Vector3(x, context.heightAt(x, z) + 4, z), new Vector3(1.6, 14, 1.6)));
  const releaseSetpieces = bindSetpieces(group.getObjectByName("horizon-natural") as Mesh, {
    file: "horizon",
    hide: [
      ...["horizon-iron", "horizon-paint", "horizon-lens"].flatMap(name => direct(name).map(mesh => ({ mesh }))),
      ...direct("horizon-white").map(mesh => ({ mesh, boxes: turbineBoxes })),
      ...rotors.flatMap(rotor => rotor.children.filter((child): child is Mesh => child instanceof Mesh).map(mesh => ({ mesh }))),
    ],
    place(asset, add) {
      const model = asset.piece("viewer");
      model.position.set(vx, context.heightAt(vx, vz), vz);
      add(model);
      turbines.forEach(([x, z], index) => {
        const tower = asset.piece("turbine");
        tower.position.set(x, context.heightAt(x, z), z);
        tower.scale.y = (7.2 - index * 0.6) / 7.2;
        add(tower);
        add(asset.piece("rotor"), rotors[index]);
      });
    },
  });
  let disposed = false;
  return {
    zoneId: "horizon", group, colliders,
    interactable: {
      position: new Vector3(vx, context.heightAt(vx, vz) + 1.25, vz),
      label: { vi: "Ống nhòm nhìn ra biển", en: "Sea-facing viewer" },
    },
    update(dt, reducedMotion) {
      if (reducedMotion || disposed || !Number.isFinite(dt) || dt <= 0) return;
      rotors.forEach((rotor, index) => { rotor.rotation.x = (rotor.rotation.x + dt * (0.085 + index * 0.008)) % (Math.PI * 2); });
    },
    dispose() { if (!disposed) { disposed = true; releaseSetpieces(); dressing?.dispose(); dispose(); } },
  };
};
