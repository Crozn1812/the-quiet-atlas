import type { WebGLRenderer } from "three";

export const PERF_FRAME_CAPACITY = 36000;
export interface PerfHooks {
  frames(): number[];
  info(): { drawCalls: number; triangles: number; geometries: number; textures: number; programs: number };
}
declare global {
  interface HTMLElement {
    __tqaPerf?: PerfHooks;
  }
}
export function createPerf(gpu: WebGLRenderer) {
  const buffer = new Float64Array(PERF_FRAME_CAPACITY);
  let cursor = 0;
  let count = 0;
  return {
    record(ms: number) {
      buffer[cursor] = ms;
      cursor = (cursor + 1) % buffer.length;
      count = Math.min(count + 1, buffer.length);
    },
    frames() {
      return Array.from({ length: count }, (_, i) => buffer[(cursor - count + i + buffer.length) % buffer.length]!);
    },
    info() {
      return {
        drawCalls: gpu.info.render.calls,
        triangles: gpu.info.render.triangles,
        geometries: gpu.info.memory.geometries,
        textures: gpu.info.memory.textures,
        programs: gpu.info.programs?.length ?? 0,
      };
    },
  };
}
