import { type MeshToonMaterial, type Object3D, type WebGLRenderer } from "three";
import type { Quality } from "../terrain";
import { createPhotoSurfaces } from "../materials/cc0";

export { createPhotoSurfaces as createTerrainDetail } from "../materials/cc0";

/** Existing composition owns the playable-frame gate and quality/disposal hooks. */
export function bindTerrainDetail(root: Object3D, material: MeshToonMaterial, initialQuality: Quality,
  onError: (error: unknown) => void, deferred = false) {
  let quality = initialQuality;
  let controller: ReturnType<typeof createPhotoSurfaces> | undefined;
  let started = false, disposed = false;
  let deferredRenderer: WebGLRenderer | undefined;
  const previous = material.onBeforeRender;
  const dressingPending = (renderer: WebGLRenderer) => {
    // Let the existing bounded dressing queue finish with its cheap fallback.
    // The production marker is owned by that queue; standalone scenes have none.
    const host = renderer.domElement?.closest("[data-world-build]");
    return host !== null && host !== undefined && host.getAttribute("data-world-build") !== "done";
  };
  const ready = async (renderer: WebGLRenderer) => {
    if (disposed) return;
    controller ??= createPhotoSurfaces(root, renderer);
    // Software uses no photo assets. Install its flat shader before High post
    // and shadows start, avoiding an expensive first original-material draw.
    if (!controller.software && (deferred || dressingPending(renderer))) { deferredRenderer = renderer; return; }
    deferredRenderer = undefined;
    started = true;
    await controller.setQuality(quality);
  };
  material.onBeforeRender = function (renderer, ...args) {
    previous.call(this, renderer, ...args);
    if (!started) void ready(renderer).catch(onError);
  };
  return {
    ready,
    resume() {
      deferred = false;
      if (deferredRenderer) {
        const renderer = deferredRenderer; deferredRenderer = undefined;
        void ready(renderer).catch(onError);
      }
    },
    setQuality(next: Quality) {
      quality = next;
      if (deferredRenderer) void ready(deferredRenderer).catch(onError);
      else if (controller) void controller.setQuality(next).catch(onError);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      deferredRenderer = undefined;
      material.onBeforeRender = previous;
      controller?.dispose();
    },
  };
}
