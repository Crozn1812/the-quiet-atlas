import { Mesh, type BufferGeometry } from "three";
import type { WaterMaterial } from "./material";

/** Each surface owns its geometry and material; dispose detaches it from the scene. */
export interface WaterSurface {
  readonly mesh: Mesh<BufferGeometry, WaterMaterial>;
  setTime(seconds: number): void;
  setReducedMotion(reduced: boolean): void;
  setSkyMix(mix: number): void;
  dispose(): void;
}

export function createWaterSurface(geometry: BufferGeometry, material: WaterMaterial): WaterSurface {
  const mesh = new Mesh(geometry, material);
  mesh.name = material.name;
  let disposed = false;
  return {
    mesh,
    setTime: seconds => material.setTime(seconds),
    setReducedMotion: reduced => material.setReducedMotion(reduced),
    setSkyMix: mix => material.setSkyMix(mix),
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
