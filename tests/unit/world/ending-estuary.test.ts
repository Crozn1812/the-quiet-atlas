import { expect, it } from "vitest";
import { createEndingEstuaryMask } from "../../../src/features/world/cinematic/estuary";
import { createRiverRibbon } from "../../../src/features/world/water/ribbon";
import { createSea } from "../../../src/features/world/water/sea";
import { SEA_INLAND_OVERLAP } from "../../../src/features/world/water/sea";
import { riverPointAt } from "../../../src/features/world/layout/river";

it.each(["Low", "Balanced", "High"] as const)("masks overlapping coast water during ending and restores %s gameplay on handoff/disposal", quality => {
  const river = createRiverRibbon(quality);
  const sea = createSea(quality);
  const mask = createEndingEstuaryMask();
  const geometry = river.mesh.geometry;
  const positions = geometry.getAttribute("position").array.slice();
  const material = river.mesh.material;
  const range = { ...geometry.drawRange };
  try {
    mask.update([river.mesh, sea.mesh], true);
    const cut = geometry.drawRange.count;
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThan(geometry.index!.count);
    const last = geometry.getAttribute("position");
    const section = (cut / 6 + 1) * 2;
    expect(Math.min(last.getZ(section), last.getZ(section + 1))).toBeLessThanOrEqual(riverPointAt(1).z + SEA_INLAND_OVERLAP);
    expect(sea.mesh.geometry.drawRange.count).toBe(Infinity);
    expect(sea.mesh.material.uniforms.uHasShore!.value).toBe(0);
    mask.update([river.mesh], true);
    expect(geometry.drawRange.count).toBe(cut);
    mask.update([river.mesh], false);
    expect(geometry.drawRange).toEqual(range);
    expect(sea.mesh.material.uniforms.uHasShore!.value).toBe(1);
    mask.update([river.mesh, sea.mesh], true);
    mask.dispose(); mask.dispose();
    expect(geometry.drawRange).toEqual(range);
    expect(geometry.getAttribute("position").array).toEqual(positions);
    expect(river.mesh.material).toBe(material);
    expect(sea.mesh.material.uniforms.uHasShore!.value).toBe(1);
  } finally { mask.dispose(); river.dispose(); sea.dispose(); }
});
