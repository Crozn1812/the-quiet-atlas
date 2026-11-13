import { BoxGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Mesh, Object3D, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PALETTE } from "./art/palette";
import { PATH_CLEARANCE, ZONE_CLEARANCE } from "./foliage/scatter";
import { pathLength, pathPointAt } from "./layout/path";
import { ZONES } from "./layout/zones";
import { createRampMaterial } from "./materials/ramp";
import { createPostGeometry } from "./props/wood";
import { createRockStack } from "./props/rocks";
import { waterLevelAt, worldHeight } from "./terrain/height";
import { nearestPath } from "./terrain/samples";

/** Fixed route-distance anchors; the small shoulder search is deterministic. */
export function createWaymarkLayout() {
  const spacing = 35 / pathLength();
  return [0.38, 0.38 + spacing, 0.53, 0.53 + spacing, 0.53 + 2 * spacing].map((t, i) => {
    const p = pathPointAt(t);
    const f = pathPointAt(t + 0.001).sub(pathPointAt(t - 0.001)).normalize();
    const kind = i < 2 ? "post" : "cairn";
    const width = kind === "post" ? 0.4 : 1.25;
    for (const side of [1, -1]) for (const offset of [5, 6, 7, 8]) {
      const x = p.x - f.z * offset * side, z = p.z + f.x * offset * side;
      const y = worldHeight(x, z);
      if (nearestPath(x, z).distance <= PATH_CLEARANCE + width / 2
        || y <= waterLevelAt(z) + 0.1
        || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) <= zone.radius + ZONE_CLEARANCE + width / 2)) continue;
      return { segment: i < 2 ? 0 : 1, t, x, y, z, kind, width, height: kind === "post" ? 1.4 + i * 0.1 : 0.9 + (i - 2) * 0.1, yaw: i * 0.73 };
    }
    throw new Error(`No dry, clear waymark shoulder at ${t}`);
  });
}

/** Two instanced batches, shared palette ramp, no text or printed direction. */
export function createWaymarks() {
  const layout = createWaymarkLayout();
  const group = new Group(); group.name = "waymarks";
  const wood = createPostGeometry(1, 212);
  const ribbonBox = new BoxGeometry(0.23, 0.055, 0.19);
  const ribbon = ribbonBox.toNonIndexed(); ribbonBox.dispose();
  ribbon.deleteAttribute("uv");
  ribbon.translate(0.035, 0.85, 0);
  const flower = new Color(PALETTE.flower);
  ribbon.setAttribute("color", new Float32BufferAttribute(Array.from({ length: ribbon.getAttribute("position").count }, () => flower.toArray()).flat(), 3));
  const post = mergeGeometries([wood, ribbon])!;
  post.computeBoundingBox(); post.computeBoundingSphere();
  wood.dispose(); ribbon.dispose();
  const stack = createRockStack(214);
  const stone = (stack.group.children[0] as Mesh).geometry.clone();
  stack.dispose();
  stone.computeBoundingBox();
  stone.scale(1, 1 / stone.boundingBox!.max.y, 1);
  const material = createRampMaterial(0xffffff, { steps: 4, soft: true }); material.vertexColors = true;
  const meshes: InstancedMesh[] = [];
  for (const [kind, geometry] of [["post", post], ["cairn", stone]] as const) {
    const marks = layout.filter(mark => mark.kind === kind);
    const mesh = new InstancedMesh(geometry, material, marks.length);
    mesh.name = `waymark-${kind}`; mesh.receiveShadow = true;
    const transform = new Object3D();
    marks.forEach((mark, i) => {
      transform.position.set(mark.x, mark.y, mark.z); transform.rotation.y = mark.yaw;
      transform.scale.set(1 - i * 0.06, mark.height, 1 - i * 0.04); transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh); meshes.push(mesh);
  }
  const colliders = layout.map(mark => ({ center: new Vector3(mark.x, mark.y + mark.height / 2, mark.z), size: new Vector3(mark.width, mark.height, mark.width) }));
  let disposed = false;
  return { group, layout, colliders, dispose() {
    if (disposed) return; disposed = true;
    meshes.forEach(mesh => mesh.dispose()); post.dispose(); stone.dispose(); material.dispose();
    group.removeFromParent(); group.clear();
  } };
}

