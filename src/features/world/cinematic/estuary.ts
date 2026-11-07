import type { Mesh, ShaderMaterial } from "three";
import { riverPointAt } from "../layout/river";
import { SEA_INLAND_OVERLAP } from "../water/sea";

/** The river's wide final ribbon sits centimetres above the sea and can cover it
 * with dark triangles. During the coast film the sea owns this shared surface.
 * Keep the original geometry/material and restore its draw range at handoff. */
export function createEndingEstuaryMask() {
  const originals = new Map<Mesh, { start: number; count: number }>();
  const shores = new Map<ShaderMaterial, number>();
  const seaNear = riverPointAt(1).z + SEA_INLAND_OVERLAP;
  function restore() {
    for (const [mesh, range] of originals) mesh.geometry.setDrawRange(range.start, range.count);
    originals.clear();
    for (const [material, value] of shores) material.uniforms.uHasShore!.value = value;
    shores.clear();
  }
  return {
    update(meshes: readonly Mesh[], playing: boolean) {
      if (!playing) { restore(); return; }
      for (const mesh of meshes) {
        if (mesh.name.startsWith("painted-sea-")) {
          const material = mesh.material as ShaderMaterial;
          const shore = material.uniforms?.uHasShore;
          if (shore && !shores.has(material)) {
            shores.set(material, shore.value);
            // The z(x) outer-shore samples cannot represent both sides of this
            // headland: their secants project a false submerged land silhouette.
            // Keep the sea pigment, sun wash and sky reflection for the film.
            shore.value = 0;
          }
          continue;
        }
        if (!mesh.name.startsWith("painted-river-") || originals.has(mesh)) continue;
        const geometry = mesh.geometry;
        const positions = geometry.getAttribute("position");
        if (!geometry.index || !positions) continue;
        originals.set(mesh, { ...geometry.drawRange });
        // Cut before either bank enters the sea quad. Testing centre height alone
        // misses long oblique triangles whose bank already extends over the sea.
        for (let section = 1; section < positions.count / 2; section++) {
          if (Math.min(positions.getZ(section * 2), positions.getZ(section * 2 + 1)) > seaNear) continue;
          geometry.setDrawRange(0, Math.min(geometry.drawRange.count, (section - 1) * 6));
          break;
        }
      }
    },
    dispose: restore,
  };
}
