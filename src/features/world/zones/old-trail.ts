import {
  Box3, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, Mesh, Quaternion, TorusGeometry, Vector3,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { createFern } from "../foliage/ground";
import { createPineCrown } from "../foliage/shapes";
import { createRampMaterial } from "../materials/ramp";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneFactory } from "./types";

/** Uneven, chamfered timber with a chipped shoulder; y = 0 is its foot. */
function timber(width: number, height: number, depth: number, lean = 0): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const outline = [[-0.38, -0.5], [0.37, -0.5], [0.5, -0.36], [0.5, 0.36],
    [0.36, 0.5], [-0.37, 0.5], [-0.5, 0.35], [-0.5, -0.36]];
  const bevel = Math.min(width, depth, height) * 0.12;
  for (let ring = 0; ring < 4; ring++) {
    const y = [0, bevel, height - bevel, height][ring]!;
    const inset = ring === 0 || ring === 3 ? 0.88 : 1;
    for (const [x, z] of outline) {
      positions.push(x! * width * inset + lean * y / height,
        y - (ring === 3 && x! > 0 ? bevel * 0.65 : 0), z! * depth * inset);
    }
  }
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < 8; i++) {
      const a = ring * 8 + i, b = ring * 8 + (i + 1) % 8;
      indices.push(a, a + 8, b, b, a + 8, b + 8);
    }
  }
  // Convex end caps, facing down/up respectively.
  for (let i = 1; i < 7; i++) indices.push(0, i, i + 1, 24, 24 + i + 1, 24 + i);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function beam(from: Vector3, to: Vector3, width: number, depth = width): BufferGeometry {
  const direction = to.clone().sub(from);
  return timber(width, direction.length(), depth)
    .applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()))
    .translate(from.x, from.y, from.z);
}

/** Only neutral pigment varies per vertex; hue belongs to the palette material. */
function wash(part: BufferGeometry, phase: number): BufferGeometry {
  const flat = part.index ? part.toNonIndexed() : part;
  if (flat !== part) part.dispose();
  flat.deleteAttribute("uv");
  const positions = flat.getAttribute("position");
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const value = 0.93 + 0.035 * Math.sin(positions.getX(i) * 41 + positions.getZ(i) * 67 + phase)
      + 0.015 * Math.sin(positions.getY(i) * 5 + phase);
    colors.push(value, value, value);
  }
  flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  return flat;
}

export const createOldTrailScene: ZoneSceneFactory = (context) => {
  const group = new Group();
  group.name = "old-trail";
  const phase = ((Math.imul(context.seed >>> 0, 1664525) + 1013904223) >>> 0) / 4294967296 * Math.PI * 2;
  const colliders: ZoneCollider[] = [];
  const wood: BufferGeometry[] = [], green: BufferGeometry[] = [], ink: BufferGeometry[] = [];
  const ownedGeometry: BufferGeometry[] = [];
  const ownedMaterials: MeshToonMaterial[] = [];

  // Check whole conservative footprints, including the lantern's small swept envelope.
  // Additional path bends and water masks are authoritative, even outside the straight corridor.
  function safe(x: number, z: number, halfX: number, halfZ: number): boolean {
    const nx = Math.ceil(halfX * 2 / 0.15), nz = Math.ceil(halfZ * 2 / 0.15);
    for (let ix = 0; ix <= nx; ix++) {
      for (let iz = 0; iz <= nz; iz++) {
        const px = x - halfX + ix / nx * halfX * 2;
        const pz = z - halfZ + iz / nz * halfZ * 2;
        const y = context.heightAt(px, pz);
        if (!Number.isFinite(y) || Math.abs(px) <= PATH_CLEARANCE || context.onPath(px, pz)
          || context.underWater(px, pz) || Math.hypot(px, y + 2.8, pz) > ZONE_BUDGET.radius) return false;
      }
    }
    return true;
  }

  const anchor = [4.8, -4.8, 5, -5].flatMap(x =>
    [0, -4, 4, -8, 8].map(z => ({ x, z }))).find(({ x, z }) => safe(x, z, 0.85, 0.5));
  if (!anchor) throw new RangeError("Old trail needs a dry marker footprint beside the path (2–6 m from its edge).");

  function ground(part: BufferGeometry): BufferGeometry {
    const positions = part.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) + context.heightAt(positions.getX(i), positions.getZ(i)));
    }
    return part;
  }

  function addCollider(parts: BufferGeometry[]) {
    const box = new Box3();
    for (const part of parts) {
      part.computeBoundingBox();
      box.union(part.boundingBox!);
    }
    colliders.push({ center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) });
  }

  function marker(x: number, z: number, tall: boolean) {
    const height = tall ? 2.35 : 0.92 + 0.08 * Math.sin(z + phase);
    const parts = [ground(timber(tall ? 0.28 : 0.24, height, 0.25, 0.035 * Math.sin(z + phase))
      .translate(x, 0, z))];
    // A close-fitting cap keeps every marker a plain post, with no projecting crossbar.
    parts.push(ground(timber(tall ? 0.34 : 0.30, 0.10, 0.31)
      .translate(x + 0.035 * Math.sin(z + phase), height - 0.02, z)));
    const foot = ground(timber(tall ? 0.29 : 0.25, 0.18, 0.26)
      .translate(x, 0, z));
    parts.push(foot);
    addCollider(parts);
    wood.push(...parts.slice(0, 2).map(part => wash(part, phase)));
    ink.push(wash(foot, phase));
    green.push(wash(ground(new IcosahedronGeometry(1, 0).scale(0.17, 0.07, 0.15)
      .translate(x + 0.03, height * 0.63, z - 0.05)), phase));
  }

  marker(anchor.x, anchor.z, true);
  for (const x of [-4.8, 4.8]) {
    for (const z of [-8, -4, 0, 4, 8]) {
      if (Math.hypot(x - anchor.x, z - anchor.z) < 1.8 || !safe(x, z, 0.6, 0.36)) continue;
      marker(x, z, false);
    }
  }

  // Enlarge the entire broken gate 1.5x around its foot, including the fallen slat and moss.
  const gateScale = 1.5;
  const fence = [{ x: -6.4, z: 1.8 }, { x: 6.4, z: 1.8 }, { x: -6.4, z: -5.8 }]
    .find(({ x, z }) => Math.hypot(x - anchor.x, z - anchor.z) > 2.3
      && safe(x, z, 0.35 * gateScale, 1.85 * gateScale));
  if (fence) {
    const { x, z } = fence;
    const place = (part: BufferGeometry) => ground(part.scale(gateScale, gateScale, gateScale).translate(x, 0, z));
    const parts = [-1.6, 1.6].map((offset, i) => place(timber(0.23, 1.12 - i * 0.18, 0.23, i ? -0.06 : 0.03)
      .translate(0, 0, offset)));
    for (const y of [0.47, 0.88]) {
      parts.push(place(beam(new Vector3(0, y, -1.6), new Vector3(0.02, y - 0.10, -0.18), 0.14, 0.09)));
      parts.push(place(beam(new Vector3(0, y - 0.16, 0.28), new Vector3(-0.03, y - 0.06, 1.6), 0.14, 0.09)));
    }
    // Fallen slat still rests on the ground, leaving the broken middle open.
    parts.push(place(beam(new Vector3(-0.08, 0.08, -0.5), new Vector3(0.18, 0.13, 0.65), 0.12, 0.08)));
    addCollider(parts);
    wood.push(...parts.map(part => wash(part, phase)));
    for (const offset of [-1.3, -0.85, 1.35]) {
      green.push(wash(place(new IcosahedronGeometry(1, 0).scale(0.19, 0.10, 0.31)
        .translate(0, 0.78, offset)), phase));
    }
  }

  function mesh(parts: BufferGeometry[], material: MeshToonMaterial, name: string, parent = group) {
    const geometry = mergeGeometries(parts, false)!;
    parts.forEach(part => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    ownedGeometry.push(geometry);
    if (!ownedMaterials.includes(material)) ownedMaterials.push(material);
    const object = new Mesh(geometry, material);
    object.name = name;
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  // Two small clusters beside the tall marker: 120 triangles, no new collider or draw call.
  for (const [dx, dz, scale] of [[0.4, 0.05, 0.4], [-0.45, -0.08, 0.34]]) {
    const x = anchor.x + dx!, z = anchor.z + dz!;
    if (!safe(x, z, 0.32, 0.31)) continue;
    green.push(wash(ground(createFern().scale(scale!, scale!, scale!).rotateY(phase + dx!)
      .translate(x, 0, z)), phase));
    green.push(wash(ground(new IcosahedronGeometry(1, 0).scale(0.22, 0.06, 0.19)
      .translate(x - dx! * 0.5, 0.065, z)), phase));
  }
  const timberMaterial = createRampMaterial(paletteColor({ base: "rockDark", mix: "forestDeep", amount: 0.45,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  timberMaterial.vertexColors = true;
  mesh(wood, timberMaterial, "weathered-trail-timber");
  const moss = createRampMaterial(paletteColor({ base: "grass", mix: "forestDeep", amount: 0.6,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  moss.vertexColors = true;
  mesh(green, moss, "moss-washes");

  const metal = createRampMaterial(paletteColor({ base: "rockDark", mix: "indigo", amount: 0.3,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  metal.vertexColors = true;
  // A single outward-leaning pine frames the edge without screening the interactable.
  const pine = [-9.5, 9.5].flatMap(x => [7, -7].map(z => ({ x, z })))
    .find(({ x, z }) => safe(x, z, 2.5, 2));
  if (pine) {
    const direction = Math.sign(pine.x);
    const trunk = ground(timber(0.36, 4.3, 0.32, direction * 0.8).translate(pine.x, 0, pine.z));
    const crown = ground(createPineCrown(context.seed).scale(0.85, 1, 0.85)
      .translate(0, 4.4, 0).rotateZ(-direction * 0.18).translate(pine.x, 0, pine.z));
    addCollider([trunk, crown]);
    ink.push(wash(trunk, phase));
    const jade = createRampMaterial(paletteColor({ base: "forestLight", mix: "forestDeep", amount: 0.15,
      saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
    jade.vertexColors = true;
    mesh([wash(crown, phase)], jade, "leaning-pine-jade-crown");
  }
  mesh(ink, timberMaterial, "ink-marker-feet-and-pine-trunk");

  const lantern = new Group();
  lantern.name = "storm-lantern-pivot";
  lantern.position.set(anchor.x - Math.sign(anchor.x) * 0.30, context.heightAt(anchor.x, anchor.z) + 2.35, anchor.z);
  group.add(lantern);
  const frame = [
    new TorusGeometry(0.13, 0.018, 4, 10).translate(0, -0.13, 0),
    new CylinderGeometry(0.19, 0.22, 0.10, 6).translate(0, -0.37, 0),
    new CylinderGeometry(0.18, 0.16, 0.12, 6).translate(0, -0.73, 0),
    new CylinderGeometry(0.08, 0.17, 0.12, 6).translate(0, -0.29, 0),
    ...[-0.17, 0.17].map(x => beam(new Vector3(x, -0.38, 0), new Vector3(x, -0.70, 0), 0.025)),
  ];
  mesh(frame.map(part => wash(part, phase)), metal, "storm-lantern-frame", lantern);
  const light = createRampMaterial(paletteColor({ base: "sunGold", mix: "dusk", amount: 0.25,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  light.vertexColors = true;
  mesh([wash(new CylinderGeometry(0.115, 0.13, 0.30, 6).translate(0, -0.53, 0), phase)],
    light, "storm-lantern-warm-core", lantern);
  const flower = createRampMaterial(paletteColor({ base: "flower", mix: "flower", amount: 0,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  flower.vertexColors = true;
  // One 0.12 m orange wick, visible through the path-facing side of the lantern.
  mesh([wash(new IcosahedronGeometry(0.06, 0).translate(-Math.sign(anchor.x) * 0.12, -0.53, 0), phase)],
    flower, "storm-lantern-flower-wick", lantern);
  // A conservative box encloses the lantern at the full ±0.035 rad sway.
  colliders.push({ center: lantern.position.clone().add(new Vector3(0, -0.39, 0)), size: new Vector3(0.52, 0.86, 0.48) });

  let elapsed = 0;
  let disposed = false;
  return {
    zoneId: "old-trail", group, colliders,
    interactable: {
      position: new Vector3(anchor.x, context.heightAt(anchor.x, anchor.z) + 1.25, anchor.z),
      label: { vi: "Cột mốc đường cũ", en: "Old trail marker" },
    },
    update(dt, reducedMotion) {
      if (disposed || reducedMotion || !Number.isFinite(dt) || dt <= 0) return;
      elapsed = (elapsed + dt) % (Math.PI * 2 / 0.65);
      lantern.rotation.z = Math.sin(elapsed * 0.65) * 0.035;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ownedGeometry.forEach(geometry => geometry.dispose());
      ownedMaterials.forEach(material => material.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
};
