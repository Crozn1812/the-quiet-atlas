import type { WebGLRenderer } from 'three';

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
const MAX_SAMPLES = 240;
export interface Cost {
  samples: number; calls: number; triangles: number; cpuSubmitMedianMs: number;
  frameMedianMs: number; frameP95Ms: number; gpuMedianMs: number | null; gpuP95Ms: number | null;
  timer: string; device: string; width: number; height: number;
}
export function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

/** One nonblocking query around ALL passes, bounded queue; disjoint data is discarded. */
export function createMeter(renderer: WebGLRenderer) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const device = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  const queries: WebGLQuery[] = [], gpu: number[] = [], cpu: number[] = [], intervals: number[] = [];
  let frames = 0, start = 0, last = 0, calls = 0, triangles = 0, active: WebGLQuery | null = null;
  let disposed = false, wasDisjoint = false;
  function sample(values: number[], value: number) {
    if (values.length === MAX_SAMPLES) values.shift();
    values.push(value);
  }
  function poll() {
    if (!ext) return;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      queries.splice(0).forEach(query => gl.deleteQuery(query)); gpu.length = 0; wasDisjoint = true; return;
    }
    while (queries.length && gl.getQueryParameter(queries[0]!, gl.QUERY_RESULT_AVAILABLE)) {
      const query = queries.shift()!;
      const ms = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6;
      if (Number.isFinite(ms) && ms >= 0) sample(gpu, ms);
      gl.deleteQuery(query);
    }
  }
  return {
    begin(now: number) {
      if (disposed) return;
      poll();
      if (frames >= 45 && last) sample(intervals, now - last);
      last = now; start = performance.now();
      if (ext && frames >= 45 && !gl.getParameter(ext.GPU_DISJOINT_EXT) && queries.length < 4) {
        active = gl.createQuery(); if (active) gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
      }
      renderer.info.reset();
    },
    end() {
      if (disposed) return;
      if (ext && active) { gl.endQuery(ext.TIME_ELAPSED_EXT); queries.push(active); active = null; }
      if (++frames > 45) { sample(cpu, performance.now() - start); calls = renderer.info.render.calls; triangles = renderer.info.render.triangles; }
    },
    get ready() { return cpu.length >= 120 && (!ext || gpu.length >= 30 || frames > 300); },
    report(): Cost {
      const canvas = renderer.domElement;
      return { samples: cpu.length, calls, triangles, cpuSubmitMedianMs: percentile(cpu, 0.5), frameMedianMs: percentile(intervals, 0.5), frameP95Ms: percentile(intervals, 0.95), gpuMedianMs: gpu.length >= 30 ? percentile(gpu, 0.5) : null, gpuP95Ms: gpu.length >= 30 ? percentile(gpu, 0.95) : null, timer: !ext ? 'EXT_disjoint_timer_query_webgl2 unavailable' : gpu.length < 30 ? 'GPU query: insufficient valid samples' : wasDisjoint ? 'GPU query; disjoint samples discarded' : 'EXT_disjoint_timer_query_webgl2', device, width: canvas.width, height: canvas.height };
    },
    dispose() { disposed = true; queries.splice(0).forEach(query => gl.deleteQuery(query)); },
  };
}
