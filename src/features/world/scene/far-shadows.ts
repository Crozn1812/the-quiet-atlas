import { BufferAttribute, type BufferGeometry } from "three";

/** Horizon slopes along the three HR-LIGHT keyframe azimuths. These are geometry
 * occluders, not a painted dark side: the shader compares the live sun elevation
 * with the interpolated horizon. No shadow-camera coverage or per-frame CPU. */
export function* bakeFarHorizons(geometry: BufferGeometry, cells: number, step: number) {
  const stride = cells + 1, p = geometry.getAttribute("position");
  const horizon = new Float32Array(p.count * 3);
  const directions = [[-0.914, 0.406], [0, 1], [0.8, -0.6]] as const;
  for (let x = 0; x <= cells; x++) {
    yield;
    for (let z = 0; z <= cells; z++) {
      const index = x * stride + z, height = p.getY(index);
      for (let d = 0; d < 3; d++) {
        const [dx, dz] = directions[d]!;
        let slope = 0;
        for (const distance of [2, 4, 7, 11, 17, 25, 37, 53]) {
          const u = x + dx * distance, v = z + dz * distance;
          if (u < 0 || u >= cells || v < 0 || v >= cells) continue;
          const ix = Math.floor(u), iz = Math.floor(v), fx = u - ix, fz = v - iz;
          const a = ix * stride + iz;
          const h = (p.getY(a) * (1 - fz) + p.getY(a + 1) * fz) * (1 - fx)
            + (p.getY(a + stride) * (1 - fz) + p.getY(a + stride + 1) * fz) * fx;
          slope = Math.max(slope, (h - height - 0.8) / (distance * step));
        }
        horizon[index * 3 + d] = slope;
      }
    }
  }
  geometry.setAttribute("farHorizon", new BufferAttribute(horizon, 3));
}
