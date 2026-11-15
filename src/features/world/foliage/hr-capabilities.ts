import type { WebGLRenderer } from "three";

const softwareRenderers = new WeakMap<WebGLRenderer, boolean>();
/** Capability fallback shared by trees and props; independent of the quality pin. */
export function usesSoftwareRasterizer(renderer: WebGLRenderer) {
  let software = softwareRenderers.get(renderer);
  if (software === undefined) {
    const gl = renderer.getContext?.();
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
    software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(name);
    softwareRenderers.set(renderer, software);
  }
  return software;
}
