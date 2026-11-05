import {
  Box3, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, Mesh, Quaternion, TorusGeometry, Vector3,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColor, WORLD_DIRECTION } from "../art/direction";
import { createRampMaterial } from "../materials/ramp";
import { createPropMaterial } from "../props/materials";
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
  const wood: BufferGeometry[] = [], green: BufferGeometry[] = [];
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
    // A blank, split wooden shoulder reads as a trail marker without lettering.
    parts.push(ground(timber(0.15, tall ? 0.78 : 0.48, 0.10, -0.025)
      .rotateZ(Math.PI / 2).translate(x + (tall ? 0.38 : 0.24), tall ? 1.30 : 0.63, z + 0.16)));
    if (tall) parts.push(ground(beam(new Vector3(x, 2.24, z), new Vector3(x - 0.50, 2.24, z), 0.09)));
    addCollider(parts);
    wood.push(...parts.map(part => wash(part, phase)));
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

  // One quiet broken fence, parallel to the path. Ground every foot and rail on the terrain.
  const fence = [{ x: -6.4, z: 1.8 }, { x: 6.4, z: 1.8 }, { x: -6.4, z: -5.8 }]
    .find(({ x, z }) => Math.hypot(x - anchor.x, z - anchor.z) > 2.3 && safe(x, z, 0.35, 1.85));
  if (fence) {
    const { x, z } = fence;
    const parts = [-1.6, 1.6].map((offset, i) => ground(timber(0.23, 1.12 - i * 0.18, 0.23, i ? -0.06 : 0.03)
      .translate(x, 0, z + offset)));
    for (const y of [0.47, 0.88]) {
      parts.push(ground(beam(new Vector3(x, y, z - 1.6), new Vector3(x + 0.02, y - 0.10, z - 0.18), 0.14, 0.09)));
      parts.push(ground(beam(new Vector3(x, y - 0.16, z + 0.28), new Vector3(x - 0.03, y - 0.06, z + 1.6), 0.14, 0.09)));
    }
    // Fallen slat still rests on the ground, leaving the broken middle open.
    parts.push(ground(beam(new Vector3(x - 0.08, 0.08, z - 0.5), new Vector3(x + 0.18, 0.13, z + 0.65), 0.12, 0.08)));
    addCollider(parts);
    wood.push(...parts.map(part => wash(part, phase)));
    for (const offset of [-1.3, -0.85, 1.35]) {
      green.push(wash(ground(new IcosahedronGeometry(1, 0).scale(0.19, 0.10, 0.31)
        .translate(x, 0.78, z + offset)), phase));
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

  mesh(wood, createPropMaterial("wood"), "weathered-trail-timber");
  const moss = createRampMaterial(paletteColor({ base: "forestLight", mix: "paper", amount: 0.24,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  moss.vertexColors = true;
  mesh(green, moss, "moss-washes");

  const lantern = new Group();
  lantern.name = "storm-lantern-pivot";
  lantern.position.set(anchor.x - 0.44, context.heightAt(anchor.x, anchor.z) + 2.23, anchor.z);
  group.add(lantern);
  const metal = createRampMaterial(paletteColor({ base: "ink", mix: "forestDeep", amount: 0.22,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  metal.vertexColors = true;
  const frame = [
    new TorusGeometry(0.13, 0.018, 4, 10).translate(0, -0.13, 0),
    new CylinderGeometry(0.19, 0.22, 0.10, 6).translate(0, -0.37, 0),
    new CylinderGeometry(0.18, 0.16, 0.12, 6).translate(0, -0.73, 0),
    new CylinderGeometry(0.08, 0.17, 0.12, 6).translate(0, -0.29, 0),
    ...[-0.17, 0.17].map(x => beam(new Vector3(x, -0.38, 0), new Vector3(x, -0.70, 0), 0.025)),
  ];
  mesh(frame.map(part => wash(part, phase)), metal, "storm-lantern-frame", lantern);
  const light = createRampMaterial(paletteColor({ base: "dusk", mix: "paper", amount: 0.42,
    saturation: 1, brightness: 1 }), WORLD_DIRECTION.foliage.ramp);
  light.vertexColors = true;
  mesh([wash(new CylinderGeometry(0.115, 0.13, 0.30, 6).translate(0, -0.53, 0), phase)],
    light, "storm-lantern-warm-core", lantern);
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
