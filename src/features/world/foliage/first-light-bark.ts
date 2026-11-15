import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { bakedPropQuality } from "../props/batched";
import { surfaceComponents } from "../props/timber-surface";
import { acquireHrTree } from "./hr-library";
import { usesSoftwareRasterizer } from "./hr-capabilities";

/** Extract only brown wood from the authored foliage batch. Leaves, flowers,
 * the contact solid and interaction rays retain their existing geometry. */
export function firstLightBarkGeometry(source: BufferGeometry, pigment: { r: number; g: number; b: number }) {
  const flat = source.index ? source.toNonIndexed() : source;
  const p = flat.getAttribute("position"), color = flat.getAttribute("color");
  const positions: number[] = [], uv: number[] = [];
  const point = new Vector3(), axis = new Vector3(), across = new Vector3(), around = new Vector3();
  for (const component of surfaceComponents(flat)) {
    const i = component.vertices[0]!;
    const r = color.getX(i) * pigment.r, g = color.getY(i) * pigment.g, b = color.getZ(i) * pigment.b;
    if (r < g * 1.05 || g < b * 1.02) continue;
    // The farthest pair describes each cylindrical branch, independent of the
    // zone rotation. Project V along that branch; U wraps its circumference.
    let start = new Vector3().fromBufferAttribute(p, i);
    const end = start.clone();
    for (let pass = 0; pass < 2; pass++) {
      let distance = -1;
      for (const vertex of component.vertices) {
        point.fromBufferAttribute(p, vertex);
        const next = point.distanceToSquared(start);
        if (next > distance) { distance = next; end.copy(point); }
      }
      if (pass === 0) start = end.clone();
    }
    axis.subVectors(end, start).normalize();
    across.set(0, 1, 0); if (Math.abs(axis.y) > 0.95) across.set(1, 0, 0);
    across.cross(axis).normalize(); around.crossVectors(axis, across);
    const size = component.bounds.getSize(new Vector3());
    const diameter = [size.x, size.y, size.z].sort((a, b) => a - b)[1]!;
    for (let triangle = 0; triangle < component.vertices.length; triangle += 3) {
      const coordinates: [number, number][] = [];
      for (let corner = 0; corner < 3; corner++) {
        const index = component.vertices[triangle + corner]!;
        point.fromBufferAttribute(p, index); positions.push(point.x, point.y, point.z);
        point.sub(start);
        coordinates.push([Math.atan2(point.dot(around), point.dot(across)) / (2 * Math.PI) + 0.5, point.dot(axis)]);
      }
      // Unwrap the seam within each triangle, avoiding stretched diagonal bark.
      const seam = Math.max(...coordinates.map(c => c[0])) - Math.min(...coordinates.map(c => c[0])) > 0.5;
      coordinates.forEach(([u, v]) => uv.push((u + (seam && u < 0.5 ? 1 : 0)) * Math.max(0.5, diameter * Math.PI), v));
    }
  }
  if (flat !== source) flat.dispose();
  const raw = new BufferGeometry();
  raw.setAttribute("position", new Float32BufferAttribute(positions, 3));
  raw.setAttribute("uv", new Float32BufferAttribute(uv, 2)); raw.computeVertexNormals();
  const geometry = positions.length ? toCreasedNormals(raw, 0.8) : raw;
  if (geometry !== raw) raw.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

/** A renderer lease reuses the already streamed, licensed pine-bark PBR maps.
 * Source geometry may change when the independent fern adapter finishes. */
export function bindFirstLightBark(mesh: Mesh) {
  const before = mesh.onBeforeRender, cache = new Map<BufferGeometry, BufferGeometry>();
  const empty = new BufferGeometry(), render = new Mesh(empty, mesh.material);
  render.name = "first-light-authored-bark"; render.visible = false; render.raycast = () => {};
  mesh.add(render);
  let lease: ReturnType<typeof acquireHrTree> | undefined, detail: MeshStandardMaterial | undefined, disposed = false;
  mesh.onBeforeRender = function (renderer, scene, camera, ...args) {
    before.call(this, renderer, scene, camera, ...args);
    const high = bakedPropQuality(mesh) === "High" && !usesSoftwareRasterizer(renderer);
    if (high && !lease && renderer.domElement?.closest('[data-world-build="done"][data-world-intro="done"]')) {
      lease = acquireHrTree(renderer, "hr-tree-spreading-crown", 0);
      void lease.ready.then(asset => {
        if (disposed) return;
        const bark = asset.parts.find(p => !p.leaf && !p.vine)!;
        detail = (bark.material as MeshStandardMaterial).clone();
        detail.vertexColors = false; detail.color.setScalar(1); detail.roughness = 0.94;
        detail.polygonOffset = true; detail.polygonOffsetFactor = -2; detail.polygonOffsetUnits = -2;
      }).catch(() => {});
    }
    if (high && detail && !Array.isArray(mesh.material) && "color" in mesh.material) {
      let geometry = cache.get(mesh.geometry);
      if (!geometry) {
        geometry = firstLightBarkGeometry(mesh.geometry, (mesh.material as MeshStandardMaterial).color);
        cache.set(mesh.geometry, geometry);
      }
      render.geometry = geometry; render.material = detail; render.visible = true;
    } else render.visible = false;
  };
  return () => {
    if (disposed) return; disposed = true; mesh.onBeforeRender = before;
    render.removeFromParent(); empty.dispose(); cache.forEach(g => g.dispose()); detail?.dispose(); lease?.release();
  };
}
