import { BufferGeometry, Color, Float32BufferAttribute, type Vector3 } from "three";
import { PALETTE, type PaletteKey } from "../art/palette";

// All meshes share a palette-white ramp. Compensate its tint so the final
// unlit pigment is exactly the requested PALETTE colour (plus neutral grain).
const base = new Color(PALETTE.laneWhite);

export function roadGeometryBuilder() {
  const positions: number[] = [];
  const colors: number[] = [];
  const vertex = (x: number, y: number, z: number, color: Color, shade: number) => {
    positions.push(x, y, z);
    colors.push(color.r * shade / base.r, color.g * shade / base.g, color.b * shade / base.b);
  };
  return {
    triangle(a: Vector3, b: Vector3, c: Vector3, pigment: PaletteKey | readonly [Color, Color, Color], shade = 1) {
      const colors = typeof pigment === "string" ? [new Color(PALETTE[pigment])] : pigment;
      [a, b, c].forEach((point, i) => vertex(point.x, point.y, point.z, colors[i] ?? colors[0]!, shade));
    },
    add(part: BufferGeometry, pigment: PaletteKey, grain = false) {
      const position = part.getAttribute("position");
      const color = new Color(PALETTE[pigment]);
      const count = part.index?.count ?? position.count;
      for (let i = 0; i < count; i++) {
        const index = part.index?.getX(i) ?? i;
        const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
        const shade = grain ? 0.94 + 0.035 * Math.sin(x * 113 + z * 83 + y * 7) : 1;
        vertex(x, y, z, color, shade);
      }
      part.dispose();
    },
    finish() {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}
