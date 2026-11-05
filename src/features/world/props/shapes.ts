import { BoxGeometry, BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";

type Outline = readonly (readonly [number, number])[];
type Surface = 0 | 1; // Material slots: wood, paper.

/** Flat caps and one chamfer per edge, including the arrow's concave shoulders. */
function bevelPrism(outline: Outline, depth: number, bevel: number): BufferGeometry {
  const contour = outline.map(([x, y]) => new Vector2(x, y));
  const center = contour.reduce((sum, point) => sum.add(point), new Vector2()).divideScalar(contour.length);
  const inset = contour.map(point => point.clone().lerp(center, 0.045));
  const rings = [inset, contour, contour, inset];
  const depths = [-depth / 2, -depth / 2 + bevel, depth / 2 - bevel, depth / 2];
  const positions: number[] = [];
  const vertex = (ring: number, index: number) => {
    const point = rings[ring]![index]!;
    positions.push(point.x, point.y, depths[ring]!);
  };
  for (const [a, b, c] of ShapeUtils.triangulateShape(inset, [])) {
    vertex(0, c!); vertex(0, b!); vertex(0, a!);
    vertex(3, a!); vertex(3, b!); vertex(3, c!);
  }
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < contour.length; i++) {
      const next = (i + 1) % contour.length;
      vertex(ring, i); vertex(ring, next); vertex(ring + 1, next);
      vertex(ring, i); vertex(ring + 1, next); vertex(ring + 1, i);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Merge into one mesh, retaining material groups and releasing temporary parts. */
function builder() {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  return {
    add(part: BufferGeometry, surface: Surface = 0, grain: "x" | "y" = "x") {
      const vertices = part.getAttribute("position");
      const start = positions.length / 3;
      // BoxGeometry is indexed; the final geometry uses independent flat faces.
      const count = part.index?.count ?? vertices.count;
      for (let i = 0; i < count; i++) {
        const index = part.index?.getX(i) ?? i;
        const x = vertices.getX(index), y = vertices.getY(index), z = vertices.getZ(index);
        positions.push(x, y, z);
        const along = grain === "x" ? x : y;
        const across = grain === "x" ? y + z : x + z;
        // Neutral pigment only: palette hue comes exclusively from the material.
        const value = surface === 1 ? 0.99
          : 0.925 + Math.sin(across * 91 + along * 3) * 0.035 + Math.sin(across * 173 + along * 7) * 0.015;
        colors.push(value, value, value);
      }
      const previous = geometry.groups.at(-1);
      if (previous?.materialIndex === surface) previous.count += count;
      else geometry.addGroup(start, count, surface);
      part.dispose();
    },
    finish() {
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      // Like BoxGeometry, the origin is the measured bounding-box centre.
      geometry.center();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

/** Blank right-pointing board and a subtly leaning post; 88 triangles. */
export function createSignpostGeometry(): BufferGeometry {
  const mesh = builder();
  mesh.add(bevelPrism([
    [-0.13, -0.8], [0.025, -0.8], [0.09, 0.6], [-0.055, 0.58],
  ], 0.15, 0.008).translate(0, 0, -0.025), 0, "y");
  mesh.add(bevelPrism([
    [-0.60, 0.38], [0.16, 0.36], [0.16, 0.24], [0.60, 0.53],
    [0.18, 0.80], [0.18, 0.68], [-0.58, 0.69], [-0.60, 0.65],
  ], 0.09, 0.01).translate(0, 0, 0.055));
  return mesh.finish();
}

/** Three uneven planks, four splayed legs, two aprons and three blank sheets; 352 triangles. */
export function createDeskGeometry(): BufferGeometry {
  const mesh = builder();
  for (let plank = 0; plank < 3; plank++) {
    const shift = (plank - 1) * 0.233;
    const trim = plank * 0.004;
    mesh.add(bevelPrism([
      [-0.69 + trim, -0.111], [0.66, -0.114], [0.70 - trim, -0.09], [0.694 - trim, 0.089],
      [0.67, 0.114], [-0.67, 0.109], [-0.70 + trim, 0.084], [-0.697 + trim, -0.084],
    ], 0.08, 0.009).rotateX(-Math.PI / 2).translate(0, 0.31, shift));
  }
  for (const x of [-0.55, 0.55]) {
    for (const z of [-0.24, 0.24]) {
      const leg = bevelPrism([
        [-0.055, -0.4], [0.055, -0.4], [0.047, 0.30], [-0.049, 0.30],
      ], 0.105, 0.006);
      const vertices = leg.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const splay = (0.30 - vertices.getY(i)) / 0.70;
        vertices.setXYZ(i, vertices.getX(i) + x + Math.sign(x) * splay * 0.028,
          vertices.getY(i), vertices.getZ(i) + z + Math.sign(z) * splay * 0.018);
      }
      mesh.add(leg, 0, "y");
    }
  }
  for (const z of [-0.24, 0.24]) {
    mesh.add(new BoxGeometry(1.13, 0.10, 0.045).translate(0, 0.22, z));
  }
  // Small thicknesses avoid coplanar flicker; sheets overlap on the solid middle plank.
  mesh.add(new BoxGeometry(0.34, 0.006, 0.25).rotateY(0.12).translate(-0.24, 0.353, 0.035), 1);
  mesh.add(new BoxGeometry(0.32, 0.006, 0.24).rotateY(-0.08).translate(-0.22, 0.359, 0.026), 1);
  mesh.add(new BoxGeometry(0.28, 0.006, 0.21).rotateY(-0.19).translate(0.28, 0.353, -0.035), 1);
  return mesh.finish();
}
