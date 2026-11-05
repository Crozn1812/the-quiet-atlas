import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, ShapeUtils, Vector2, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { createRampMaterial } from "../materials/ramp";

export type RockKind = "pebble" | "stone" | "boulder" | "slab";
type Ring = readonly [height: number, radius: number];

function randomFor(seed: number) {
  let state = (seed >>> 0) ^ 0x524f434b;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function finish(positions: number[], colors: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Metres, centred in XZ, flat contact at Y=0. Independent triangles retain fracture normals.
 * Homothetic polygon rings make genuinely planar cuts, rather than displaced sphere vertices.
 * Costs: pebble 26, stone 20, boulder 68/92, layered slab 80 triangles; one material each.
 * Use a white vertex-colour ramp material. Moss is opt-in for forest instances.
 */
export function createRockGeometry(kind: RockKind, seed: number, mossy = false): BufferGeometry {
  const random = randomFor(seed);
  const sides = kind === "stone" ? 4 : kind === "pebble" ? 5 : 6;
  const phase = random() * Math.PI * 2;
  const corners = Array.from({ length: sides }, (_, i) => {
    const angle = phase + i * Math.PI * 2 / sides;
    const radius = 0.88 + random() * 0.12;
    return new Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const outline: Vector2[] = [];
  const cracks = kind === "boulder" ? 1 + (seed >>> 0) % 2 : 0;
  const firstCrack = Math.floor(random() * sides);
  for (let i = 0; i < sides; i++) {
    const a = corners[i]!, b = corners[(i + 1) % sides]!;
    outline.push(a);
    if (cracks && (i === firstCrack || (cracks === 2 && i === (firstCrack + 3) % sides))) {
      // A narrow V cut in the solid, not a dark line or an overlaid coplanar triangle.
      const middle = a.clone().lerp(b, 0.48 + random() * 0.04);
      outline.push(a.clone().lerp(b, 0.39), middle.multiplyScalar(0.8 + random() * 0.05), a.clone().lerp(b, 0.61));
    }
  }
  const lower = 0.12 + random() * 0.08, upper = 0.76 + random() * 0.08;
  const inset = 0.7 + random() * 0.1;
  const rings: readonly Ring[] = kind === "slab"
    ? [[0, 0.84], [0.13, 1], [0.37, 1], [0.44, 0.94], [0.52, 1], [0.82, 1], [1, 0.82]]
    : kind === "boulder" ? [[0, inset], [lower, 1], [upper, 1], [1, inset]]
      : [[0, inset], [lower, 1], [1, inset]];
  const width = kind === "pebble" ? 0.16 + random() * 0.12 : kind === "stone" ? 0.45 + random() * 0.3
    : kind === "boulder" ? 1.7 + random() * 1.15 : 0.65 + random() * 0.3;
  const height = kind === "pebble" ? 0.1 + random() * 0.05 : kind === "stone" ? 0.3 + random() * 0.16
    : kind === "boulder" ? 1.2 + random() * 0.6 : 0.1 + random() * 0.05;
  const depth = kind === "pebble" ? 0.12 + random() * 0.1 : kind === "stone" ? 0.32 + random() * 0.25
    : kind === "boulder" ? 1.3 + random() * 0.85 : 0.48 + random() * 0.2;
  const minX = Math.min(...outline.map(p => p.x)), maxX = Math.max(...outline.map(p => p.x));
  const minZ = Math.min(...outline.map(p => p.y)), maxZ = Math.max(...outline.map(p => p.y));
  const vertex = (ring: number, i: number) => {
    const [y, radius] = rings[ring]!, p = outline[i]!;
    return new Vector3(((p.x - minX) / (maxX - minX) - 0.5) * width * radius, y * height,
      ((p.y - minZ) / (maxZ - minZ) - 0.5) * depth * radius);
  };
  const positions: number[] = [], colors: number[] = [];
  const dark = new Color(PALETTE.rockDark), rock = new Color(PALETTE.rock);
  const highlight = rock.clone().lerp(new Color(PALETTE.sand), 0.16);
  const moss = rock.clone().lerp(new Color(PALETTE.grass), 0.42);
  function triangle(a: Vector3, b: Vector3, c: Vector3, bevel: boolean) {
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const color = normal.y < -0.3 ? dark : normal.y > 0.3 ? (mossy ? moss : rock)
      : dark.clone().lerp(rock, 0.72);
    const pigment = bevel && normal.y >= 0 ? highlight : color;
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(pigment.r, pigment.g, pigment.b);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const bevel = rings[ring]![1] !== rings[ring + 1]![1];
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      triangle(vertex(ring, i), vertex(ring + 1, i), vertex(ring + 1, j), bevel);
      triangle(vertex(ring, i), vertex(ring + 1, j), vertex(ring, j), bevel);
    }
  }
  // Ear clipping also caps the concave crack mouths without bridging over them.
  for (const [a, b, c] of ShapeUtils.triangulateShape(outline, [])) {
    triangle(vertex(0, a!), vertex(0, b!), vertex(0, c!), false);
    triangle(vertex(rings.length - 1, c!), vertex(rings.length - 1, b!), vertex(rings.length - 1, a!), false);
  }
  return finish(positions, colors);
}

/** A freestanding 3–5 stone cairn, local Y=0 at its foot. Add group once; dispose on unmount.
 * Broad horizontal caps touch; shrinking footprints share a vertical centre of support.
 * Merged into one mesh / one draw call, at most 400 triangles. Placement belongs to the caller.
 */
export function createRockStack(seed: number) {
  const random = randomFor(seed);
  const count = 3 + (seed >>> 0) % 3;
  const positions: number[] = [], colors: number[] = [];
  let bottom = 0;
  for (let i = 0; i < count; i++) {
    const kind = i === 0 || random() < 0.7 ? "slab" : "stone";
    const part = createRockGeometry(kind, (seed + Math.imul(i + 1, 2654435761)) >>> 0);
    const size = part.boundingBox!.getSize(new Vector3());
    const width = 0.95 * 0.76 ** i;
    const height = kind === "slab" ? 0.12 + random() * 0.03 : 0.2 + random() * 0.04;
    part.scale(width / size.x, height / size.y, width * 0.78 / size.z);
    part.translate(0, bottom, 0);
    const p = part.getAttribute("position"), c = part.getAttribute("color");
    for (let j = 0; j < p.count; j++) {
      positions.push(p.getX(j), p.getY(j), p.getZ(j));
      colors.push(c.getX(j), c.getY(j), c.getZ(j));
    }
    bottom += height;
    part.dispose();
  }
  const geometry = finish(positions, colors);
  const material = createRampMaterial(0xffffff, { steps: 4, soft: true });
  material.vertexColors = true;
  const mesh = new Mesh(geometry, material);
  mesh.name = "rock-stack-stones";
  mesh.receiveShadow = true;
  const group = new Group();
  group.name = "rock-stack";
  group.add(mesh);
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
