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

/** Bowed timber with eight chamfered arrises; same contact envelope and origin. */
export function createRailGeometry(): BufferGeometry {
  const section=[[-.38,-.5],[-.5,-.38],[-.5,.38],[-.38,.5],[.38,.5],[.5,.38],[.5,-.38],[.38,-.5]];
  const positions = [-0.5, 0, 0.5].flatMap(y => [
    ...section,
  ].flatMap(([x, z]) => [x! + (y === 0 ? 0.08 : 0), y, z! + (y === 0 ? 0.05 : 0)]));
  const indices:number[]=[];
  for(let i=1;i<7;i++)indices.push(0,i+1,i,16,16+i,17+i);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
    const a = row * 8 + i, b = row * 8 + (i + 1) % 8;
    indices.push(a, b, a + 8, b, b + 8, a + 8);
  }
  return geometry(positions, indices);
}

export function createMossGeometry(): BufferGeometry {
  return geometry([-0.5, 0, -0.5, -0.4, 0, 0.5, 0.5, 0, 0.32, 0.3, 0, -0.4], [0, 1, 2, 0, 2, 3]);
}
