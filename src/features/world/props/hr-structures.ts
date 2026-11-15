import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, type WebGLRenderer } from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { bakedPropQuality } from "./batched";
import { acquireHrProp, bindHrProps } from "./hr-props";
import { Vector3 } from "three";
import { usesSoftwareRasterizer } from "../foliage/hr-capabilities";

/** Keep the authored solid and every walking/contact face. Only the render copy
 * gains crease normals and photographic base/normal/roughness atlas samples.
 * No collision mesh, group transform or interaction anchor is modified.
 */
export function hrStructureGeometry(source: BufferGeometry, wood: boolean) {
  const geometry = toCreasedNormals(source, wood ? 0.45 : 0.8);
  const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal"), uv: number[] = [], tangents: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), face = new Vector3(), edge = new Vector3();
  const normal = new Vector3(), tangent = new Vector3(), bitangent = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    face.crossVectors(edge.subVectors(b, a), bitangent.subVectors(c, a));
    const x = Math.abs(face.x), y = Math.abs(face.y), z = Math.abs(face.z);
    const uAxis = x > y && x > z ? "z" : "x", vAxis = y > x && y > z ? "z" : "y";
    const vertices = [a, b, c], us = vertices.map(v => v[uAxis]), vs = vertices.map(v => v[vAxis]);
    const minU = Math.min(...us), minV = Math.min(...vs);
    // One projection per face. Wrapping individual vertices or choosing axes
    // from smoothed vertex normals collapses UV triangles and normal tangents.
    // Fit each face inside its atlas tile without crossing a gutter.
    const repeat = Math.min(wood ? 0.65 : 0.45, 0.98 / Math.max(1, Math.max(...us) - minU, Math.max(...vs) - minV));
    const offsetU = ((minU * repeat % 1 + 1) % 1) * (0.98 - (Math.max(...us) - minU) * repeat);
    const offsetV = ((minV * repeat % 1 + 1) % 1) * (0.98 - (Math.max(...vs) - minV) * repeat);
    for (let j = 0; j < 3; j++) {
      uv.push((wood ? 0.5 : 0) + 0.006 + (offsetU + (us[j]! - minU) * repeat) * 0.488,
        0.006 + (offsetV + (vs[j]! - minV) * repeat) * 0.488);
      normal.fromBufferAttribute(n, i + j);
      tangent.set(uAxis === "x" ? 1 : 0, 0, uAxis === "z" ? 1 : 0).addScaledVector(normal, -normal[uAxis]);
      if (tangent.lengthSq() < 1e-10) tangent.crossVectors(normal, Math.abs(normal.y) < 0.9 ? b.set(0, 1, 0) : b.set(1, 0, 0));
      tangent.normalize(); bitangent.crossVectors(normal, tangent);
      tangents.push(tangent.x, tangent.y, tangent.z, bitangent[vAxis] < 0 ? -1 : 1);
    }
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setAttribute("tangent", new Float32BufferAttribute(tangents, 4));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function bindHrStructure(mesh: Mesh, wood: boolean) {
  const before = mesh.onBeforeRender;
  const copies = new Map<BufferGeometry, BufferGeometry>();
  let detail: MeshStandardMaterial | undefined;
  const empty = new BufferGeometry(), render = new Mesh(empty, mesh.material);
  render.name = "hr-structural-render"; render.visible = false; render.raycast = () => {};
  let lease: ReturnType<typeof acquireHrProp> | undefined, disposed = false;
  mesh.onBeforeRender = function (renderer, scene, camera, ...args) {
    before.call(this, renderer, scene, camera, ...args);
    const source = mesh.geometry;
    const high = bakedPropQuality(mesh) === "High" && !usesSoftwareRasterizer(renderer);
    if (high && !lease && renderer.domElement?.closest('[data-world-build="done"][data-world-intro="done"][data-world-paused="false"]')) {
      lease = acquireHrProp(renderer, wood ? "hr-prop-log-moss" : "hr-rock-river");
      void lease.ready.then(asset => {
        if (disposed) return;
        detail = (asset.lods[0]![0]!.material as MeshStandardMaterial).clone();
        detail.vertexColors = false; detail.color.setScalar(mesh.userData.milestonesSurface === "future" ? 1 : 0.88);
        detail.name = wood ? "hr-structural-wood" : "hr-structural-stone";
        // The contact solid still owns depth/shadows/interactions. A separate
        // render child keeps each normal-mapped material paired with its UVs
        // and tangents even when a deferred controller replaces the solid.
        // Swapping geometry/material inside onBeforeRender is too late for
        // Three's captured render item and can poison an HDR frame with NaNs.
        detail.polygonOffset = true; detail.polygonOffsetFactor = -1; detail.polygonOffsetUnits = -1;
      }).catch(error => { mesh.userData.hrStructureError = String(error); });
    }
    if (high && detail && source.getAttribute("position")?.count) {
      let geometry = copies.get(source);
      if (!geometry) { geometry = hrStructureGeometry(source, wood); copies.set(source, geometry); }
      geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
      render.geometry = geometry; render.material = detail; render.receiveShadow = mesh.receiveShadow;
      if (!render.parent) mesh.add(render);
      render.visible = true;
    } else render.visible = false;
  };
  return () => {
    if (disposed) return; disposed = true;
    mesh.onBeforeRender = before; render.removeFromParent(); empty.dispose();
    copies.forEach(geometry => geometry.dispose()); copies.clear(); detail?.dispose(); lease?.release();
  };
}

/** Dressing is the zone-owned lifecycle anchor. Discover once after assembly,
 * before streaming; Roots is explicitly excluded from this ticket's rollout.
 */
export function bindHrZoneStructures(anchor: Mesh) {
  const after = anchor.onAfterRender, releases: (() => void)[] = [];
  let started = false, disposed = false;
  anchor.onAfterRender = function (renderer: WebGLRenderer, ...args) {
    after.call(this, renderer, ...args);
    if (started || disposed || !anchor.parent || !/^(first-light-clearing|milestones-hillside|old-trail|horizon-overlook|quiet-shore|last-postcard)$/.test(anchor.parent.name)) return;
    started = true;
    anchor.parent.traverse(object => {
      if (!(object instanceof Mesh) || object === anchor) return;
      const wood = object.userData.photoSurface === "bark" || /^(first-light-wood|quiet-shore-wood|last-postcard-wood|weathered-trail-timber)$/.test(object.name);
      const stone = object.name === "rock-stack-stones" || /^(first-light-stone|last-postcard-stone)$/.test(object.name);
      if (wood || stone || object.name === "horizon-natural") releases.push(bindHrStructure(object, wood || object.name === "horizon-natural"));
      if (object.name === "old-trail-r1-tree") {
        object.geometry.computeBoundingBox();
        const bounds = object.geometry.boundingBox!, size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
        releases.push(bindHrProps(object, [{ asset: "hr-tree-spreading-crown", x: center.x, z: center.z, baseY: bounds.min.y,
          size: [size.x, size.y, size.z], yaw: 0, tint: 1 }], () => 0).dispose);
      }
    });
  };
  return () => { if (disposed) return; disposed = true; anchor.onAfterRender = after; releases.reverse().forEach(release => release()); };
}
