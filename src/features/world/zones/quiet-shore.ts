import {
  Box3, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, Quaternion, Shape, TorusGeometry, Vector3,
  type MeshToonMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { createPropMaterial } from "../props/materials";
import { createBenchGeometry, createFenceSpanGeometry, createPlankGeometry, createPostGeometry } from "../props/wood";
import { createQuietShoreDressing } from "./quiet-shore-dressing";
import { bindSetpieces } from "./setpiece-hr";
import {
  PATH_CLEARANCE, ZONE_BUDGET,
  type ZoneCollider, type ZoneSceneContext, type ZoneSceneFactory,
} from "./types";

type Point = readonly [number, number, number];
type Surface = "wood" | "roof" | "leaf" | "piano" | "guitar" | "ink" | "flower" | "cream";

function pigmentColor(surface: Surface): Color {
  switch (surface) {
    case "wood": return new Color(PALETTE.dusk).lerp(new Color(PALETTE.rockDark), 0.62);
    case "roof": return new Color(PALETTE.cloud).lerp(new Color(PALETTE.rock), 0.32);
    case "leaf": return new Color(PALETTE.grass);
    case "piano": return new Color(PALETTE.rockDark).lerp(new Color(PALETTE.ink), 0.45);
    case "guitar": return new Color(PALETTE.dusk).lerp(new Color(PALETTE.sand), 0.45);
    case "ink": return new Color(PALETTE.ink);
    case "flower": return new Color(PALETTE.flower);
    case "cream": return new Color(PALETTE.cloud);
  }
}

function pigment(surface: Surface): MeshToonMaterial {
  const material = createPropMaterial(surface === "wood" ? "wood" : "paper");
  material.color.copy(pigmentColor(surface));
  if (surface === "leaf" || surface === "flower") material.side = DoubleSide;
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

/** Fit the shared chamfer/grain kit to joinery; its length and face colours survive. */
function fitPlank(size: Point, template: BufferGeometry): BufferGeometry {
  const axis = size[1] > Math.max(size[0], size[2]) ? 1 : size[2] > size[0] ? 2 : 0;
  const geometry = template.clone();
  if (axis === 1) geometry.rotateZ(Math.PI / 2);
  if (axis === 2) geometry.rotateY(Math.PI / 2);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = bounds.getCenter(new Vector3());
  const extent = bounds.getSize(new Vector3());
  return geometry.translate(-center.x, -center.y, -center.z)
    .scale(size[0] / extent.x, size[1] / extent.y, size[2] / extent.z);
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

/** Lead the eye downstream to the sea, with the porch on the side of that open vista. */
function porchSite(context: ZoneSceneContext) {
  for (const z of [9, 4.5, 0, -4.5, -9]) {
    for (const side of [1, -1]) {
      const x = side * 6;
      if (dryFootprint(context, x, z, 2.15, 2.15)
        && dryFootprint(context, side * 5.35, z - 3.15, 0.64, 1.18)) return { x, z, side };
    }
  }
  throw new RangeError("quiet-shore needs a dry porch footprint beside the walking corridor");
}

/** Static joinery and instruments, sharing the original eight pigment batches. */
export const createQuietShoreScene: ZoneSceneFactory = context => {
  const site = porchSite(context);
  const group = new Group();
  group.name = "quiet-shore";
  const parts = new Map<Surface, BufferGeometry[]>();
  const tints = new Map<Surface, Color>();
  // Three shared kit variants retain bows/grain without rebuilding the kit for every board.
  const plankVariants = Array.from({ length: 3 }, (_, i) => createPlankGeometry(1, context.seed + i * 101));
  const joinery = (size: Point, seed: number) => fitPlank(size, plankVariants[((seed % 3) + 3) % 3]!);
  const darkWood = new Color(PALETTE.rockDark);
  const colliders: ZoneCollider[] = [];
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
    const kitColors = normalized.getAttribute("color");
    let tint = tints.get(surface);
    if (kitColors && !tint) {
      tint = pigmentColor(surface);
      tints.set(surface, tint);
    }
    const colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      if (kitColors && tint) {
        let r = kitColors.getX(i), g = kitColors.getY(i), b = kitColors.getZ(i);
        if (surface === "piano") {
          r = r * 0.28 + darkWood.r * 0.72;
          g = g * 0.28 + darkWood.g * 0.72;
          b = b * 0.28 + darkWood.b * 0.72;
        }
        // Undo the legacy batch tint, so shared kit wood/vine pigments are not tinted twice.
        colors.push(r / tint.r, g / tint.g, b / tint.b);
        continue;
      }
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
  const groundedBoard = (size: Point, center: Point) => {
    const geometry = joinery(size, context.seed + Math.round(center[0] * 31 + center[2] * 79)).translate(...center);
    const positions = geometry.getAttribute("position");
    const ground = new Map<string, number>();
    // Scribe the foot/step to the rendered slope, including its uphill corners.
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), key = `${x},${z}`;
      let y = ground.get(key);
      if (y === undefined) { y = height(x, z); ground.set(key, y); }
      positions.setY(i, Math.max(positions.getY(i), y - 0.04));
    }
    geometry.computeVertexNormals();
    add(geometry, "wood");
  };
  const collider = (center: Point, size: Point) => colliders.push({
    center: new Vector3(...localPoint(...center)), size: new Vector3(...size),
  });
  // Semantic anchors retain their vertex ranges in the shared pigment batches (no extra draws).
  const batchedProp = (name: string, center: Point, build: () => void) => {
    const count = (surface: Surface) => (parts.get(surface) ?? [])
      .reduce((sum, geometry) => sum + geometry.getAttribute("position").count, 0);
    const starts = new Map(Array.from(parts.keys(), surface => [surface, count(surface)]));
    build();
    const node = new Group();
    node.name = name;
    node.position.set(...localPoint(...center));
    node.userData.batches = Array.from(parts.keys()).flatMap(surface => {
      const start = starts.get(surface) ?? 0, added = count(surface) - start;
      return added ? [{ mesh: `quiet-shore-${surface}`, start, count: added }] : [];
    });
    group.add(node);
  };

  let highest = -Infinity;
  for (let x = -1.5; x <= 1.5; x += 0.25) {
    for (let z = -1.8; z <= 1.8; z += 0.25) highest = Math.max(highest, height(x, z));
  }
  const floor = highest + 0.25;
  const moss = (center: Point, size: Point, seed: number) => {
    const geometry = new IcosahedronGeometry(1, 0).scale(...size).translate(...center);
    const color = new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.grass), (seed % 3) * 0.14 + 0.2);
    geometry.setAttribute("color", new Float32BufferAttribute(
      Array.from({ length: geometry.getAttribute("position").count }, () => color.toArray()).flat(), 3));
    const positions = geometry.getAttribute("position");
    // Ground moss sinks into the slope while roof moss sits on its supporting planks.
    if (center[1] < floor) {
      for (let i = 0; i < positions.count; i++) {
        positions.setY(i, Math.max(positions.getY(i), height(positions.getX(i), positions.getZ(i)) - 0.03));
      }
      geometry.computeVertexNormals();
    }
    add(geometry, "leaf");
  };
  batchedProp("porch", [0, highest, 0], () => {
    for (let i = 0; i < 6; i++) {
      add(joinery([2.9 - (i % 3) * 0.015, 0.11, 0.54], context.seed + i)
        .translate(0, floor - 0.055, (i - 2.5) * 0.55), "wood");
    }
    for (const x of [-1.24, 1.24]) {
      for (const z of [-1.42, 1.42]) {
        const bottom = height(x, z) - 0.04, top = floor + 2.48 + x * 0.06;
        groundedBoard([0.24, top - bottom, 0.24], [x, (top + bottom) / 2, z]);
        for (const offset of [-0.15, 0.15]) {
          const mx = x + offset, mz = z + 0.13;
          moss([mx, height(mx, mz) - 0.015, mz], [0.13, 0.045, 0.1], context.seed + Math.round((x + z) * 100));
        }
      }
      add(joinery([0.2, 0.2, 3.08], context.seed + Math.round(x * 100))
        .translate(x, floor + 2.32 + x * 0.06, 0), "wood");
    }
    for (let i = 0; i < 3; i++) {
      const x = 0.8 + (i % 3) * 0.31, z = (i - 2) * 0.53;
      moss([x, floor + 2.61 + x * 0.06, z], [0.28, 0.045, 0.17], context.seed + i);
    }
    // Straight mono-pitch, weathered white timber roof; open sides preserve the sea vista.
    for (let i = 0; i < 5; i++) {
      const plank = joinery([3.65, 0.12, 0.738], context.seed + 101 + i).rotateZ(0.06)
        .translate(0, floor + 2.53, (i - 2) * 0.744);
      const positions = plank.getAttribute("position"), normals = plank.getAttribute("normal");
      const grain = plank.getAttribute("color");
      const faces = { roof: { position: [] as number[], normal: [] as number[], color: [] as number[] },
        ink: { position: [] as number[], normal: [] as number[], color: [] as number[] } };
      // Repaint existing downward faces, including their bevels: no overlapping ceiling mesh.
      for (let j = 0; j < positions.count; j += 3) {
        const face = faces[normals.getY(j) + normals.getY(j + 1) + normals.getY(j + 2) < -1.5 ? "ink" : "roof"];
        for (let k = j; k < j + 3; k++) {
          face.position.push(positions.getX(k), positions.getY(k), positions.getZ(k));
          face.normal.push(normals.getX(k), normals.getY(k), normals.getZ(k));
          const color = new Color().fromBufferAttribute(grain, k).lerp(new Color(PALETTE.cloud), 0.32);
          face.color.push(color.r, color.g, color.b);
        }
      }
      plank.dispose();
      for (const surface of ["roof", "ink"] as const) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(faces[surface].position, 3));
        geometry.setAttribute("normal", new Float32BufferAttribute(faces[surface].normal, 3));
        if (surface === "roof") geometry.setAttribute("color", new Float32BufferAttribute(faces[surface].color, 3));
        add(geometry, surface);
      }
    }
    for (const z of [-1.42, 1.42]) {
      add(joinery([2.65, 0.18, 0.16], context.seed + Math.round(z * 100))
        .rotateZ(0.06).translate(0, floor + 2.31, z), "wood");
      add(rod([0.65, floor + 2.35, z], [1.24, floor + 1.76, z], 0.045), "wood");
    }
    const stepGround = Math.max(height(-1.79, -0.9), height(-1.79, 0.9));
    const stepTop = Math.max(floor - 0.1, stepGround + 0.08);
    groundedBoard([0.68, stepTop - stepGround, 2.0], [-1.76, (stepTop + stepGround) / 2, 0]);
  });
  const stepGround = Math.max(height(-1.79, -0.9), height(-1.79, 0.9));
  const stepTop = Math.max(floor - 0.1, stepGround + 0.08);
  collider([0, (floor + highest) / 2, 0], [2.9, floor - highest, 3.32]);
  collider([-1.76, (stepTop + stepGround) / 2, 0], [0.68, stepTop - stepGround, 2]);
  for (const x of [-1.24, 1.24]) {
    for (const z of [-1.42, 1.42]) {
      const bottom = height(x, z), top = floor + 2.48 + x * 0.06;
      collider([x, (bottom + top) / 2, z], [0.16, top - bottom, 0.16]);
    }
  }

  // The small upright is the main instrument: raised top lid and a simple light/dark keyboard.
  batchedProp("piano", [-0.85, floor, 0.35], () => {
    const pianoPart = (part: BufferGeometry, surface: Surface) =>
      add(part.rotateY(-Math.PI / 2).translate(-0.85, floor, 0.35), surface);
    const pianoBox = (size: Point, center: Point, surface: Surface = "piano") =>
      pianoPart((surface === "piano" ? joinery(size, context.seed + Math.round(center[1] * 100 + center[0] * 51))
        : new BoxGeometry(...size)).translate(...center), surface);
    pianoBox([1.28, 1.12, 0.31], [0, 0.66, -0.04]);
    for (const x of [-0.57, 0.57]) {
      pianoBox([0.11, 0.16, 0.48], [x, 0.08, 0.04]);
      pianoPart(createPostGeometry(0.74, (context.seed + (x < 0 ? 5 : 17)) * 3)
        .scale(0.55, 1, 0.8).translate(x, 0.16, 0.24), "piano");
    }
    pianoBox([1.3, 0.07, 0.33], [0, 0.72, 0.19]);
    pianoBox([1.1, 0.07, 0.05], [0, 0.83, 0.16], "ink");
    // Open hinge at the rear; the raised front exposes a dark interior below the lid.
    pianoBox([1.15, 0.025, 0.25], [0, 1.225, -0.04], "ink");
    pianoPart(joinery([1.3, 0.045, 0.36], context.seed + 213).translate(0, 0, 0.18)
      .rotateX(-0.55).translate(0, 1.24, -0.21), "piano");
    // Raised fallboard above the keys, distinct from the cabinet's top lid.
    pianoPart(joinery([1.11, 0.19, 0.035], context.seed + 214)
      .rotateX(-0.16).translate(0, 0.92, 0.13), "piano");
    for (let i = 0; i < 14; i++) {
      pianoBox([0.073, 0.035, 0.23], [(i - 6.5) * 0.078, 0.773, 0.23], "cream");
      if ([0, 1, 3, 4, 5].includes(i % 7)) {
        pianoBox([0.043, 0.035, 0.13], [(i - 6) * 0.078, 0.807, 0.18], "ink");
      }
    }
    collider([-0.85, floor + 0.73, 0.35], [0.72, 1.46, 1.3]);
  });
  // A tucked-in stool and a compact porch bench stay within the existing deck collider.
  batchedProp("piano-stool", [-0.35, floor, 0.35], () => {
    add(joinery([0.32, 0.075, 0.47], context.seed + 220).translate(-0.35, floor + 0.39, 0.35), "piano");
    for (const x of [-0.45, -0.25]) for (const z of [0.2, 0.5]) {
      add(createPostGeometry(0.36, (context.seed + Math.round((x + z) * 100)) * 3)
        .scale(0.36, 1, 0.36).translate(x, floor, z), "piano");
    }
  });
  batchedProp("porch-bench", [0.7, floor, 0], () => {
    add(createBenchGeometry(context.seed + 230).rotateY(-Math.PI / 2)
      .translate(0.7, floor - 0.02, 0), "wood");
  });

  // A smaller hanging acoustic beside the piano, with its waist, hole and six strings retained.
  const guitarShape = new Shape();
  const outline = [[0, -0.39], [0.22, -0.35], [0.29, -0.17], [0.23, -0.02], [0.14, 0.08],
    [0.23, 0.23], [0.18, 0.36], [0, 0.39], [-0.18, 0.36], [-0.23, 0.23], [-0.14, 0.08],
    [-0.23, -0.02], [-0.29, -0.17], [-0.22, -0.35]] as const;
  outline.forEach(([x, y], i) => { if (i === 0) guitarShape.moveTo(x, y); else guitarShape.lineTo(x, y); });
  guitarShape.closePath();
  const guitarPart = (part: BufferGeometry, surface: Surface) =>
    add(part.scale(0.65, 0.65, 0.65).rotateY(-Math.PI / 2)
      .translate(-1.16, floor + 0.85, -0.98), surface);
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
  add(rod([-1.16, floor + 1.54, -0.98], [-1.16, floor + 2.4, -0.98], 0.008), "wood");

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

  // A sand-coloured adult dog curled into its tail; no oversized eyes or graphic face.
  batchedProp("dog", [-1.76, stepTop, 0.54], () => {
    const dogPart = (part: BufferGeometry, shade = 0.35) => {
      const color = new Color(PALETTE.sand).lerp(new Color(PALETTE.rockDark), shade);
      part.setAttribute("color", new Float32BufferAttribute(
        Array.from({ length: part.getAttribute("position").count }, () => color.toArray()).flat(), 3));
      // Keep fur in the untextured pigment draw when timber opts into P2.
      add(part.translate(-1.76, stepTop, 0.54), "cream");
    };
    dogPart(new IcosahedronGeometry(1, 1).scale(0.235, 0.14, 0.29).translate(0.01, 0.14, -0.025));
    dogPart(new TorusGeometry(0.17, 0.045, 4, 8, Math.PI * 1.65).rotateX(Math.PI / 2)
      .scale(1, 1, 1.35).rotateY(-0.4).translate(0, 0.065, 0.025), 0.48);
    dogPart(new IcosahedronGeometry(1, 1).scale(0.125, 0.085, 0.13).rotateY(-0.45)
      .translate(-0.08, 0.105, 0.2));
    dogPart(new IcosahedronGeometry(1, 0).scale(0.065, 0.04, 0.095).translate(-0.12, 0.04, 0.29));
    dogPart(new IcosahedronGeometry(1, 0).scale(0.06, 0.075, 0.08).rotateZ(-0.4)
      .translate(-0.18, 0.11, 0.19), 0.62);
    dogPart(new IcosahedronGeometry(1, 0).scale(0.06, 0.045, 0.07).translate(-0.07, 0.08, 0.29), 0.4);
    dogPart(new IcosahedronGeometry(1, 0).scale(0.025, 0.018, 0.023).translate(-0.085, 0.09, 0.343), 0.85);
    collider([-1.76, stepTop + 0.17, 0.58], [0.56, 0.34, 0.8]);
  });

  // A small, anonymous old step-through, parked alongside the porch rather than the player's GD110.
  // Chunky cast wheels, a low leg shield and one long saddle give it a different silhouette.
  // Every part joins the existing pigment batches, including the cream piano-key pigment.
  const bikeX = -0.65, bikeZ = site.side > 0 ? -3.15 : 3.15;
  const bikeCenter = localPoint(bikeX, 0, bikeZ);
  if (dryFootprint(context, bikeCenter[0], bikeCenter[2], 0.64, 1.18)) {
    const bikeHeight = (z: number) => height(bikeX, bikeZ + z);
    const rearGround = bikeHeight(-0.66), frontGround = bikeHeight(0.66);
    const pitch = Math.atan2(frontGround - rearGround, 1.32);
    const ground = (rearGround + frontGround) / 2;
    const dullMetal = (part: BufferGeometry) => {
      const color = new Color(PALETTE.ink).lerp(new Color(PALETTE.rock), 0.55);
      part.setAttribute("color", new Float32BufferAttribute(
        Array.from({ length: part.getAttribute("position").count }, () => color.toArray()).flat(), 3));
      return part;
    };
    const bikePart = (part: BufferGeometry, surface: Surface) => {
      if (surface === "wood") dullMetal(part);
      add(part.rotateX(-pitch).translate(bikeX, ground, bikeZ), surface === "wood" ? "cream" : surface);
    };
    const bikeBox = (size: Point, center: Point, surface: Surface) =>
      bikePart(new BoxGeometry(...size).translate(...center), surface);
    for (const z of [-0.66, 0.66]) {
      bikePart(new TorusGeometry(0.245, 0.055, 4, 10).rotateY(Math.PI / 2)
        .translate(0, 0.3, z), "ink");
      for (const x of [-0.077, 0.077]) {
        bikePart(new CylinderGeometry(0.19, 0.19, 0.018, 8).rotateZ(Math.PI / 2)
          .translate(x, 0.3, z), "wood");
      }
      bikeBox([0.28, 0.09, 0.62], [0, 0.62, z], "cream");
    }
    bikeBox([0.31, 0.34, 0.47], [0, 0.57, -0.3], "cream");
    bikeBox([0.35, 0.13, 0.8], [0, 0.85, -0.27], "ink");
    bikeBox([0.24, 0.1, 0.58], [0, 0.43, 0.17], "cream");
    bikePart(timber(0.4, 0.57, 0.14).rotateX(-0.22).translate(0, 0.75, 0.43), "cream");
    for (const x of [-0.1, 0.1]) {
      bikePart(rod([x, 0.3, 0.66], [x, 1.07, 0.43], 0.028), "wood");
    }
    bikePart(rod([-0.4, 1.08, 0.44], [0.4, 1.08, 0.44], 0.027), "ink");
    bikePart(new CylinderGeometry(0.1, 0.1, 0.14, 8).rotateX(Math.PI / 2)
      .translate(0, 1.03, 0.53), "cream");
    bikePart(rod([-0.12, 0.45, -0.28], [-0.35, 0.015, -0.4], 0.022), "wood");
    // Pad below the kickstand follows heightAt; wheels follow their individual contact heights.
    const standGround = height(bikeX - 0.35, bikeZ - 0.4);
    add(dullMetal(rod([bikeX - 0.35, standGround, bikeZ - 0.4],
      [bikeX - 0.35, ground + 0.2, bikeZ - 0.4], 0.025)), "cream");
    const bottom = Math.min(rearGround, frontGround, standGround);
    const top = Math.max(rearGround, frontGround) + 1.2;
    collider([bikeX, (bottom + top) / 2, bikeZ], [0.9, top - bottom, 2.15]);
  }

  const fencePoint = (i: number): Point => [3.15 + Math.sin(i * 0.65) * 0.16, 0, (i - 3) * 2.4];
  for (let i = 0; i < 6; i++) {
    const a = fencePoint(i), b = fencePoint(i + 1);
    const center = localPoint((a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2);
    const halfX = Math.abs(a[0] - b[0]) / 2 + 0.28;
    if (!dryFootprint(context, center[0], center[2], halfX, 1.44)) continue;
    const ay = height(a[0], a[2]), by = height(b[0], b[2]);
    const low = Math.min(ay, by), high = Math.max(ay, by) + 1.18;
    collider([(a[0] + b[0]) / 2, (low + high) / 2, (a[2] + b[2]) / 2],
      [halfX * 2, high - low, 2.56]);
    if (i % 2 !== 0) continue;
    const end = fencePoint(i + 2);
    const spanX = (a[0] + end[0]) / 2, spanZ = (a[2] + end[2]) / 2;
    const spanCenter = localPoint(spanX, 0, spanZ);
    if (!dryFootprint(context, spanCenter[0], spanCenter[2],
      Math.abs(a[0] - end[0]) / 2 + 0.28, 2.64)) continue;
    batchedProp(`fence-${i}`, [spanX, low, spanZ], () => {
      // X-long kit spans rotate along the shore; positive kit Z faces the walking path.
      // Pair collision spans into long shore rails; two flowering patches remain small accents.
      const span = createFenceSpanGeometry((context.seed + i * 17) * 6 + 4, { flowers: i !== 2 });
      span.computeBoundingBox();
      const length = span.boundingBox!.getSize(new Vector3()).x;
      span.scale(4.92 / length, 1, 1).rotateY(-Math.atan2(end[2] - a[2], end[0] - a[0]))
        .translate(spanX, 0, spanZ);
      const positions = span.getAttribute("position");
      for (let j = 0; j < positions.count; j++) {
        const x = positions.getX(j), z = positions.getZ(j);
        positions.setY(j, positions.getY(j) + height(x, z) - 0.04);
      }
      span.computeVertexNormals();
      add(span, "wood");
    });
  }

  // Library grass replaces the old 81-triangle blade patches within the same draw.
  const owned: { geometry: BufferGeometry; material: MeshToonMaterial }[] = [];
  let dressing: ReturnType<typeof createQuietShoreDressing> | undefined;
  plankVariants.forEach(geometry => geometry.dispose());
  for (const [surface, geometries] of parts) {
    const geometry = mergeGeometries(geometries, false)!;
    geometries.forEach(part => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    if (surface === "leaf") {
      dressing = createQuietShoreDressing(context, geometry, site, colliders);
      group.add(dressing.mesh);
      continue;
    }
    const material = pigment(surface);
    owned.push({ geometry, material });
    const mesh = new Mesh(geometry, material);
    mesh.name = `quiet-shore-${surface}`;
    // P2 owns atlas loading, PBR replacement and Low fallback; no new textures.
    if (surface === "wood" || surface === "piano" || surface === "guitar") mesh.userData.photoSurface = "bark";
    mesh.castShadow = surface !== "flower";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // HR-FIX-SETPIECE A15: authored piano, stool, guitar and bench replace the render of their solids.
  const named = (surface: Surface) => group.getObjectByName(`quiet-shore-${surface}`) as Mesh | undefined;
  const region = (center: Point, size: Point) => new Box3().setFromCenterAndSize(
    new Vector3(...localPoint(...center)), new Vector3(...size));
  const pianoBox = region([-0.85, floor + 0.745, 0.35], [0.78, 1.48, 1.36]);
  const stoolBox = region([-0.35, floor + 0.245, 0.35], [0.4, 0.48, 0.56]);
  const guitarBox = region([-1.16, floor + 1.07, -0.98], [0.3, 0.93, 0.5]);
  const benchBox = region([0.7, floor + 0.524, 0], [0.8, 1.04, 1.9]);
  const turn = site.side < 0 ? Math.PI : 0;
  const hidden: { mesh: Mesh; boxes: Box3[] }[] = [];
  for (const [surface, boxes] of [["piano", [pianoBox, stoolBox]], ["guitar", [guitarBox]], ["ink", [pianoBox, guitarBox]],
    ["cream", [pianoBox]], ["wood", [guitarBox, benchBox]]] as const) {
    const mesh = named(surface);
    if (mesh) hidden.push({ mesh, boxes: [...boxes] });
  }
  const anchorMesh = named("wood");
  const releaseSetpieces = anchorMesh ? bindSetpieces(anchorMesh, {
    file: "quiet-shore", hide: hidden,
    place(asset, add) {
      for (const [name, at, yaw] of [["piano", [-0.85, floor, 0.35], -Math.PI / 2], ["stool", [-0.35, floor, 0.35], 0],
        ["guitar", [-1.16, floor + 0.85, -0.98], -Math.PI / 2], ["bench", [0.7, floor - 0.02, 0], -Math.PI / 2]] as const) {
        const model = asset.piece(name);
        model.position.set(...localPoint(at[0], at[1], at[2])); model.rotation.y = yaw + turn;
        add(model);
      }
    },
  }) : () => {};
  let disposed = false;
  return {
    zoneId: "quiet-shore", group, colliders,
    interactable: {
      position: new Vector3(...localPoint(-1.21, floor + 0.8, 0.35)),
      label: { vi: "Piano trên hiên hướng biển", en: "Piano on the seaside porch" },
    },
    update() { /* This quiet, static scene also stays still with reduced motion. */ },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseSetpieces();
      dressing?.dispose();
      for (const { geometry, material } of owned) {
        geometry.dispose();
        material.dispose();
      }
    },
  };
};
