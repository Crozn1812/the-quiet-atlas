import { Box3, BufferGeometry, Mesh, Object3D, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { loadPropGeometry, type PropAsset, type PropGeometryLoader } from "./deferred";
import type { Quality } from "../terrain";

const qualities = new WeakMap<Object3D, Quality>();
const refreshers = new WeakMap<Object3D, () => void>();
function qualityOf(object: Object3D): Quality {
  for (let node: Object3D | null = object; node; node = node.parent) {
    const quality = qualities.get(node);
    if (quality) return quality;
  }
  return "High";
}
/** The ground quality controller forwards the existing world quality setting. */
export function setBakedPropQuality(root: Object3D, quality: Quality) {
  qualities.set(root, quality);
  root.traverse(object => refreshers.get(object)?.());
}

export interface BakedBatchPart {
  index: number;
  asset: PropAsset;
  /** Bounds before terrain grounding; preserve the existing collider footprint. */
  bounds: Box3;
  yaw?: number;
  colorScale?: Vector3;
}

/** Replace selected parts inside one existing draw, without touching its material.
 * Call before disposing the source parts; release with the owning zone.
 */
export function deferBakedBatch(mesh: Mesh, parts: BufferGeometry[], entries: BakedBatchPart[],
  heightAt: (x: number, z: number) => number, load: PropGeometryLoader = loadPropGeometry) {
  if (!entries.length) return () => {};
  const sources = parts.map(part => {
    const source = part.clone();
    for (const name of Object.keys(source.attributes)) {
      if (name !== "position" && name !== "color") source.deleteAttribute(name);
    }
    return source;
  });
  const fallback = mesh.geometry;
  let disposed = false, started = false;
  let detail: BufferGeometry | undefined;
  let sourcesReleased = false;
  const releaseSources = () => {
    if (sourcesReleased) return;
    sourcesReleased = true;
    sources.forEach(source => source.dispose());
  };
  const refresh = () => { mesh.geometry = qualityOf(mesh) === "Low" ? fallback : detail ?? fallback; };
  refreshers.set(mesh, refresh);
  const previousRender = mesh.onAfterRender;
  mesh.onAfterRender = (...args) => {
    previousRender.apply(mesh, args);
    if (disposed || started || qualityOf(mesh) === "Low") return;
    started = true;
    void Promise.allSettled(entries.map(async entry => {
      const loaded = await load(entry.asset);
      try {
        const geometry = loaded.index ? loaded.toNonIndexed() : loaded.clone();
        geometry.rotateY(entry.yaw ?? 0);
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!, size = bounds.getSize(new Vector3());
        const target = entry.bounds.getSize(new Vector3());
        geometry.translate(-bounds.min.x, -bounds.min.y, -bounds.min.z)
          .scale(target.x / size.x, target.y / size.y, target.z / size.z)
          .translate(entry.bounds.min.x, entry.bounds.min.y, entry.bounds.min.z);
        const position = geometry.getAttribute("position");
        const color = geometry.getAttribute("color");
        if (entry.colorScale) for (let i = 0; i < color.count; i++) {
          color.setXYZ(i, color.getX(i) * entry.colorScale.x,
            color.getY(i) * entry.colorScale.y, color.getZ(i) * entry.colorScale.z);
        }
        for (let i = 0; i < position.count; i++) {
          position.setY(i, position.getY(i) + heightAt(position.getX(i), position.getZ(i)));
        }
        for (const name of Object.keys(geometry.attributes)) {
          if (name !== "position" && name !== "color") geometry.deleteAttribute(name);
        }
        if (disposed) { geometry.dispose(); return; }
        sources[entry.index]!.dispose();
        sources[entry.index] = geometry;
      } finally { loaded.dispose(); }
    })).then(() => {
      if (disposed) return;
      detail = mergeGeometries(sources) ?? undefined;
      if (detail) {
        detail.computeVertexNormals();
        detail.computeBoundingBox();
        detail.computeBoundingSphere();
        refresh();
      }
      releaseSources();
    });
  };
  return () => {
    if (disposed) return;
    disposed = true;
    refreshers.delete(mesh);
    mesh.onAfterRender = previousRender;
    mesh.geometry = fallback;
    releaseSources();
    detail?.dispose();
  };
}
