import { BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Object3D, Vector2, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { worldHeight } from "../terrain/height";
import { ZONES } from "../layout/zones";
import { createBroadleafBush, createFern } from "./ground";
import { isGroundCoverExcluded } from "./scatter";
import { installHrMaterial } from "./hr-material";
import { treeRandom, type HrSite } from "./hr-variation";
import { bindHrProps } from "../props/hr-props";

function saplingGeometry() {
  const stem = new CylinderGeometry(0.009, 0.027, 1.8, 7, 4).translate(0, 0.9, 0);
  stem.setAttribute("color", new Float32BufferAttribute(Array.from({ length: stem.getAttribute("position").count }, () => [0.13, 0.085, 0.04]).flat(), 3));
  const leaves = new BufferGeometry(), positions: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let i = 0; i < 19; i++) {
    const angle = i * 2.39996, height = 0.45 + i * 0.065, length = 0.28 + Math.sin(i * 1.3) * 0.08;
    const base = positions.length / 3;
    for (const [r, y, side] of [[0, height, 0], [length * 0.5, height + 0.08, -0.09], [length, height + 0.02, 0], [length * 0.5, height - 0.02, 0.09], [length * 0.48, height + 0.03, 0]]) {
      positions.push(Math.cos(angle) * r! - Math.sin(angle) * side!, y!, Math.sin(angle) * r! + Math.cos(angle) * side!);
      colors.push(0.18 + i % 3 * 0.025, 0.31 + i % 4 * 0.025, 0.075);
    }
    indices.push(base, base + 1, base + 4, base + 1, base + 2, base + 4, base + 2, base + 3, base + 4, base + 3, base, base + 4);
  }
  leaves.setAttribute("position", new Float32BufferAttribute(positions, 3)); leaves.setAttribute("color", new Float32BufferAttribute(colors, 3));
  leaves.setIndex(indices); leaves.computeVertexNormals();
  // Neither material uses UVs; identical attributes permit one sapling draw.
  stem.deleteAttribute("uv");
  const geometry = mergeGeometries([stem, leaves])!; stem.dispose(); leaves.dispose(); return geometry;
}

/** Tree-rooted plant communities complement the existing streamed rotten logs
 * and ground litter. Visual only; all walking/zone/river clearances are retained. */
export function createHrUnderstorey(sites: readonly HrSite[], clock: Vector2) {
  const group = new Group(); group.name = "hr-tree2-understorey";
  const nodes: { x: number; y: number; z: number; scale: number; yaw: number; kind: number }[] = [];
  for (const site of sites) for (let i = 0; i < 5; i++) {
    const angle = treeRandom(site.x, site.z, 130 + i) * Math.PI * 2, radius = 1.1 + treeRandom(site.x, site.z, 140 + i) * 3.3;
    const x = site.x + Math.sin(angle) * radius, z = site.z + Math.cos(angle) * radius;
    if (isGroundCoverExcluded(x, z, [], 0.8) || ZONES.some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < zone.radius + 1)) continue;
    nodes.push({ x, y: worldHeight(x, z) - 0.03, z, scale: 0.7 + treeRandom(x, z, 1) * 0.65, yaw: angle, kind: i < 3 ? 0 : i === 3 ? 1 : 2 });
  }
  const meshes = [createFern(1403, { detail: "high" }), createBroadleafBush(1607), saplingGeometry()].map((geometry, kind) => {
    const count = nodes.filter(n => n.kind === kind).length;
    geometry.setAttribute("hrTint", new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3));
    geometry.setAttribute("hrSeed", new InstancedBufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute("hrFade", new InstancedBufferAttribute(new Float32Array(count).fill(1), 1));
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.91, side: DoubleSide });
    installHrMaterial(material, clock, true);
    const mesh = new InstancedMesh(geometry, material, count); mesh.count = 0; mesh.receiveShadow = true; group.add(mesh); return mesh;
  });
  const geometries = meshes.map(mesh => mesh.geometry);
  const bindings = meshes.map((mesh, kind) => bindHrProps(mesh, nodes.filter(node => node.kind === kind).map(node => ({
    asset: kind === 0 ? "hr-prop-fern-arching" : kind === 1 ? "hr-prop-bush-broadleaf" : "hr-tree-slender-upright",
    x: node.x, z: node.z, baseY: node.y, size: kind === 2 ? [node.scale * 0.8, node.scale * 1.8, node.scale * 0.8] : [node.scale * 1.1, node.scale * 0.9, node.scale * 1.1],
    yaw: node.yaw, tint: 1,
  })), worldHeight, undefined, undefined, { minimumLod: kind === 2 ? 1 : 0, radius: 32 }));
  const transform = new Object3D();
  const lastEye = new Vector3(Infinity, Infinity, Infinity);
  let lastHigh: boolean | undefined;
  return { group,
    update(eye: Vector3, high: boolean) {
      if (lastHigh === high && lastEye.distanceToSquared(eye) < 0.25) return;
      lastEye.copy(eye); lastHigh = high;
      meshes.forEach(m => { m.count = 0; });
      for (const node of nodes) {
        if (Math.hypot(eye.x - node.x, eye.z - node.z) > (high ? 48 : 30)) continue;
        const mesh = meshes[node.kind]!;
        transform.position.set(node.x, node.y, node.z); transform.rotation.set(0, node.yaw, 0); transform.scale.setScalar(node.scale); transform.updateMatrix();
        mesh.setMatrixAt(mesh.count, transform.matrix); geometries[node.kind]!.getAttribute("hrSeed").setX(mesh.count, treeRandom(node.x, node.z, 3)); mesh.count++;
      }
      for (const [i, mesh] of meshes.entries()) {
        mesh.instanceMatrix.needsUpdate = true; geometries[i]!.getAttribute("hrSeed").needsUpdate = true;
        mesh.computeBoundingSphere(); if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.15;
      }
    },
    dispose() { bindings.forEach(binding => binding.dispose()); group.removeFromParent(); for (const mesh of meshes) { mesh.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); },
  };
}
