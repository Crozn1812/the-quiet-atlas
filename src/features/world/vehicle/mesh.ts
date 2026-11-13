import {
  Bone, BoxGeometry, BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh,
  Skeleton, SkinnedMesh, SphereGeometry, TorusGeometry, Vector3,
} from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";
import { assignBakedUVs, disposeBakedAppearance, installBakedAppearance, vehicleSurface, type BakedSurface } from "../character/baked-appearance";

// Uniformly fit the complete D-23 silhouette (including the high mirrors) inside
// the ticket's bounding envelope. Authoring coordinates below follow gd110.py.
export const GD110_SCALE = 0.81;
export const GD110_WHEEL_RADIUS = 0.30 * GD110_SCALE;
export const GD110_WHEELBASE = 1.28 * GD110_SCALE;
export const STEERING_PIVOT = new Vector3(0, .91, .43).multiplyScalar(GD110_SCALE);
export const GD110_COLORS = {
  body: PALETTE.paper,
  ink: PALETTE.ink,
  metal: "#C0B8A6", // Approved warm, matte metal in gd110.py.
  amber: PALETTE.dusk,
  tail: PALETTE.vermilion,
} as const;

type Point = readonly [number, number, number];
type Paint = (typeof GD110_COLORS)[keyof typeof GD110_COLORS];

/** Bake each primitive's colour into one ungrouped, flat-shaded draw. */
class Batch {
  private positions: number[] = [];
  private colors: number[] = [];
  private normals: number[] = [];
  private surfaces: BakedSurface[] = [];
  private parts: string[] = [];
  private bones: number[] = [];
  private ranges: { name: string; start: number; count: number; bone: number }[] = [];

  add(name: string, geometry: BufferGeometry, paint: Paint, bone = 0, offset: Point = [0, 0, 0]): void {
    if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals();
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const positions = flat.getAttribute("position");
    const normals = flat.getAttribute("normal");
    const surface = vehicleSurface(name, paint === GD110_COLORS.metal);
    const color = new Color(paint); // Three converts sRGB palette entries to linear.
    const start = this.positions.length / 3;
    for (let i = 0; i < positions.count; i++) {
      this.positions.push((positions.getX(i) + offset[0]) * GD110_SCALE,
        (positions.getY(i) + offset[1]) * GD110_SCALE, (positions.getZ(i) + offset[2]) * GD110_SCALE);
      this.colors.push(color.r, color.g, color.b);
      this.bones.push(bone);
      this.normals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
      this.surfaces.push(surface);
    }
    this.parts.push(name);
    this.ranges.push({ name, start, count: positions.count, bone });
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }

  finish(): BufferGeometry {
    const steeringParts = /^(front_fork|fork|fork_dust_boot|handlebar.*|grip|lever|mirror.*|round_mirror|headlamp_housing|round_headlamp|headlight|tote.*)$/;
    for (const part of this.ranges) {
      const frontFender = /^(fender|fender_stay)$/.test(part.name)
        && this.positions[part.start * 3 + 2]! > 0;
      if (!steeringParts.test(part.name) && !frontFender) continue;
      part.bone = 3;
      this.bones.fill(3, part.start, part.start + part.count);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    const indices = new Uint16Array(this.bones.length * 4);
    const weights = new Float32Array(this.bones.length * 4);
    for (let i = 0; i < this.bones.length; i++) {
      indices[i * 4] = this.bones[i]!;
      weights[i * 4] = 1;
    }
    geometry.setAttribute("skinIndex", new BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new BufferAttribute(weights, 4));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    assignBakedUVs(geometry, this.surfaces);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.parts = this.parts;
    geometry.userData.partRanges = this.ranges;
    return geometry;
  }
}

function geometryFrom(points: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Low-sided continuous tube, with capped ends and no overlapping segment caps. */
function tube(points: readonly Point[], radius: number, sides = 5): BufferGeometry {
  const centers = points.map(p => new Vector3(...p));
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i < centers.length; i++) {
    const tangent = centers[Math.min(i + 1, centers.length - 1)]!.clone()
      .sub(centers[Math.max(0, i - 1)]!).normalize();
    const helper = Math.abs(tangent.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const u = tangent.clone().cross(helper).normalize();
    const v = tangent.clone().cross(u);
    for (let j = 0; j < sides; j++) {
      const angle = j * Math.PI * 2 / sides;
      const p = centers[i]!.clone().addScaledVector(u, radius * Math.cos(angle))
        .addScaledVector(v, radius * Math.sin(angle));
      vertices.push(p.x, p.y, p.z);
      if (i < centers.length - 1) {
        const a = i * sides + j, b = i * sides + (j + 1) % sides;
        indices.push(a, b, b + sides, a, b + sides, a + sides);
      }
    }
  }
  const end = (centers.length - 1) * sides;
  for (let j = 1; j < sides - 1; j++) {
    indices.push(0, j + 1, j, end, end + j, end + j + 1);
  }
  return geometryFrom(vertices, indices);
}

/** One bevel segment, retaining the broad planar faces of the approved blocks. */
function block(center: Point, size: Point, bevel = 0): BufferGeometry {
  if (bevel === 0) return new BoxGeometry(...size).translate(...center);
  const [x, y, z] = size.map(n => n / 2) as [number, number, number];
  const ring = [[-x + bevel, -z], [x - bevel, -z], [x, -z + bevel], [x, z - bevel],
    [x - bevel, z], [-x + bevel, z], [-x, z - bevel], [-x, -z + bevel]];
  const inset = [[-x + bevel, -z + bevel], [x - bevel, -z + bevel],
    [x - bevel, z - bevel], [-x + bevel, z - bevel]];
  const vertices: number[] = [], indices: number[] = [];
  for (const height of [-y + bevel, y - bevel]) {
    for (const p of ring) vertices.push(p[0]!, height, p[1]!);
  }
  for (const height of [-y, y]) {
    for (const p of inset) vertices.push(p[0]!, height, p[1]!);
  }
  const corners = [0, 1, 1, 2, 2, 3, 3, 0];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8, a = corners[i]!, b = corners[next]!;
    indices.push(i, i + 8, next + 8, i, next + 8, next);
    if (a === b) indices.push(i, next, 16 + a, i + 8, 20 + a, next + 8);
    else indices.push(i, next, 16 + b, i, 16 + b, 16 + a,
      i + 8, 20 + b, next + 8, i + 8, 20 + a, 20 + b);
  }
  indices.push(16, 17, 18, 16, 18, 19, 20, 22, 21, 20, 23, 22);
  return geometryFrom(vertices, indices).translate(...center);
}

function ellipsoid(center: Point, radii: Point, segments = 10, rings = 5): BufferGeometry {
  return new SphereGeometry(1, segments, rings).scale(...radii).translate(...center);
}

function helmetDome(radius: number, inside = false): BufferGeometry {
  const geometry = new SphereGeometry(radius, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2)
    .translate(0, 1.045, .12);
  if (inside) {
    const indices = geometry.index!;
    for (let i = 0; i < indices.count; i += 3) {
      const first = indices.getX(i);
      indices.setX(i, indices.getX(i + 2));
      indices.setX(i + 2, first);
    }
  }
  return geometry;
}

function addWheel(batch: Batch, z: number, bone: number): void {
  const { ink, metal } = GD110_COLORS;
  const add = (name: string, geometry: BufferGeometry, paint: Paint) =>
    batch.add(name, geometry, paint, bone, [0, .30, z]);
  // The tread crowns, not an enlarged tire, retain the original 0.30 m radius.
  add("wheel", new TorusGeometry(.246, .05, 6, 32).rotateY(Math.PI / 2), ink);
  add("rim", new TorusGeometry(.215, .009, 4, 32).rotateY(Math.PI / 2), metal);
  add("hub", tube([[-.042, 0, 0], [.042, 0, 0]], .053, 12), metal);
  add("brake_drum", tube([[-.055, 0, 0], [-.037, 0, 0]], .068, 12), metal);
  add("brake_drum_recess", tube([[-.056, 0, 0], [-.055, 0, 0]], .043, 10), ink);
  add("axle", tube([[-.069, 0, 0], [.060, 0, 0]], .016, 6), metal);
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20;
    const hubAngle = a + (i % 2 === 0 ? .32 : -.32);
    const x = i % 2 === 0 ? -.025 : .025;
    add("spoke", tube([[x, .049 * Math.sin(hubAngle), .049 * Math.cos(hubAngle)],
      [0, .211 * Math.sin(a), .211 * Math.cos(a)]], .0025, 3), metal);
  }
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const tread: Point[] = [-1, 0, 1].map(side => {
      const angle = a + side * .022, radius = side === 0 ? .296 : .283;
      return [side * .034, radius * Math.sin(angle), radius * Math.cos(angle)];
    });
    add("tire_tread", tube(tread, .004, 4), ink);
  }
}

function tankGeometry(): BufferGeometry {
  const geometry = new SphereGeometry(1, 16, 8);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i), fullness = .86 + .14 * z;
    positions.setXYZ(i, positions.getX(i) * .185 * fullness,
      .88 + positions.getY(i) * .16 * (1 + .035 * z), .12 + z * .31);
  }
  return geometry;
}

/** A thin curved sheet with real width, rather than a round pipe over the tire. */
function fenderGeometry(z: number): BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const angle = i * Math.PI / segments;
    for (const [x, radius] of [[-.067, .333], [.067, .333], [-.067, .342], [.067, .342]]) {
      vertices.push(x!, .30 + radius! * Math.sin(angle), z + radius! * Math.cos(angle));
    }
    if (i === segments) continue;
    const a = i * 4;
    for (const [u, v] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
      indices.push(a + u!, a + v!, a + v! + 4, a + u!, a + v! + 4, a + u! + 4);
    }
  }
  const end = segments * 4;
  indices.push(0, 2, 3, 0, 3, 1, end, end + 1, end + 3, end, end + 3, end + 2);
  for (let i = 0; i < indices.length; i += 3) {
    [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  }
  return geometryFrom(vertices, indices);
}

/** Ground origin between axles, Y up, forward +Z. One skinned batch = one draw.
 * Wheels retain their named X-axis bone pivots; all geometry/materials are owned by this
 * group, except the globally cached ramp gradient (disposed by the world owner).
 */
export function createGd110(): Group {
  const body = new Batch();
  const { body: paper, ink, metal, amber, tail } = GD110_COLORS;
  const pipe = (name: string, points: readonly Point[], radius: number, color: Paint, sides = 5) =>
    body.add(name, tube(points, radius, sides), color);
  const box = (name: string, center: Point, size: Point, color: Paint, bevel = 0) =>
    body.add(name, block(center, size, bevel), color);
  for (const x of [-.105, .105]) {
    pipe("frame", [[x, .30, -.64], [x, .78, -.33], [x, .77, .36], [x, .38, .10], [x, .30, -.64]], .023, ink);
    pipe("front_fork", [[x, .30, .64], [x, .91, .43]], .025, metal);
    pipe("fork", [[x, .32, .633], [x, .59, .54]], .034, metal, 8);
    pipe("fork_dust_boot", [[x, .59, .54], [x, .64, .523]], .036, ink, 6);
    pipe("rear_shock", [[x, .33, -.62], [x, .74, -.40]], .018, metal);
    const shockStart = new Vector3(x, .36, -.604);
    const shockEnd = new Vector3(x, .70, -.421);
    const axis = shockEnd.clone().sub(shockStart).normalize();
    const u = new Vector3(1, 0, 0), v = axis.clone().cross(u).normalize();
    const spring: Point[] = Array.from({ length: 57 }, (_, i) => {
      const angle = i * Math.PI * 2 / 8;
      const p = shockStart.clone().lerp(shockEnd, i / 56)
        .addScaledVector(u, .034 * Math.cos(angle)).addScaledVector(v, .034 * Math.sin(angle));
      return [p.x, p.y, p.z];
    });
    pipe("shock", spring, .006, metal, 3);
    for (const p of [shockStart, shockEnd]) {
      body.add("shock_collar", tube([p.clone().addScaledVector(axis, -.012).toArray() as [number, number, number],
        p.clone().addScaledVector(axis, .012).toArray() as [number, number, number]], .041, 8), metal);
    }
    box("side_cover", [x, .67, -.22], [.06, .22, .34], paper, .02);
    pipe("swingarm", [[x, .41, -.04], [x, .30, -.64]], .022, ink);
  }
  box("engine_crankcase", [0, .46, -.02], [.27, .22, .28], metal, .04);
  box("engine_cylinder", [0, .615, .08], [.21, .12, .17], ink, .012);
  for (const y of [.56, .585, .61, .635, .66, .685]) box("engine", [0, y, .08], [.26, .012, .20], metal);
  pipe("engine_crank_cover", [[.135, .46, -.02], [.151, .46, -.02]], .081, metal, 12);
  body.add("fuel_tank", tankGeometry(), paper);
  const tankSeam: Point[] = Array.from({ length: 25 }, (_, i) => {
    const a = i * Math.PI * 2 / 24, z = Math.cos(a);
    return [.157 * Math.sin(a) * (.86 + .14 * z), .801 + .012 * z, .12 + .257 * z];
  });
  pipe("tank", tankSeam, .0035, metal, 4);
  pipe("fuel_cap", [[0, 1.025, .12], [0, 1.045, .12]], .035, metal, 8);
  box("long_seat", [0, .86, -.39], [.32, .115, .63], ink, .035);
  pipe("seat", [[-.13, .895, -.696], [-.16, .895, -.666], [-.16, .895, -.11], [-.13, .895, -.08],
    [.13, .895, -.08], [.16, .895, -.11], [.16, .895, -.666], [.13, .895, -.696], [-.13, .895, -.696]], .003, metal, 4);
  for (const z of [-.64, .64]) {
    body.add("fender", fenderGeometry(z), paper);
    for (const x of [-.065, .065]) {
      pipe("fender_stay", [[x, .31, z], [x, .52, z - .22]], .007, metal, 4);
    }
  }
  pipe("exhaust_header", [[.10, .56, .18], [.17, .43, .27], [.23, .30, .17],
    [.24, .31, -.08], [.24, .46, -.32], [.24, .50, -.44]], .026, metal, 6);
  pipe("exhaust_muffler", [[.24, .50, -.40], [.24, .55, -.85]], .048, metal, 8);
  pipe("exhaust_outlet", [[.24, .55, -.851], [.24, .552, -.867]], .028, ink, 8);
  box("exhaust", [.286, .527, -.60], [.018, .076, .33], metal, .008);
  for (const z of [-.72, -.66, -.60, -.54, -.48]) {
    box("exhaust_heat_slot", [.296, .528, z], [.003, .012, .033], ink);
  }
  pipe("chain", [[-.145, .337, -.65], [-.145, .425, -.105], [-.145, .40, -.064],
    [-.145, .35, -.08], [-.145, .266, -.63], [-.145, .285, -.69], [-.145, .337, -.65]], .009, ink, 4);
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    for (const lower of [false, true]) {
      const y = lower ? .266 + .084 * t : .337 + .088 * t;
      pipe("chain_link", [[-.151, y - .004, -.64 + .54 * t], [-.151, y + .004, -.627 + .54 * t]], .0035, metal, 3);
    }
  }
  body.add("chain_sprocket", new TorusGeometry(.067, .009, 4, 16).rotateY(Math.PI / 2).translate(-.141, .30, -.64), metal);
  for (const x of [-.13, .13]) {
    pipe("rack_rail", [[x, .80, -.62], [x, .84, -.94]], .014, metal, 4);
    pipe("rack_stay", [[x, .43, -.62], [x, .83, -.91]], .012, metal, 4);
  }
  for (const z of [-.70, -.80, -.90, -.94]) pipe("rack_crossbar", [[-.13, .84, z], [.13, .84, z]], .012, metal, 4);
  pipe("rack", [[-.13, .84, -.94], [-.10, .84, -.97], [.10, .84, -.97], [.13, .84, -.94]], .014, metal, 4);
  pipe("handlebar_stem", [[0, .89, .43], [0, 1.06, .43]], .025, metal);
  pipe("handlebar_scrambler", [[-.45, 1.25, .42], [-.28, 1.25, .48], [-.16, 1.06, .47],
    [.16, 1.06, .47], [.28, 1.25, .48], [.45, 1.25, .42]], .018, metal, 6);
  pipe("handlebar_crossbrace", [[-.24, 1.19, .48], [.24, 1.19, .48]], .012, metal, 4);
  for (const x of [-.10, .10]) box("handlebar", [x, 1.07, .47], [.035, .041, .047], metal, .006);
  for (const sign of [-1, 1]) {
    pipe("grip", [[sign * .34, 1.25, .459], [sign * .45, 1.25, .42]], .024, ink, 6);
    pipe("lever", [[sign * .31, 1.24, .50], [sign * .43, 1.24, .52]], .009, metal, 4);
    pipe("mirror_stalk", [[sign * .31, 1.25, .47], [sign * .38, 1.48, .49]], .009, metal, 4);
    pipe("round_mirror", [[sign * .38, 1.48, .485], [sign * .38, 1.48, .50]], .066, metal, 12);
    body.add("mirror", new TorusGeometry(.060, .006, 4, 12).translate(sign * .38, 1.48, .502), metal);
    pipe("mirror_face", [[sign * .38, 1.48, .501], [sign * .38, 1.48, .504]], .055, paper, 12);
    pipe("footpeg", [[sign * .12, .36, -.12], [sign * .25, .36, -.12]], .022, ink, 4);
  }
  pipe("headlamp_housing", [[0, .91, .49], [0, .91, .65]], .105, metal, 12);
  pipe("round_headlamp", [[0, .91, .651], [0, .91, .664]], .091, amber, 12);
  body.add("headlight", new TorusGeometry(.097, .008, 4, 16).translate(0, .91, .662), metal);
  box("tail_lamp", [0, .77, -.86], [.10, .055, .04], tail);
  body.add("helmet_shell", helmetDome(.145), paper);
  body.add("helmet_lining", helmetDome(.133, true), ink);
  body.add("helmet", new TorusGeometry(.139, .006, 4, 16).rotateX(Math.PI / 2).translate(0, 1.045, .12), ink);
  for (const x of [-.059, .059]) {
    body.add("goggle_rim", ellipsoid([x, 1.095, .25], [.06, .042, .014], 8, 4), metal);
    body.add("amber_lens", ellipsoid([x, 1.095, .263], [.047, .03, .008], 8, 4), amber);
  }
  pipe("goggle_bridge", [[-.018, 1.097, .258], [.018, 1.097, .258]], .008, ink, 4);
  pipe("goggle_strap", [[-.12, 1.09, .23], [-.145, 1.09, .1], [0, 1.09, -.025],
    [.145, 1.09, .1], [.12, 1.09, .23]], .009, ink, 4);
  box("tote_bag", [-.39, .91, .48], [.23, .30, .065], paper, .025);
  pipe("tote", [[-.48, 1.045, .514], [-.48, .79, .514], [-.30, .79, .514], [-.30, 1.045, .514]], .003, metal, 3);
  for (const z of [.45, .51]) {
    pipe("tote_handle", [[-.49, 1.045, z], [-.46, 1.24, z], [-.34, 1.29, z], [-.29, 1.045, z]], .008, paper, 4);
  }

  const group = new Group();
  group.name = "gd110";
  const material = createRampMaterial(0xffffff);
  material.vertexColors = true;
  const root = new Bone();
  root.name = "chassis_root";
  group.add(root);
  const bones = [root];
  const steering = new Bone();
  steering.name = "steering";
  steering.position.copy(STEERING_PIVOT);
  group.add(steering);
  for (const [name, z] of [["rear_wheel", -.64], ["front_wheel", .64]] as const) {
    addWheel(body, z, bones.length);
    const wheel = new Bone();
    wheel.name = name;
    wheel.position.set(0, GD110_WHEEL_RADIUS, z * GD110_SCALE);
    group.add(wheel);
    bones.push(wheel);
  }
  // Preserve the authored axle coordinates while making yaw precede wheel roll.
  steering.attach(bones[2]!);
  bones.push(steering);
  const chassis = new SkinnedMesh(body.finish(), material);
  chassis.name = "chassis";
  group.add(chassis);
  group.updateMatrixWorld(true);
  chassis.bind(new Skeleton(bones));
  installBakedAppearance(chassis, false);
  // Include the fork, mirrors and grips through the full steering sweep.
  chassis.boundingBox = chassis.geometry.boundingBox!.clone();
  chassis.boundingBox.min.y = 0;
  chassis.boundingBox.expandByVector(new Vector3(.45, 0, .45));
  chassis.boundingSphere = chassis.boundingBox.getBoundingSphere(chassis.geometry.boundingSphere!.clone());
  // No shadow pass: the one-draw budget includes every vehicle render pass.
  group.traverse(node => { if (node instanceof Mesh) node.receiveShadow = true; });
  return group;
}

/** Release only this factory's resources, once each even though wheels share. */
export function disposeGd110(group: Group): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<import("three").Material>();
  group.traverse(node => {
    if (!(node instanceof Mesh)) return;
    if (node instanceof SkinnedMesh) disposeBakedAppearance(node);
    if (node instanceof SkinnedMesh) node.skeleton.dispose();
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  group.removeFromParent();
  group.clear();
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
