import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { RAMP_PRESETS } from "../materials/ramp";
import { TRUNK_HEIGHT, TRUNK_RADIUS } from "./colliders";
import { pineHeight, PINE_VARIANT_SEEDS } from "./shapes";

/** Crown-local coordinates: the root is -TRUNK_HEIGHT, not zero. The full
 * cracked-bark leader is included; leaf bounds retain the legacy upper third.
 * Colours are palette pigments divided by the shared crown ramp, as in mossColor.
 * Integration must preserve surface (0 needles, 1 wood) instead of replacing it. */
export function createPineCrownV2(seed: number = PINE_VARIANT_SEEDS[0]): BufferGeometry {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const height = pineHeight(seed), tiers = 5 + (seed >>> 0) % 4;
  const positions: number[] = [], indices: number[] = [], colors: number[] = [], surfaces: number[] = [];
  const material = new Color(RAMP_PRESETS.crown);
  const phase = random() * Math.PI * 2;
  const bark = (warmth: number) => new Color(PALETTE.rockDark).lerp(new Color(PALETTE.dusk), warmth);
  const needles = (light: number) => new Color(PALETTE.forestDeep).lerp(new Color(PALETTE.forestLight), light);

  function vertex(point: Vector3, surface: number, pigment: Color): number {
    const index = surfaces.length;
    positions.push(point.x, point.y, point.z);
    surfaces.push(surface);
    colors.push(pigment.r / material.r, pigment.g / material.g, pigment.b / material.b);
    return index;
  }

  function tetrahedron(points: Vector3[], surface: number, pigment: Color) {
    const centroid = points.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(0.25);
    const start = surfaces.length;
    for (const point of points) vertex(point, surface, pigment);
    for (const [a, b, c] of [[0, 1, 2], [0, 3, 1], [1, 3, 2], [2, 3, 0]] as const) {
      const normal = points[b]!.clone().sub(points[a]!).cross(points[c]!.clone().sub(points[a]!));
      const outward = normal.dot(points[a]!.clone().sub(centroid)) > 0;
      indices.push(start + a, start + (outward ? b : c), start + (outward ? c : b));
    }
  }

  /** Closed tapered wood; narrow longitudinal facets carry dark fissure washes.
   * Separate facet vertices keep the crack colour from bleeding across a plate. */
  function wood(points: Vector3[], radii: number[], sides = 3, cracked = false) {
    const axis = points[points.length - 1]!.clone().sub(points[0]!).normalize();
    const side = new Vector3(0, 0, 1).cross(axis).normalize();
    const up = axis.clone().cross(side).normalize();
    const offset = (j: number, ring: number) => {
      const angle = cracked ? phase + Math.floor(j / 2) * Math.PI / 3 + (j % 2) * 0.07
        : phase + j * Math.PI * 2 / sides;
      return points[ring]!.clone().addScaledVector(side, Math.cos(angle) * radii[ring]!)
        .addScaledVector(up, Math.sin(angle) * radii[ring]!);
    };
    for (let j = 0; j < sides; j++) {
      const start = surfaces.length;
      const warmth = cracked && j % 2 === 0 ? 0.015 : 0.08 + (j % 3) * 0.03;
      for (let ring = 0; ring < points.length; ring++) {
        const pigment = bark(warmth);
        vertex(offset(j, ring), 1, pigment);
        vertex(offset(j + 1, ring), 1, pigment);
      }
      for (let ring = 0; ring < points.length - 1; ring++) {
        const a = start + ring * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const bottom = vertex(points[0]!, 1, bark(warmth));
      const top = vertex(points[points.length - 1]!, 1, bark(warmth));
      const last = start + (points.length - 1) * 2;
      indices.push(bottom, start + 1, start, top, last, last + 1);
    }
  }

  /** Three separate lanceolate needle bundles form a flattened fan, rather
   * than a skirt or a solid polygonal cushion. Each blade is a closed tetrahedron. */
  function tuft(root: Vector3, angle: number, tier: number) {
    for (let needle = 0; needle < 3; needle++) {
      const direction = angle + (needle - 1) * 0.48;
      const forward = new Vector3(Math.cos(direction), 0, Math.sin(direction));
      const across = new Vector3(-forward.z, 0, forward.x);
      const center = root.clone().addScaledVector(across, (needle - 1) * 0.035);
      const length = 0.32 + random() * 0.14;
      const points = [
        center.clone().addScaledVector(across, -0.055).add(new Vector3(0, 0.045, 0)),
        center.clone().addScaledVector(across, 0.055).add(new Vector3(0, 0.045, 0)),
        center.clone().add(new Vector3(0, -0.065, 0)),
        center.clone().addScaledVector(forward, length).add(new Vector3(0, -0.025 - random() * 0.025, 0)),
      ];
      tetrahedron(points, 0, needles(0.22 + tier / (tiers - 1) * 0.45));
    }
  }

  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1), y = tier * 0.7;
    // Broad shoulders continue near the top: no monotonically tapering cone.
    const reach = (0.72 + Math.sin(t * Math.PI) * 0.17) * (0.95 + random() * 0.1);
    const rotation = phase + tier * 2.39996 + (random() - 0.5) * 0.3;
    for (let branch = 0; branch < 3; branch++) {
      const angle = rotation + branch * Math.PI * 2 / 3 + (random() - 0.5) * 0.24;
      const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      const across = new Vector3(-direction.z, 0, direction.x);
      const end = direction.clone().multiplyScalar(reach).setY(y - 0.07);
      const radius = 0.035 * (1 - t * 0.3), root = new Vector3(0, y - 0.02, 0);
      tetrahedron([root.clone().addScaledVector(across, -radius), root.clone().addScaledVector(across, radius),
        root.clone().add(new Vector3(0, radius, 0)), end], 1, bark(0.11));
      tuft(end.clone().add(new Vector3(0, 0.06, 0)), angle + (random() - 0.5) * 0.4, tier);
    }
  }

  // Fit the leaves just like paintCrown, without stretching the bare trunk.
  let bottom = Infinity, top = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < surfaces.length; i++) {
    const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    if (surfaces[i] === 0) { bottom = Math.min(bottom, y); top = Math.max(top, y); }
  }
  const widthScale = Math.min(1, 2.7 / Math.max(maxX - minX, maxZ - minZ));
  for (let i = 0; i < surfaces.length; i++) {
    positions[i * 3]! *= widthScale;
    positions[i * 3 + 1] = height * 2 / 3 - TRUNK_HEIGHT + (positions[i * 3 + 1]! - bottom) / (top - bottom) * height / 3;
    positions[i * 3 + 2]! *= widthScale;
  }

  // The flared sleeve encloses the caller's fixed-width trunk even at 0.8x
  // crown width, then continues into the crown. Collision radius stays unchanged.
  wood([0, 2 / 3, 1 - 0.2 / height].map(t => new Vector3(0, t * height - TRUNK_HEIGHT, 0)),
    [TRUNK_RADIUS * 1.5, 0.34, 0.035], 12, true);
  for (let branch = 0; branch < 3; branch++) {
    const y = height * (0.3 + branch * 0.13) - TRUNK_HEIGHT;
    const angle = phase + branch * 2.4, length = 0.36 + random() * 0.2;
    // Short capped ends read as snapped dry stubs, with no foliage below 2/3.
    wood([new Vector3(0, y, 0), new Vector3(Math.cos(angle) * length, y - 0.12, Math.sin(angle) * length)], [0.05, 0.009]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("surface", new Float32BufferAttribute(surfaces, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // 72 trunk + 36 dry stubs + 48/tier = 348/396/444 for the shipped seeds;
  // at most 492, or 534 with the caller's unchanged 42-triangle trunk.
  return geometry;
}
