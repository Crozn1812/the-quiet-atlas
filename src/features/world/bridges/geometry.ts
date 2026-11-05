import { BufferGeometry, Float32BufferAttribute } from "three";

function geometry(positions: number[], indices: number[]): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute("position", new Float32BufferAttribute(positions, 3));
  result.setIndex(indices);
  const flat = result.toNonIndexed();
  result.dispose();
  flat.computeVertexNormals();
  // Instance colours supply palette blends; neutral vertex colours preserve them.
  flat.setAttribute("color", new Float32BufferAttribute(Array(flat.getAttribute("position").count * 3).fill(1), 3));
  flat.computeBoundingBox();
  flat.computeBoundingSphere();
  return flat;
}

/** Twenty triangles, with two small bevels along the top of each transverse timber. */
export function createPlankGeometry(): BufferGeometry {
  const section = [[-0.5, -1], [0.5, -1], [0.5, -0.2], [0.48, 0], [-0.48, 0], [-0.5, -0.2]];
  const positions = [-0.5, 0.5].flatMap(z => section.flatMap(([x, y]) => [x!, y!, z]));
  const indices: number[] = [];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    indices.push(i, j, i + 6, j, j + 6, i + 6);
  }
  for (let i = 1; i < 5; i++) indices.push(0, i + 1, i, 6, i + 6, i + 7);
  return geometry(positions, indices);
}

/** A bowed square bamboo/wood beam, shared by posts and handrails: twenty triangles. */
export function createRailGeometry(): BufferGeometry {
  const positions = [-0.5, 0, 0.5].flatMap(y => [
    [-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5],
  ].flatMap(([x, z]) => [x! + (y === 0 ? 0.08 : 0), y, z! + (y === 0 ? 0.05 : 0)]));
  const indices = [0, 2, 1, 0, 3, 2, 8, 9, 10, 8, 10, 11];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    const a = row * 4 + i, b = row * 4 + (i + 1) % 4;
    indices.push(a, b, a + 4, b, b + 4, a + 4);
  }
  return geometry(positions, indices);
}

export function createMossGeometry(): BufferGeometry {
  return geometry([-0.5, 0, -0.5, -0.4, 0, 0.5, 0.5, 0, 0.32, 0.3, 0, -0.4], [0, 1, 2, 0, 2, 3]);
}
