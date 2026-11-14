import { Box3, BufferGeometry, CircleGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, Vector3, type Intersection, type Raycaster } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { riverPointAt, riverTangentAt } from "../layout/river";
import { createRampMaterial } from "../materials/ramp";
import { createCliffRockGeometry, createCliffRibbon } from "../zones/first-light-cliff";
import { surfaceHeight, waterLevelAt } from "./height";
import { createWaterMaterial } from "../water/material";
import { createWaterSurface } from "../water/surface";
import { setDawnCliffBounds } from "../post/dawn-shafts";
import { nearestPath } from "./samples";

const obstacleCache = new WeakMap<Mesh, Map<string, Box3[]>>();

/** The mountain spans the horizon; its enclosing box must not block the open outlet.
 * Vehicle sweeps use the same separate inscribed solids as Rapier instead. */
export function springObstacleBounds(mesh: Mesh, radius: number, halfPlayerHeight: number): Box3[] | undefined {
  const solids = mesh.userData.springSolids as { center: Vector3; radius: number; halfHeight: number }[] | undefined;
  if (!solids) return;
  let cache = obstacleCache.get(mesh);
  if (!cache) { cache = new Map(); obstacleCache.set(mesh, cache); }
  const key = `${radius}:${halfPlayerHeight}`;
  let bounds = cache.get(key);
  if (!bounds) {
    bounds = solids.map(solid => {
      const box = new Box3().setFromCenterAndSize(solid.center,
        new Vector3(solid.radius * 2, solid.halfHeight * 2, solid.radius * 2));
      box.min.add(new Vector3(-radius, -halfPlayerHeight * 2, -radius));
      box.max.add(new Vector3(radius, -0.1, radius));
      return box;
    });
    cache.set(key, bounds);
  }
  return bounds;
}

/** World-space spring: fractured, buried shoulders frame an open wet cleft.
 * Static geometry only; the existing river owns downstream animation. */
export function createSpring() {
  const group = new Group();
  group.name = "first-light-spring";
  const origin = riverPointAt(0), forward = riverTangentAt(0);
  const right = new Vector3(-forward.z, 0, forward.x);
  const level = waterLevelAt(origin.z);
  const colliders: { center: Vector3; radius: number; halfHeight: number }[] = [];
  const lightBlockers: Box3[] = [];
  // The ridge runs across the opening view instead of continuing upstream
  // outside its left edge. Its apron joins the outlet, with no freestanding rock.
  const ridgeRight = new Vector3(9, 0, -7).normalize();
  const ridgeBack = new Vector3(-7, 0, -9).normalize();
  const pieces: { center: Vector3; width: number; height: number; depth: number; yaw: number; solid: boolean; talus: boolean }[] = [];
  const add = (center: Vector3, base: number, width: number, height: number, depth: number, yaw: number, solid = true, talus = false) => {
    if (talus && !solid && nearestPath(center.x, center.z).distance < Math.max(width, depth) / 2 + 3) return;
    center.y = level + base;
    pieces.push({ center, width, height, depth, yaw, solid, talus });
  };
  const ridgeYaw = Math.atan2(-ridgeRight.z, ridgeRight.x);
  // Two irregular buttresses join the rear face to the existing waterfall.
  // Their buried feet form an open cleft, rather than a cap/stack over the water.
  for (const side of [-1, 1]) add(origin.clone().addScaledVector(right, side * 2.4).addScaledVector(forward, -3.5),
    -0.6, 2.8, side < 0 ? 1.1 : 1.4, 3.8, Math.atan2(-right.z, right.x), true, true);
  for (const [i, across] of [-27, -10, 7, 24, 41].entries()) {
    const center = origin.clone().addScaledVector(ridgeRight, across).addScaledVector(ridgeBack, 33 + Math.sin(i * 1.7) * 2);
    add(center, -0.8, 23, [28, 35, 39, 34, 27][i]!, 19, ridgeYaw);
  }
  for (const [i, [side, along, width, height, depth]] of [
    [-3.1, 2.7, 1.8, 1.1, 1.5], [-4.6, 4.9, 2.5, 1.7, 2],
    [-5.6, 1.5, 2.2, 1.3, 1.7], [-7.1, 5.1, 2.8, 1.9, 2.3],
    [-8, 2.5, 3.1, 1.8, 2.4],
  ].entries()) add(origin.clone().addScaledVector(right, side!).addScaledVector(forward, along!),
    -0.35, width!, height!, depth!, i * 1.93, false, true);
  const geometries = pieces.map(({ center, width, height, depth, yaw, solid, talus }, i) => {
    const geometry = createCliffRockGeometry(802 + i, talus);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const size = bounds.getSize(new Vector3());
    geometry.translate(0, -bounds.min.y, 0).scale(width / size.x, height / size.y, depth / size.z);
    const positions = geometry.getAttribute("position");
    for (let v = 0; v < positions.count; v++) {
      positions.setX(v, positions.getX(v) + positions.getY(v) * (i % 2 ? -0.06 : 0.08));
      positions.setZ(v, positions.getZ(v) + positions.getY(v) * 0.12);
    }
    geometry.computeVertexNormals();
    // Retain continuous bedding/runoff pigments across triangle boundaries.
    geometry.rotateY(yaw).translate(center.x, center.y, center.z);
    if (talus) {
      // Conform the bottom ring to the actual rendered terrain, burying it by
      // 30 cm. Upper fracture faces stay rigid; no visible underside can open.
      for (let v = 0; v < positions.count; v++) {
        const rise = positions.getY(v) - center.y;
        const foot = Math.max(level - 0.7, surfaceHeight(positions.getX(v), positions.getZ(v))) - 0.3;
        positions.setY(v, positions.getY(v) + Math.max(0, foot - center.y) * Math.max(0, 1 - rise / height));
      }
      geometry.computeVertexNormals();
    }
    // Inscribed cylinders leave the visible cleft open and avoid invisible walls on the route.
    if (solid) colliders.push({ center: center.clone().add(new Vector3(0, height / 2, 0)),
      radius: Math.min(width, depth) * 0.38, halfHeight: height / 2 });
    if (solid) { geometry.computeBoundingBox(); lightBlockers.push(geometry.boundingBox!.clone()); }
    return geometry;
  });
  // A continuous fractured face curls from the rear wall to the wet cleft.
  // Unlike scaled slabs, this has a narrow crest and no broad horizontal cap.
  const front = [[-1.7, 3.7, 3.2], [-4, 1, 4.1], [-7, -3, 6.2],
    [-10, -8, 8.3], [-16, -15, 12], [-19, -23, 16]].map(([x, z, height], i) => {
    const base = new Vector3(origin.x + x!, 0, origin.z + z!);
    base.y = surfaceHeight(base.x, base.z) - 0.4;
    const top = base.clone().add(new Vector3(Math.sin(i * 2.3) * 0.45, height!, 0));
    const back = base.clone().add(new Vector3(-2.7, 0, 1.7));
    back.y = surfaceHeight(back.x, back.z) - 0.4;
    const backTop = top.clone().add(new Vector3(-2.3, -0.15 + Math.sin(i) * 0.3, 1.5));
    return { base, top, back, backTop };
  });
  for (let i = 0; i < front.length - 1; i++) {
    const a = front[i]!, b = front[i + 1]!;
    // Retain the authored collision envelopes and conservative light blockers.
    const middle = a.base.clone().add(b.top).multiplyScalar(0.5).add(new Vector3(0.45, 0, 0.3));
    const bounds = new Box3().setFromPoints([a.base, a.top, a.back, a.backTop, b.base, b.top, b.back, b.backTop, middle]);
    // Use three inscribed solids; the complete face still masks the light.
    if (i % 2 === 0) colliders.push({ center: bounds.getCenter(new Vector3()), radius: 1.2,
      halfHeight: bounds.getSize(new Vector3()).y / 2 });
    lightBlockers.push(bounds);
  }
  const foot = createCliffRibbon(front);
  geometries.push(foot);
  const rockGeometry = mergeGeometries(geometries)!;
  const rockMaterial = createRampMaterial(0xffffff);
  rockMaterial.vertexColors = true;
  const cliff = new Mesh(rockGeometry, rockMaterial);
  cliff.name = "spring-mossy-cliff";
  cliff.userData.springSolids = colliders;
  cliff.castShadow = cliff.receiveShadow = true;
  setDawnCliffBounds(lightBlockers);
  group.add(cliff);
  const poolGeometry = new CircleGeometry(2.2, 12).rotateX(-Math.PI / 2);
  const rim = poolGeometry.getAttribute("position");
  for (let i = 1; i < rim.count; i++) {
    const factor = 1 + 0.09 * Math.sin(i * 2.4);
    rim.setXYZ(i, rim.getX(i) * factor, rim.getY(i), rim.getZ(i) * factor * 0.86);
  }
  poolGeometry.translate(origin.x, level + 0.01, origin.z);
  const poolSurface = createWaterSurface(poolGeometry, createWaterMaterial("Balanced"));
  const pool = poolSurface.mesh;
  pool.name = "spring-cleft-pool";
  group.add(pool);
  // A short falling sheet emerges from beneath the cap, meeting the pool
  // before the animated ribbon takes over. Its lower end is submerged.
  const vertices: number[] = [];
  const rows = [[-2.6, 1.65], [-2.15, 1.5], [-1.7, 0.8], [-1.2, 0.15], [-0.4, -0.04]];
  const indices: number[] = [], uvs: number[] = [];
  for (const [row, [along, rise]] of rows.entries()) {
    for (const side of [-1, 1]) {
      const width = 0.38 + row * 0.09;
      const p = origin.clone().addScaledVector(forward, along!).addScaledVector(right, side * width);
      vertices.push(p.x, level + rise!, p.z);
      uvs.push((side + 1) / 2, row * 0.6);
      vertices.push(p.x, level + rise! - 0.18, p.z);
      uvs.push((side + 1) / 2, row * 0.6);
    }
    if (row) {
      const a = (row - 1) * 4, b = row * 4;
      indices.push(a, a + 2, b, a + 2, b + 2, b,
        a + 1, a, b + 1, a, b, b + 1,
        a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    }
  }
  const fallGeometry = new BufferGeometry();
  fallGeometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  fallGeometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  fallGeometry.setIndex(indices);
  fallGeometry.computeVertexNormals();
  const fallSurface = createWaterSurface(fallGeometry, createWaterMaterial("Balanced"));
  const fall = fallSurface.mesh;
  fall.name = "spring-cleft-flow";
  group.add(fall);
  const foamGeometry = new IcosahedronGeometry(1, 0);
  const foamMaterial = createRampMaterial(new Color(PALETTE.mist).getHex());
  const foamParts: BufferGeometry[] = [], pebbleParts: BufferGeometry[] = [];
  for (let i = 0; i < 18; i++) {
    const foam = i < 7;
    const mesh = new Mesh(foamGeometry, foam ? foamMaterial : rockMaterial);
    const angle = i * 2.4, radius = 2.2 + 0.15 * Math.sin(i);
    mesh.position.copy(origin).addScaledVector(right, foam ? (i - 3) * 0.21 : Math.cos(angle) * radius)
      .addScaledVector(forward, foam ? -1 + 0.2 * Math.sin(i) : Math.sin(angle) * radius * 0.86);
    mesh.position.y = level + (foam ? 0.045 : -0.06);
    mesh.scale.set(foam ? 0.24 : 0.4, foam ? 0.07 : 0.24, foam ? 0.3 : 0.38);
    mesh.updateMatrix();
    (foam ? foamParts : pebbleParts).push(foamGeometry.clone().applyMatrix4(mesh.matrix));
  }
  const foamMerged = mergeGeometries(foamParts)!, pebbleMerged = mergeGeometries(pebbleParts)!;
  [...foamParts, ...pebbleParts].forEach(part => part.dispose());
  // Pebbles share the cliff's vertex-colour draw: the complete source stays
  // within four draws, including both water surfaces and the pale foam.
  pebbleMerged.deleteAttribute("uv");
  const pebbleColor = new Color(PALETTE.rock), pigments: number[] = [];
  for (let i = 0; i < pebbleMerged.getAttribute("position").count; i++) pigments.push(pebbleColor.r, pebbleColor.g, pebbleColor.b);
  pebbleMerged.setAttribute("color", new Float32BufferAttribute(pigments, 3));
  const solidGeometry = mergeGeometries([rockGeometry, pebbleMerged])!;
  cliff.geometry = solidGeometry;
  // The horizon-wide merged bound overlaps the camera ray even at the open
  // outlet. Keep the exact triangles, but reject each static rock separately
  // before Mesh.raycast traverses its faces. These proxies never enter the scene.
  let faceOffset = 0;
  const pickParts = [...geometries, pebbleMerged].map(geometry => {
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, rockMaterial);
    mesh.matrixAutoUpdate = false;
    const offset = faceOffset;
    faceOffset += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
    return { mesh, offset };
  });
  cliff.raycast = (raycaster: Raycaster, intersections: Intersection[]) => {
    for (const part of pickParts) {
      part.mesh.matrixWorld.copy(cliff.matrixWorld);
      part.mesh.material = cliff.material;
      const start = intersections.length;
      part.mesh.raycast(raycaster, intersections);
      for (let i = start; i < intersections.length; i++) {
        const hit = intersections[i]!;
        hit.object = cliff;
        if (hit.faceIndex != null) hit.faceIndex += part.offset;
        if (hit.face) {
          hit.face.a += part.offset * 3;
          hit.face.b += part.offset * 3;
          hit.face.c += part.offset * 3;
        }
      }
    }
  };
  group.add(new Mesh(foamMerged, foamMaterial));
  const surfaces = [poolSurface, fallSurface];
  let disposed = false;
  return { group, cliff, colliders, origin, surfaces,
    dispose() {
      if (disposed) return;
      disposed = true;
      rockGeometry.dispose(); rockMaterial.dispose(); surfaces.forEach(surface => surface.dispose());
      geometries.forEach(geometry => geometry.dispose());
      foamGeometry.dispose(); foamMerged.dispose(); pebbleMerged.dispose(); solidGeometry.dispose(); foamMaterial.dispose();
      group.removeFromParent(); group.clear();
    },
  };
}
