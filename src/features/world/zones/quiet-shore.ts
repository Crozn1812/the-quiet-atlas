import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Float32BufferAttribute, Group, Mesh, OctahedronGeometry, Quaternion, Shape, Vector3,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createPropMaterial } from "../props/materials";
import {
  PATH_CLEARANCE, ZONE_BUDGET,
  type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

type Point = readonly [number, number, number];
type Surface = "wood" | "roof" | "leaf" | "vine" | "guitar" | "ink" | "flower";

function pigment(surface: Surface): MeshToonMaterial {
  const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
  switch (surface) {
    case "roof": material.color.set(PALETTE.forestDeep).lerp(new Color(PALETTE.paper), 0.22); break;
    case "leaf":
      material.color.set(PALETTE.forestLight).lerp(new Color(PALETTE.paper), 0.18);
      material.side = DoubleSide;
      break;
    case "vine": material.color.set(PALETTE.forestDeep); break;
    case "guitar": material.color.set(PALETTE.dusk).lerp(new Color(PALETTE.paper), 0.35); break;
    case "ink": material.color.set(PALETTE.ink); break;
    case "flower": material.color.set(PALETTE.flower); material.side = DoubleSide; break;
  }
  return material;
}

/** A slightly skewed rectangular prism with one soft, low-poly chamfer. */
function timber(width: number, height: number, depth: number): BufferGeometry {
  const bevel = Math.min(0.018, width / 8, height / 8, depth / 8);
  const x = width / 2 - bevel, y = height / 2 - bevel;
  const outline = new Shape();
  outline.moveTo(-x, -y);
  outline.lineTo(x, -y);
  outline.lineTo(x - bevel * 0.2, y);
  outline.lineTo(-x + bevel * 0.2, y);
  outline.closePath();
  return new ExtrudeGeometry(outline, {
    depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 1, steps: 1, curveSegments: 1,
  }).translate(0, 0, -depth / 2 + bevel);
}

function rod(start: Point, end: Point, radius: number): BufferGeometry {
  const a = new Vector3(...start), b = new Vector3(...end);
  return new CylinderGeometry(radius, radius, a.distanceTo(b), 5)
    .applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    .translate(...a.add(b).multiplyScalar(0.5).toArray());
}

/** Include footprint interiors, not just the centres, when checking shore/path masks. */
function dryFootprint(context: ZoneSceneContext, x: number, z: number, halfX: number, halfZ: number): boolean {
  const nx = Math.ceil(halfX * 2 / 0.2), nz = Math.ceil(halfZ * 2 / 0.2);
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const px = x - halfX + i * halfX * 2 / nx;
      const pz = z - halfZ + j * halfZ * 2 / nz;
      if (Math.abs(px) <= PATH_CLEARANCE || context.onPath(px, pz) || context.underWater(px, pz)
        || Math.hypot(px, pz) > ZONE_BUDGET.radius - 4) return false;
    }
  }
  return true;
}

/** The porch faces the path; try the opposite bank if the seaward footprint is wet. */
function porchSite(context: ZoneSceneContext) {
  for (const z of [0, -4.5, 4.5, -9, 9]) {
    for (const side of [1, -1]) {
      const x = side * 6;
      if (dryFootprint(context, x, z, 2.15, 2.15)) return { x, z, side };
    }
  }
  throw new RangeError("quiet-shore needs a dry porch footprint beside the walking corridor");
}

/** Seven static pigment batches. No bench: the nearby Unwritten Page owns that silhouette. */
export const createQuietShoreScene: ZoneSceneFactory = context => {
  const site = porchSite(context);
  const group = new Group();
  group.name = "quiet-shore";
  const parts = new Map<Surface, BufferGeometry[]>();
  const colliders: ZoneCollider[] = [];
  let state = context.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  // Build in a path-facing frame, then bake into zone-local geometry before merging.
  const localPoint = (x: number, y: number, z: number): Point =>
    [site.x + site.side * x, y, site.z + site.side * z];
  const height = (x: number, z: number) => context.heightAt(site.x + site.side * x, site.z + site.side * z);
  const add = (geometry: BufferGeometry, surface: Surface) => {
    // A rotation, rather than reflection, preserves winding on either side of the path.
    if (site.side < 0) geometry.rotateY(Math.PI);
    geometry.translate(site.x, 0, site.z);
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    normalized.deleteAttribute("uv");
    const positions = normalized.getAttribute("position");
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const wash = surface === "flower" ? 1
        : 0.955 + Math.sin(positions.getX(i) * 7 + positions.getZ(i) * 9) * 0.025
          + Math.sin(positions.getY(i) * 17) * 0.015;
      colors.push(wash, wash, wash);
    }
    normalized.setAttribute("color", new Float32BufferAttribute(colors, 3));
    const batch = parts.get(surface) ?? [];
    batch.push(normalized);
    parts.set(surface, batch);
  };
  const board = (size: Point, center: Point, surface: Surface = "wood", tilt = 0) =>
    add(timber(...size).rotateZ(tilt).translate(...center), surface);
  const collider = (center: Point, size: Point) => colliders.push({
    center: new Vector3(...localPoint(...center)), size: new Vector3(...size),
  });

  let highest = -Infinity;
  for (let x = -1.5; x <= 1.5; x += 0.25) {
    for (let z = -1.8; z <= 1.8; z += 0.25) highest = Math.max(highest, height(x, z));
  }
  const floor = highest + 0.25;
  for (let i = 0; i < 9; i++) {
    board([2.9 - (i % 3) * 0.015, 0.11, 0.35], [0, floor - 0.055, (i - 4) * 0.37]);
  }
  for (const x of [-1.24, 1.24]) {
    for (const z of [-1.42, 1.42]) {
      const bottom = height(x, z), top = floor + 2.48 + x * 0.06;
      board([0.14, top - bottom, 0.14], [x, (top + bottom) / 2, z]);
    }
    board([0.15, 0.16, 3.08], [x, floor + 2.32 + x * 0.06, 0]);
  }
  // Straight mono-pitch, green-grey timber roof; open sides and an unoccupied deck.
  for (let i = 0; i < 8; i++) {
    const plank = timber(3.65, 0.12, 0.46).rotateZ(0.06)
      .translate(0, floor + 2.53, (i - 3.5) * 0.465);
    const positions = plank.getAttribute("position"), normals = plank.getAttribute("normal");
    const faces = { roof: { position: [] as number[], normal: [] as number[] },
      ink: { position: [] as number[], normal: [] as number[] } };
    // Repaint existing downward faces, including their bevels: no overlapping ceiling mesh.
    for (let j = 0; j < positions.count; j += 3) {
      const face = faces[normals.getY(j) + normals.getY(j + 1) + normals.getY(j + 2) < -1.5 ? "ink" : "roof"];
      for (let k = j; k < j + 3; k++) {
        face.position.push(positions.getX(k), positions.getY(k), positions.getZ(k));
        face.normal.push(normals.getX(k), normals.getY(k), normals.getZ(k));
      }
    }
    plank.dispose();
    for (const surface of ["roof", "ink"] as const) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(faces[surface].position, 3));
      geometry.setAttribute("normal", new Float32BufferAttribute(faces[surface].normal, 3));
      add(geometry, surface);
    }
  }
  for (const z of [-1.42, 1.42]) {
    board([2.65, 0.12, 0.12], [0, floor + 2.31, z], "wood", 0.06);
    add(rod([0.65, floor + 2.35, z], [1.24, floor + 1.76, z], 0.045), "wood");
  }
  const stepGround = Math.max(height(-1.79, -0.9), height(-1.79, 0.9));
  const stepTop = Math.max(floor - 0.1, stepGround + 0.08);
  board([0.68, stepTop - stepGround, 2.0], [-1.76, (stepTop + stepGround) / 2, 0]);
  collider([0, (floor + highest) / 2, 0], [2.9, floor - highest, 3.32]);
  collider([-1.76, (stepTop + stepGround) / 2, 0], [0.68, stepTop - stepGround, 2]);
  for (const x of [-1.24, 1.24]) {
    for (const z of [-1.42, 1.42]) {
      const bottom = height(x, z), top = floor + 2.48 + x * 0.06;
      collider([x, (bottom + top) / 2, z], [0.16, top - bottom, 0.16]);
    }
  }

  // An acoustic waist, sound hole, bridge, six strings and a hanging loop, all facing the path.
  const guitarShape = new Shape();
  const outline = [[0, -0.39], [0.22, -0.35], [0.29, -0.17], [0.23, -0.02], [0.14, 0.08],
    [0.23, 0.23], [0.18, 0.36], [0, 0.39], [-0.18, 0.36], [-0.23, 0.23], [-0.14, 0.08],
    [-0.23, -0.02], [-0.29, -0.17], [-0.22, -0.35]] as const;
  outline.forEach(([x, y], i) => { if (i === 0) guitarShape.moveTo(x, y); else guitarShape.lineTo(x, y); });
  guitarShape.closePath();
  const guitarPart = (part: BufferGeometry, surface: Surface) =>
    add(part.rotateY(-Math.PI / 2).translate(-1.25, floor + 1.12, 0.36), surface);
  guitarPart(new ExtrudeGeometry(guitarShape, {
    depth: 0.1, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.012,
    bevelSegments: 1, steps: 1, curveSegments: 1,
  }), "guitar");
  guitarPart(timber(0.085, 0.57, 0.06).translate(0, 0.63, 0.04), "wood");
  guitarPart(timber(0.13, 0.18, 0.07).rotateZ(-0.07).translate(0, 0.97, 0.04), "guitar");
  guitarPart(new CylinderGeometry(0.087, 0.087, 0.008, 12).rotateX(Math.PI / 2).translate(0, 0.1, 0.121), "ink");
  guitarPart(timber(0.16, 0.035, 0.016).translate(0, -0.2, 0.121), "wood");
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.009;
    guitarPart(rod([x, -0.2, 0.133], [x, 0.94, 0.133], 0.0018), "guitar");
  }
  add(rod([-1.25, floor + 2.17, 0.36], [-1.25, floor + 2.4, 0.36], 0.008), "wood");

  // Old portable radio resting on the broad step: woven grille, blank dial, two knobs.
  const radioScale = 1.5, radioZ = -0.48;
  const radioPart = (part: BufferGeometry, surface: Surface) =>
    add(part.scale(radioScale, radioScale, radioScale).translate(-1.76, stepTop, radioZ), surface);
  const radioBoard = (size: Point, center: Point, surface: Surface = "wood") =>
    radioPart(timber(...size).translate(...center), surface);
  radioBoard([0.29, 0.48, 0.68], [0, 0.24, 0]);
  radioBoard([0.018, 0.32, 0.39], [-0.156, 0.22, -0.1], "guitar");
  for (let i = 0; i < 5; i++) radioBoard([0.012, 0.25, 0.012], [-0.171, 0.22, -0.25 + i * 0.075]);
  radioBoard([0.019, 0.065, 0.15], [-0.156, 0.34, 0.22], "ink");
  for (const z of [0.17, 0.27]) {
    radioPart(new CylinderGeometry(0.034, 0.034, 0.035, 8).rotateZ(Math.PI / 2)
      .translate(-0.175, 0.15, z), "ink");
  }
  for (const z of [-0.22, 0.22]) radioBoard([0.045, 0.13, 0.04], [0, 0.525, z], "ink");
  radioBoard([0.045, 0.04, 0.48], [0, 0.59, 0], "ink");
  collider([-1.76, stepTop + 0.305 * radioScale, radioZ],
    [0.39 * radioScale, 0.61 * radioScale, 0.7 * radioScale]);

  const leaf = (x: number, y: number, z: number, angle: number) => add(
    new OctahedronGeometry(1, 0).scale(0.09, 0.18, 0.035).rotateZ(angle).rotateY(0.4).translate(x, y, z), "leaf");
  const fencePoint = (i: number): Point => [3.15 + Math.sin(i * 0.65) * 0.16, 0, (i - 3) * 2.4];
  const posts = new Set<number>();
  for (let i = 0; i < 6; i++) {
    const a = fencePoint(i), b = fencePoint(i + 1);
    const center = localPoint((a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2);
    const halfX = Math.abs(a[0] - b[0]) / 2 + 0.28;
    if (!dryFootprint(context, center[0], center[2], halfX, 1.44)) continue;
    for (const index of [i, i + 1]) {
      if (posts.has(index)) continue;
      posts.add(index);
      const p = fencePoint(index), y = height(p[0], p[2]);
      board([0.13, 1.16, 0.14], [p[0], y + 0.58, p[2]]);
    }
    const ay = height(a[0], a[2]), by = height(b[0], b[2]);
    for (const y of [0.48, 0.93]) {
      // Narrow five-sided rails retain the handmade fence silhouette.
      add(rod([a[0], ay + y, a[2]], [b[0], by + y, b[2]], 0.052), "wood");
    }
    const low = Math.min(ay, by), high = Math.max(ay, by) + 1.18;
    collider([(a[0] + b[0]) / 2, (low + high) / 2, (a[2] + b[2]) / 2],
      [halfX * 2, high - low, 2.56]);
    // Two broad climbing patches, each with six path-facing orange flowers.
    if (i !== 1 && i !== 4) continue;
    for (let j = 0; j < 7; j++) {
      const t = j / 6, x = a[0] + (b[0] - a[0]) * t - 0.09;
      const z = a[2] + (b[2] - a[2]) * t, y = ay + (by - ay) * t + 0.6 + Math.sin(t * Math.PI) * 0.38;
      if (j > 0) {
        const previous = (j - 1) / 6;
        add(rod([a[0] + (b[0] - a[0]) * previous - 0.09,
          ay + (by - ay) * previous + 0.6 + Math.sin(previous * Math.PI) * 0.38,
          a[2] + (b[2] - a[2]) * previous], [x, y, z], 0.012), "vine");
      }
      leaf(x - 0.025, y, z, (j % 2 ? 1 : -1) * 0.75);
      leaf(x - 0.025, y - 0.17, z + 0.09, (j % 2 ? -1 : 1) * 0.85);
      if (j > 0) {
        const positions: number[] = [];
        for (let k = 0; k < 10; k++) {
          const a = k * Math.PI / 5, b = (k + 1) * Math.PI / 5;
          const ra = k % 2 ? 0.03 : 0.06, rb = k % 2 ? 0.06 : 0.03;
          positions.push(0, 0, 0, 0, Math.cos(a) * ra, Math.sin(a) * ra, 0, Math.cos(b) * rb, Math.sin(b) * rb);
        }
        const flower = new BufferGeometry();
        flower.setAttribute("position", new Float32BufferAttribute(positions, 3));
        flower.computeVertexNormals();
        // Stand clear of the leaves and rails on the side facing the walking corridor.
        add(flower.translate(x - 0.16, y + 0.04, z), "flower");
      }
    }
  }

  for (const [x, z] of [[1.5, -4.4], [3, 5.4], [-0.6, 4.9]] as const) {
    const p = localPoint(x, 0, z);
    if (!dryFootprint(context, p[0], p[2], 0.65, 0.65)) continue;
    for (let i = 0; i < 9; i++) {
      const angle = random() * Math.PI * 2, r = random() * 0.34;
      const bx = x + Math.cos(angle) * r, bz = z + Math.sin(angle) * r;
      const y = height(bx, bz), h = 0.35 + random() * 0.43;
      const blade = new BufferGeometry();
      blade.setAttribute("position", new Float32BufferAttribute([
        -0.035, 0, 0, 0.035, 0, 0, 0.12, h * 0.6, 0.025,
        -0.035, 0, 0, 0.12, h * 0.6, 0.025, 0.22, h, 0.01,
        0, 0, -0.035, 0, 0, 0.035, -0.04, h * 0.75, 0.08,
      ], 3));
      blade.computeVertexNormals();
      add(blade.rotateY(angle).translate(bx, y + 0.015, bz), "leaf");
    }
  }

  const owned: { geometry: BufferGeometry; material: MeshToonMaterial }[] = [];
  for (const [surface, geometries] of parts) {
    const geometry = mergeGeometries(geometries, false)!;
    geometries.forEach(part => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = pigment(surface);
    owned.push({ geometry, material });
    const mesh = new Mesh(geometry, material);
    mesh.name = `quiet-shore-${surface}`;
    mesh.castShadow = surface !== "flower";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  let disposed = false;
  return {
    zoneId: "quiet-shore", group, colliders,
    interactable: {
      position: new Vector3(...localPoint(-1.25, floor + 1.22, 0.36)),
      label: { vi: "Hiên gỗ có cây đàn", en: "Porch with a guitar" },
    },
    update() { /* This quiet, static scene also stays still with reduced motion. */ },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { geometry, material } of owned) {
        geometry.dispose();
        material.dispose();
      }
    },
  };
};
