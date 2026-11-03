import { expect, it } from "vitest";
import type { WebGLRenderer } from "three";
import { createPerf, PERF_FRAME_CAPACITY } from "../../../src/features/world/perf";

it("keeps a bounded chronological ring and returns independent snapshots", () => {
  const gpu = {
    info: {
      render: { calls: 2, triangles: 10 },
      memory: { geometries: 3, textures: 1 },
      programs: [{}],
    },
  } as unknown as WebGLRenderer;
  const perf = createPerf(gpu);
  for (let i = 1; i <= PERF_FRAME_CAPACITY + 2; i++) perf.record(i);
  const frames = perf.frames();
  expect(frames).toHaveLength(PERF_FRAME_CAPACITY);
  expect(frames[0]).toBe(3);
  expect(frames.at(-1)).toBe(PERF_FRAME_CAPACITY + 2);
  frames[0] = 0;
  expect(perf.frames()[0]).toBe(3);
  expect(perf.info()).toEqual({ drawCalls: 2, triangles: 10, geometries: 3, textures: 1, programs: 1 });
  gpu.info.render.calls = 5;
  expect(perf.info().drawCalls).toBe(5);
});
