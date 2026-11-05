import {
  BufferGeometry, CircleGeometry, Color, CylinderGeometry, Float32BufferAttribute,
  Group, Mesh, Vector3, type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createPropMaterial } from "../props/materials";
import { PATH_CLEARANCE, ZONE_BUDGET, type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory } from "./types";

type Surface = "grass" | "stone" | "wood" | "paper" | "iron" | "lens";
type Point = readonly [number, number, number];
type Site = readonly [number, number];

function pigment(surface: Surface): MeshToonMaterial {
  const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
  switch (surface) {
    case "grass": material.color.set(PALETTE.forestLight).lerp(new Color(PALETTE.mist), 0.18); break;
    case "stone": material.color.set(PALETTE.mist).lerp(new Color(PALETTE.ink), 0.14); break;
    case "paper": material.color.set(PALETTE.paper).lerp(new Color(PALETTE.mist), 0.14); break;
    case "iron": material.color.set(PALETTE.ink).lerp(new Color(PALETTE.mist), 0.32); break;
    case "lens": material.color.set(PALETTE.indigo).lerp(new Color(PALETTE.water), 0.35); break;
  }
  return material;
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
function dryFootprint(context: ZoneSceneContext, [x, z]: Site, rx: number, rz: number, _top = 0): boolean {
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

function siteFor(context: ZoneSceneContext, sites: readonly Site[], rx: number, rz: number, top: number): Site {
  const site = sites.find(site => dryFootprint(context, site, rx, rz, top));
  if (!site) throw new RangeError("Horizon requires a dry, path-clear overlook and two distant turbine sites.");
  return site;
}

/** Terrain-following grass washes; the host terrain supplies the promontory and sea. */
function grassPatch([x, z]: Site, rx: number, rz: number, seed: number): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < 12; i++) {
    const point = (n: number): Point => {
      const angle = n * Math.PI / 6;
      const wobble = 0.94 + Math.sin(n * 2.1 + (seed >>> 0) % 997) * 0.06;
      return [x + Math.cos(angle) * rx * wobble, 0.025, z + Math.sin(angle) * rz * wobble];
    };
    positions.push(x, 0.025, z, ...point(i + 1), ...point(i));
  }
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3));
}

/** One merged mesh per pigment per pivot; the two moving rotors share the tower material. */
function builder(root: Group, context: ZoneSceneContext) {
  const batches = new Map<Group, Map<Surface, BufferGeometry[]>>();
  return {
    add(part: BufferGeometry, surface: Surface, parent = root, grounded = true) {
      const geometry = part.index ? part.toNonIndexed() : part;
      if (geometry !== part) part.dispose();
      // All primitives use the same attributes before mergeGeometries.
      geometry.deleteAttribute("normal");
      geometry.deleteAttribute("uv");
      geometry.clearGroups();
      const vertices = geometry.getAttribute("position"), colors: number[] = [];
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
        if (grounded) vertices.setY(i, y + context.heightAt(x, z));
        const wash = 0.96 + Math.sin(x * 17 + z * 23 + y * 5 + (context.seed >>> 0) % 997) * 0.025;
        colors.push(wash, wash, wash);
      }
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
      let surfaces = batches.get(parent);
      if (!surfaces) { surfaces = new Map(); batches.set(parent, surfaces); }
      const parts = surfaces.get(surface) ?? [];
      parts.push(geometry);
      surfaces.set(surface, parts);
    },
    finish() {
      const geometries: BufferGeometry[] = [], materials = new Map<Surface, MeshToonMaterial>();
      for (const [parent, surfaces] of batches) {
        for (const [surface, parts] of surfaces) {
          const geometry = mergeGeometries(parts)!;
          parts.forEach(part => part.dispose());
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          geometries.push(geometry);
          let material = materials.get(surface);
          if (!material) { material = pigment(surface); materials.set(surface, material); }
          const mesh = new Mesh(geometry, material);
          mesh.name = `horizon-${surface}`;
          mesh.castShadow = surface !== "grass";
          mesh.receiveShadow = true;
          parent.add(mesh);
        }
      }
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        // The shared ramp texture belongs to the world, not this zone.
      };
    },
  };
}

/** The viewer and seat face local +X (seaward). No text, glow, or moving foreground props. */
export const createHorizonScene: ZoneSceneFactory = context => {
  // Keep the viewer 2.05 m from the corridor edge, within E range even at ground level.
  const viewer = siteFor(context, [0, 2, -2, 4, -4].map(z => [4.65, z] as const), 0.6, 0.5, 1.6);
  const bench = siteFor(context, [[6.4, viewer[1] - 3], [6.4, viewer[1] + 3]], 0.45, 1.15, 0.6);
  const rail = siteFor(context, [[8.4, viewer[1] + 1], [8.4, viewer[1] - 1]], 0.2, 2, 1.15);
  const turbines = [
    siteFor(context, [[19.5, 9.5], [18.5, 12], [21, 4]], 2.6, 2.6, 9.5),
    siteFor(context, [[23, -7], [22, -11], [21, -14]], 2.6, 2.6, 9),
  ];
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
    build.add(new CylinderGeometry(top, bottom, height, 7).translate(...center), surface);

  const terrace: Site = [6.5, viewer[1]];
  if (dryFootprint(context, terrace, 3.2, 5)) build.add(grassPatch(terrace, 3.2, 5, context.seed), "grass");
  const [vx, vz] = viewer;
  cylinder(0.34, 0.4, 0.1, [vx, 0.05, vz], "stone");
  cylinder(0.105, 0.15, 1, [vx, 0.55, vz], "iron");
  build.add(block([0.25, 0.22, 0.48], [vx, 1.04, vz]), "iron");
  for (const dz of [-0.16, 0.16]) {
    build.add(new CylinderGeometry(0.14, 0.105, 0.55, 8).rotateZ(-Math.PI / 2)
      .translate(vx + 0.1, 1.25, vz + dz), "paper");
    build.add(new CylinderGeometry(0.075, 0.075, 0.12, 8).rotateZ(-Math.PI / 2)
      .translate(vx - 0.23, 1.25, vz + dz), "iron");
    build.add(new CircleGeometry(0.115, 8).rotateY(Math.PI / 2)
      .translate(vx + 0.377, 1.25, vz + dz), "lens");
  }
  collider(viewer, [1.05, 1.5, 0.75]);

  const [bx, bz] = bench;
  build.add(block([0.68, 0.16, 2.1], [bx, 0.51, bz]), "stone");
  for (const dz of [-0.73, 0.73]) build.add(block([0.5, 0.43, 0.28], [bx, 0.215, bz + dz]), "stone");
  collider(bench, [0.75, 0.6, 2.2]);
  const [rx, rz] = rail;
  for (const dz of [-1.8, 0, 1.8]) build.add(block([0.14, 1.08, 0.14], [rx, 0.54, rz + dz]), "wood");
  for (const y of [0.5, 0.98]) build.add(block([0.1, 0.12, 3.8], [rx, y, rz]), "wood");
  collider(rail, [0.3, 1.12, 4]);

  turbines.forEach(([x, z], index) => {
    const height = 7.2 - index * 0.6;
    if (dryFootprint(context, [x, z], 2.5, 2.5)) build.add(grassPatch([x, z], 2.5, 2.5, context.seed + index), "grass");
    cylinder(0.42, 0.52, 0.18, [x, 0.09, z], "stone");
    cylinder(0.14, 0.28, height, [x, height / 2, z], "paper");
    build.add(block([0.85, 0.32, 0.38], [x, height, z]), "paper");
    const rotor = new Group();
    rotor.name = `horizon-rotor-${index}`;
    rotor.position.set(x + 0.49, context.heightAt(x, z) + height, z);
    rotor.rotation.x = index * 0.8 + ((context.seed >>> 0) % 31) * 0.025;
    group.add(rotor);
    rotors.push(rotor);
    build.add(new CylinderGeometry(0.21, 0.21, 0.22, 8).rotateZ(-Math.PI / 2), "paper", rotor, false);
    for (let blade = 0; blade < 3; blade++) {
      // A tapered, swept blade; all three are one draw call around the hub's +X axis.
      const geometry = block([0.085, 1.96, 0.32], [0, 1.13, 0]);
      const vertices = geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const y = vertices.getY(i);
        vertices.setZ(i, vertices.getZ(i) * (1.15 - y * 0.38) + 0.07 + y * 0.06);
      }
      build.add(geometry.rotateX(blade * Math.PI * 2 / 3), "paper", rotor, false);
    }
    collider([x, z], [0.62, height + 0.25, 0.62]);
  });
  const dispose = build.finish();
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
    dispose() { if (!disposed) { disposed = true; dispose(); } },
  };
};
