import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from "three";
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
  const height = pineHeight(seed), tiers = 6;
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

  /** Closed tapered wood; narrow longitudinal facets carry dark fissure washes.
   * Separate facet vertices keep the crack colour from bleeding across a plate. */
  function wood(points: Vector3[], radii: number[], sides = 3, cracked = false) {
    const axis = points[points.length - 1]!.clone().sub(points[0]!).normalize();
    const side = new Vector3(0, 0, 1).cross(axis).normalize();
    const up = axis.clone().cross(side).normalize();
    const offset = (j: number, ring: number) => {
      const angle = cracked ? phase + Math.floor(j / 2) * Math.PI * 4 / sides + (j % 2) * 0.07
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

  /** Closed pancakes with two inward bites in each rim. Triangulate the
   * concave caps rather than spanning the notches with a convex fan. */
  function tuft(center: Vector3, angle: number, tier: number, thickness: number) {
    const radius = 0.7 + random() * 0.07;
    const outline = [0, 45, 90, 180, 225, 270].map((degrees, i) => {
      const a = angle + degrees * Math.PI / 180;
      const r = radius * (i === 1 || i === 4 ? 0.58 + random() * 0.05 : 1);
      return new Vector2(Math.cos(a) * r, Math.sin(a) * r);
    });
    const start = surfaces.length, shade = 0.25 + tier / (tiers - 1) * 0.4;
    for (const side of [-1, 1]) for (const point of outline) {
      vertex(new Vector3(center.x + point.x, center.y + side * thickness / 2, center.z + point.y),
        0, needles(shade + side * 0.025));
    }
    for (const [a, b, c] of ShapeUtils.triangulateShape(outline, [])) {
      indices.push(start + a!, start + b!, start + c!, start + 6 + c!, start + 6 + b!, start + 6 + a!);
    }
    for (let j = 0; j < 6; j++) {
      const next = (j + 1) % 6;
      indices.push(start + j, start + 6 + j, start + next, start + next, start + 6 + j, start + 6 + next);
    }
  }

  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1), thickness = 0.43 + random() * 0.015;
    // Work in metres from the outset: fitting the whole crown afterwards would
    // stretch individual tufts and thin the branches. Leaves retain paintCrown's bounds.
    const y = height * 2 / 3 - TRUNK_HEIGHT + thickness / 2 + t * (height / 3 - thickness);
    const reach = (0.43 + Math.sin(t * Math.PI * 2 + phase) * 0.055) * (0.96 + random() * 0.08);
    const rotation = phase + tier * 2.39996 + (random() - 0.5) * 0.3;
    for (let branch = 0; branch < 3; branch++) {
      const angle = rotation + branch * Math.PI * 2 / 3 + (random() - 0.5) * 0.24;
      const end = new Vector3(Math.cos(angle) * reach, y - thickness / 2 + 0.045, Math.sin(angle) * reach);
      // Open triangular tubes: both ends are buried in the leader/needle mass.
      // Circumradii 0.065/0.05 keep even the narrowest cross-section >= 0.075 m.
      const root = new Vector3(0, y - thickness / 2 - 0.09, 0);
      const axis = end.clone().sub(root).normalize();
      const side = new Vector3(0, 1, 0).cross(axis).normalize(), up = axis.clone().cross(side);
      const start = surfaces.length;
      for (const [point, radius] of [[root, 0.065], [end, 0.05]] as const) {
        for (let j = 0; j < 3; j++) {
          const a = j * Math.PI * 2 / 3;
          vertex(point.clone().addScaledVector(side, Math.cos(a) * radius).addScaledVector(up, Math.sin(a) * radius), 1, bark(0.11));
        }
      }
      for (let j = 0; j < 3; j++) {
        const next = (j + 1) % 3;
        indices.push(start + j, start + next, start + 3 + j, start + next, start + 3 + next, start + 3 + j);
      }
      tuft(new Vector3(end.x, y, end.z), angle + (random() - 0.5) * 0.4, tier, thickness);
    }
  }

  // The flared sleeve encloses the caller's fixed-width trunk even at 0.8x
  // crown width, then continues into the crown. Collision radius stays unchanged.
  wood([0, 2 / 3, 1 - 0.2 / height].map(t => new Vector3(0, t * height - TRUNK_HEIGHT, 0)),
    [TRUNK_RADIUS * 1.8, 0.34, 0.035], 8, true);
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
  // 48 trunk + 36 dry stubs + 6 * 3 * (20 tuft + 6 branch) = 552;
  // 594 including the caller's unchanged 42-triangle trunk, with one crown draw.
  return geometry;
}
