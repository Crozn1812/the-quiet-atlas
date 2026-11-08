import { BufferGeometry, CircleGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry, Mesh, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "../art/palette";
import { riverPointAt, riverTangentAt } from "../layout/river";
import { createRampMaterial } from "../materials/ramp";
import { createRockGeometry } from "../props/rocks";
import { waterLevelAt } from "./height";
import { createWaterMaterial } from "../water/material";
import { createWaterSurface } from "../water/surface";

/** World-space spring: two fractured shoulders leave a wet cleft below an overhang.
 * Static geometry only; the existing river owns downstream animation. */
export function createSpring() {
  const group = new Group();
  group.name = "first-light-spring";
  const origin = riverPointAt(0), forward = riverTangentAt(0);
  const right = new Vector3(-forward.z, 0, forward.x);
  const level = waterLevelAt(origin.z);
  const colliders: { center: Vector3; radius: number; halfHeight: number }[] = [];
  const pieces = [
    // across, downstream, base, width, height, depth
    [-2.6, -2.8, -0.7, 4.1, 3.8, 4],
    [2.5, -3.8, -0.6, 3.5, 4.6, 4.1],
    [-2, -4, 2.1, 3.8, 3.6, 3.4],
    [1.2, -4.8, 3, 4, 3.8, 3.8],
    [-0.1, -2.7, 1.8, 3.3, 2.2, 2.8],
    [-4, -2, -0.6, 2.4, 2.1, 3.1],
    [3.8, -3, -0.6, 2.1, 2.6, 2.4],
  ] as const;
  const geometries = pieces.map(([across, along, base, width, height, depth], i) => {
    const geometry = createRockGeometry("boulder", 802 + i, true);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const size = bounds.getSize(new Vector3());
    geometry.translate(0, -bounds.min.y, 0).scale(width / size.x, height / size.y, depth / size.z);
    const positions = geometry.getAttribute("position");
    for (let v = 0; v < positions.count; v++) {
      positions.setX(v, positions.getX(v) + positions.getY(v) * (i % 2 ? -0.19 : 0.23));
      positions.setZ(v, positions.getZ(v) + positions.getY(v) * 0.12);
    }
    geometry.rotateY(i * 0.63); geometry.computeVertexNormals();
    // Warm broad faces and mossy upward ledges share the existing draw.
    const colors = geometry.getAttribute("color"), normals = geometry.getAttribute("normal");
    const stone = new Color(PALETTE.rock).lerp(new Color(PALETTE.sand), 0.24);
    const moss = new Color(PALETTE.rock).lerp(new Color(PALETTE.grass), 0.65);
    for (let vertex = 0; vertex < colors.count; vertex++) {
      const pigment = normals.getY(vertex) > 0.3 ? moss : stone;
      colors.setXYZ(vertex, pigment.r, pigment.g, pigment.b);
    }
    const center = origin.clone().addScaledVector(right, across).addScaledVector(forward, along);
    center.y = level + base;
    geometry.rotateY(Math.atan2(right.z * -1, right.x)).translate(center.x, center.y, center.z);
    // Inscribed cylinders leave the visible cleft open and avoid invisible walls on the route.
    colliders.push({ center: center.clone().add(new Vector3(0, height / 2, 0)),
      radius: Math.min(width, depth) * 0.38, halfHeight: height / 2 });
    return geometry;
  });
  const rockGeometry = mergeGeometries(geometries)!;
  geometries.forEach(geometry => geometry.dispose());
  const rockMaterial = createRampMaterial(0xffffff);
  rockMaterial.vertexColors = true;
  const cliff = new Mesh(rockGeometry, rockMaterial);
  cliff.name = "spring-mossy-cliff";
  cliff.castShadow = cliff.receiveShadow = true;
  group.add(cliff);
  const poolGeometry = new CircleGeometry(2.2, 12).rotateX(-Math.PI / 2);
  const rim = poolGeometry.getAttribute("position");
  for (let i = 1; i < rim.count; i++) {
    const factor = 1 + 0.09 * Math.sin(i * 2.4);
    rim.setXYZ(i, rim.getX(i) * factor, rim.getY(i), rim.getZ(i) * factor * 0.86);
  }
  poolGeometry.translate(origin.x, level + 0.01, origin.z);
  const poolSurface = createWaterSurface(poolGeometry, createWaterMaterial("Balanced"));
  const pool = poolSurface.mesh;
  pool.name = "spring-cleft-pool";
  group.add(pool);
  // A short falling sheet emerges from beneath the cap, meeting the pool
  // before the animated ribbon takes over. Its lower end is submerged.
  const vertices: number[] = [];
  const rows = [[-2.6, 1.65], [-2.15, 1.5], [-1.7, 0.8], [-1.2, 0.15], [-0.4, -0.04]];
  const indices: number[] = [], uvs: number[] = [];
  for (const [row, [along, rise]] of rows.entries()) {
    for (const side of [-1, 1]) {
      const width = 0.38 + row * 0.09;
      const p = origin.clone().addScaledVector(forward, along!).addScaledVector(right, side * width);
      vertices.push(p.x, level + rise!, p.z);
      uvs.push((side + 1) / 2, row * 0.6);
      vertices.push(p.x, level + rise! - 0.18, p.z);
      uvs.push((side + 1) / 2, row * 0.6);
    }
    if (row) {
      const a = (row - 1) * 4, b = row * 4;
      indices.push(a, a + 2, b, a + 2, b + 2, b,
        a + 1, a, b + 1, a, b, b + 1,
        a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    }
  }
  const fallGeometry = new BufferGeometry();
  fallGeometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  fallGeometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  fallGeometry.setIndex(indices);
  fallGeometry.computeVertexNormals();
  const fallSurface = createWaterSurface(fallGeometry, createWaterMaterial("Balanced"));
  const fall = fallSurface.mesh;
  fall.name = "spring-cleft-flow";
  group.add(fall);
  const foamGeometry = new IcosahedronGeometry(1, 0);
  const foamMaterial = createRampMaterial(new Color(PALETTE.mist).getHex());
  const foamParts: BufferGeometry[] = [], pebbleParts: BufferGeometry[] = [];
  for (let i = 0; i < 18; i++) {
    const foam = i < 7;
    const mesh = new Mesh(foamGeometry, foam ? foamMaterial : rockMaterial);
    const angle = i * 2.4, radius = 2.2 + 0.15 * Math.sin(i);
    mesh.position.copy(origin).addScaledVector(right, foam ? (i - 3) * 0.21 : Math.cos(angle) * radius)
      .addScaledVector(forward, foam ? -1 + 0.2 * Math.sin(i) : Math.sin(angle) * radius * 0.86);
    mesh.position.y = level + (foam ? 0.045 : -0.06);
    mesh.scale.set(foam ? 0.24 : 0.4, foam ? 0.07 : 0.24, foam ? 0.3 : 0.38);
    mesh.updateMatrix();
    (foam ? foamParts : pebbleParts).push(foamGeometry.clone().applyMatrix4(mesh.matrix));
  }
  const foamMerged = mergeGeometries(foamParts)!, pebbleMerged = mergeGeometries(pebbleParts)!;
  [...foamParts, ...pebbleParts].forEach(part => part.dispose());
  // Pebbles share the cliff's vertex-colour draw: the complete source stays
  // within four draws, including both water surfaces and the pale foam.
  pebbleMerged.deleteAttribute("uv");
  const pebbleColor = new Color(PALETTE.rock), pigments: number[] = [];
  for (let i = 0; i < pebbleMerged.getAttribute("position").count; i++) pigments.push(pebbleColor.r, pebbleColor.g, pebbleColor.b);
  pebbleMerged.setAttribute("color", new Float32BufferAttribute(pigments, 3));
  const solidGeometry = mergeGeometries([rockGeometry, pebbleMerged])!;
  cliff.geometry = solidGeometry;
  group.add(new Mesh(foamMerged, foamMaterial));
  const surfaces = [poolSurface, fallSurface];
  let disposed = false;
  return { group, cliff, colliders, origin, surfaces,
    dispose() {
      if (disposed) return;
      disposed = true;
      rockGeometry.dispose(); rockMaterial.dispose(); surfaces.forEach(surface => surface.dispose());
      foamGeometry.dispose(); foamMerged.dispose(); pebbleMerged.dispose(); solidGeometry.dispose(); foamMaterial.dispose();
      group.removeFromParent(); group.clear();
    },
  };
}
