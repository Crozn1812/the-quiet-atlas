import {
  BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh,
  SphereGeometry, TorusGeometry, Vector3,
} from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";

// Uniformly fit the complete D-23 silhouette (including the high mirrors) inside
// the ticket's bounding envelope. Authoring coordinates below follow gd110.py.
export const GD110_SCALE = 0.81;
export const GD110_WHEEL_RADIUS = 0.30 * GD110_SCALE;
export const GD110_WHEELBASE = 1.28 * GD110_SCALE;
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
  private parts: string[] = [];

  add(name: string, geometry: BufferGeometry, paint: Paint): void {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const positions = flat.getAttribute("position");
    const color = new Color(paint); // Three converts sRGB palette entries to linear.
    for (let i = 0; i < positions.count; i++) {
      this.positions.push(positions.getX(i) * GD110_SCALE,
        positions.getY(i) * GD110_SCALE, positions.getZ(i) * GD110_SCALE);
      this.colors.push(color.r, color.g, color.b);
    }
    this.parts.push(name);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }

  finish(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.parts = this.parts;
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

function wheelGeometry(): BufferGeometry {
  const batch = new Batch();
  batch.add("tire", new TorusGeometry(.25, .05, 4, 16).rotateY(Math.PI / 2), GD110_COLORS.ink);
  batch.add("rim", new TorusGeometry(.215, .012, 3, 16).rotateY(Math.PI / 2), GD110_COLORS.metal);
  batch.add("hub", tube([[-.035, 0, 0], [.035, 0, 0]], .065, 8), GD110_COLORS.metal);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    batch.add("spoke", tube([[0, 0, 0], [0, .213 * Math.sin(a), .213 * Math.cos(a)]], .006, 4), GD110_COLORS.metal);
  }
  return batch.finish();
}

/** Ground origin between axles, Y up, forward +Z. Three meshes = three draws.
 * Wheels have their own X-axis pivots; all geometries/materials are owned by this
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
    pipe("rear_shock", [[x, .33, -.62], [x, .74, -.40]], .032, metal);
    box("side_cover", [x, .67, -.22], [.06, .22, .34], paper, .02);
  }
  box("engine_crankcase", [0, .46, -.02], [.27, .22, .28], metal, .04);
  for (const y of [.57, .60, .63, .66]) box("cooling_fin", [0, y, .08], [.26, .018, .20], metal);
  body.add("fuel_tank", ellipsoid([0, .88, .12], [.185, .16, .31], 12, 6), paper);
  pipe("fuel_cap", [[0, 1.025, .12], [0, 1.045, .12]], .035, metal, 8);
  box("long_seat", [0, .86, -.39], [.32, .115, .63], ink, .035);
  for (const z of [-.64, .64]) {
    const arc: Point[] = Array.from({ length: 9 }, (_, i) =>
      [0, .30 + .335 * Math.sin(i * Math.PI / 8), z + .335 * Math.cos(i * Math.PI / 8)]);
    pipe("fender", arc, .035, paper, 6);
  }
  pipe("exhaust_header", [[.10, .56, .18], [.17, .34, .24], [.23, .22, .08], [.23, .22, -.30]], .026, metal);
  pipe("exhaust_muffler", [[.23, .22, -.27], [.23, .24, -.86]], .05, metal, 8);
  pipe("exhaust_outlet", [[.23, .24, -.861], [.23, .24, -.867]], .027, ink, 6);
  for (const x of [-.13, .13]) {
    pipe("rack_rail", [[x, .80, -.62], [x, .84, -.94]], .014, metal, 4);
    pipe("rack_stay", [[x, .43, -.62], [x, .83, -.91]], .012, metal, 4);
  }
  for (const z of [-.70, -.80, -.90, -.94]) pipe("rack_crossbar", [[-.13, .84, z], [.13, .84, z]], .012, metal, 4);
  pipe("handlebar_stem", [[0, .89, .43], [0, 1.06, .43]], .025, metal);
  pipe("handlebar_scrambler", [[-.45, 1.25, .42], [-.28, 1.25, .48], [-.16, 1.06, .47],
    [.16, 1.06, .47], [.28, 1.25, .48], [.45, 1.25, .42]], .018, metal, 6);
  pipe("handlebar_crossbrace", [[-.24, 1.19, .48], [.24, 1.19, .48]], .012, metal, 4);
  for (const sign of [-1, 1]) {
    pipe("grip", [[sign * .34, 1.25, .459], [sign * .45, 1.25, .42]], .024, ink, 6);
    pipe("lever", [[sign * .31, 1.24, .50], [sign * .43, 1.24, .52]], .009, metal, 4);
    pipe("mirror_stalk", [[sign * .31, 1.25, .47], [sign * .38, 1.48, .49]], .009, metal, 4);
    pipe("round_mirror", [[sign * .38, 1.48, .485], [sign * .38, 1.48, .50]], .066, metal, 12);
    pipe("mirror_face", [[sign * .38, 1.48, .501], [sign * .38, 1.48, .504]], .055, paper, 12);
    pipe("footpeg", [[sign * .12, .36, -.12], [sign * .25, .36, -.12]], .022, ink, 4);
  }
  pipe("headlamp_housing", [[0, .91, .49], [0, .91, .65]], .105, metal, 12);
  pipe("round_headlamp", [[0, .91, .651], [0, .91, .664]], .091, amber, 12);
  box("tail_lamp", [0, .77, -.86], [.10, .055, .04], tail);
  body.add("helmet_shell", helmetDome(.145), paper);
  body.add("helmet_lining", helmetDome(.133, true), ink);
  for (const x of [-.059, .059]) {
    body.add("goggle_rim", ellipsoid([x, 1.095, .25], [.06, .042, .014], 8, 4), metal);
    body.add("amber_lens", ellipsoid([x, 1.095, .263], [.047, .03, .008], 8, 4), amber);
  }
  pipe("goggle_bridge", [[-.018, 1.097, .258], [.018, 1.097, .258]], .008, ink, 4);
  pipe("goggle_strap", [[-.12, 1.09, .23], [-.145, 1.09, .1], [0, 1.09, -.025],
    [.145, 1.09, .1], [.12, 1.09, .23]], .009, ink, 4);
  box("tote_bag", [-.39, .91, .48], [.23, .30, .065], paper, .025);
  for (const z of [.45, .51]) {
    pipe("tote_handle", [[-.49, 1.045, z], [-.46, 1.24, z], [-.34, 1.29, z], [-.29, 1.045, z]], .008, paper, 4);
  }

  const group = new Group();
  group.name = "gd110";
  const material = createRampMaterial(0xffffff);
  material.vertexColors = true;
  const chassis = new Mesh(body.finish(), material);
  chassis.name = "chassis";
  group.add(chassis);
  const wheels = wheelGeometry();
  for (const [name, z] of [["rear_wheel", -.64], ["front_wheel", .64]] as const) {
    const wheel = new Mesh(wheels, material);
    wheel.name = name;
    wheel.position.set(0, GD110_WHEEL_RADIUS, z * GD110_SCALE);
    group.add(wheel);
  }
  // No shadow pass: the three-draw budget includes every vehicle render pass.
  group.traverse(node => { if (node instanceof Mesh) node.receiveShadow = true; });
  return group;
}

/** Release only this factory's resources, once each even though wheels share. */
export function disposeGd110(group: Group): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<import("three").Material>();
  group.traverse(node => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  group.removeFromParent();
  group.clear();
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
