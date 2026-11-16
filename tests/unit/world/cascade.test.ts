import { Group, HalfFloatType, Mesh, Vector3, WebGLRenderTarget, type FramebufferTexture, type ShaderMaterial, type WebGLRenderer } from "three";
import { expect, it, vi } from "vitest";
import { CASCADE_ROWS, CASCADE_STRANDS, CASCADE_STRAND_COLUMNS, createSpringCascade } from "../../../src/features/world/water/cascade";
import { createWaterMaterial } from "../../../src/features/world/water/material";

it("keeps fall ribbons disconnected with open gaps and bowed cross-sections", () => {
  const water = createWaterMaterial("High");
  const cascade = createSpringCascade(new Vector3(), new Vector3(0, 0, 1), 0, () => water);
  try {
    const sheet = cascade.objects[0] as Mesh;
    const positions = sheet.geometry.getAttribute("position");
    const stride = CASCADE_STRAND_COLUMNS + 1, perStrand = (CASCADE_ROWS + 1) * stride;
    const indices = sheet.geometry.index!;
    // No triangle bridges neighbouring strands; a flat continuous sheet fails this.
    const components = new Set<number>();
    for (let i = 0; i < indices.count; i += 3) {
      const ids = [0, 1, 2].map(j => Math.floor(indices.getX(i + j) / perStrand));
      expect(new Set(ids).size).toBe(1); components.add(ids[0]!);
    }
    expect(components.size).toBe(CASCADE_STRANDS);
    for (let strand = 0; strand < CASCADE_STRANDS; strand++) {
      const start = strand * perStrand + Math.floor(CASCADE_ROWS / 2) * stride;
      const a = new Vector3().fromBufferAttribute(positions, start);
      const b = new Vector3().fromBufferAttribute(positions, start + CASCADE_STRAND_COLUMNS);
      const mid = new Vector3().fromBufferAttribute(positions, start + CASCADE_STRAND_COLUMNS / 2);
      expect(mid.distanceTo(a.clone().lerp(b, 0.5))).toBeGreaterThan(0.005);
      if (strand + 1 < CASCADE_STRANDS) {
        const next = new Vector3().fromBufferAttribute(positions, start + perStrand);
        expect(b.x - next.x).toBeGreaterThan(0.005);
      }
    }
  } finally { cascade.dispose(); water.dispose(); }
});

it("shares the water clock across pause and quality replacement and releases effects once", () => {
  let water = createWaterMaterial("High");
  const cascade = createSpringCascade(new Vector3(), new Vector3(0, 0, 1), 0, () => water);
  const parent = new Group(); parent.add(...cascade.objects);
  const disposals = cascade.objects.flatMap(object => {
    const mesh = object as Mesh;
    return [vi.spyOn(mesh.geometry, "dispose"), vi.spyOn(mesh.material as import("three").Material, "dispose")];
  });
  const sync = () => {
    for (const object of cascade.objects) {
      const mesh = object as Mesh;
      mesh.onBeforeRender({ getRenderTarget: () => null } as WebGLRenderer, {} as never, {} as never, mesh.geometry, mesh.material as import("three").Material, null as never);
      const uniforms = (mesh.material as import("three").ShaderMaterial).uniforms;
      expect(uniforms.uTime!.value).toBe(water.uniforms.uTime!.value);
      expect(uniforms.uMotion!.value).toBe(water.quality === "Low" ? 0 : 1);
    }
  };
  try {
    water.setTime(3); sync();
    water.setReducedMotion(true); water.setTime(90); sync();
    expect(water.uniforms.uTime!.value).toBe(3);
    water.dispose(); water = createWaterMaterial("Low"); water.setTime(5); sync();
    cascade.dispose(); cascade.dispose();
    expect(parent.children).toHaveLength(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  } finally { cascade.dispose(); water.dispose(); }
});

it("copies the existing HDR target only while needed and releases resized refraction textures", () => {
  let water = createWaterMaterial("High");
  const cascade = createSpringCascade(new Vector3(), new Vector3(0, 0, 1), 0, () => water);
  const sheet = cascade.objects[0] as Mesh<import("three").BufferGeometry, ShaderMaterial>;
  const target = new WebGLRenderTarget(800, 450, { type: HalfFloatType });
  const copy = vi.fn();
  const renderer = { getRenderTarget: () => target, copyFramebufferToTexture: copy } as unknown as WebGLRenderer;
  const render = () => sheet.onBeforeRender(renderer, {} as never, {} as never, sheet.geometry, sheet.material, null as never);
  try {
    render();
    const first = sheet.material.uniforms.uBackdrop!.value as FramebufferTexture;
    const releaseFirst = vi.spyOn(first, "dispose");
    expect(first.type).toBe(HalfFloatType);
    expect(first.image.width).toBe(800);
    expect(copy).toHaveBeenCalledWith(first);
    target.setSize(400, 225); render();
    const second = sheet.material.uniforms.uBackdrop!.value as FramebufferTexture;
    const releaseSecond = vi.spyOn(second, "dispose");
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
    expect(second.image.width).toBe(400);
    water.dispose(); water = createWaterMaterial("Low"); render();
    expect(copy).toHaveBeenCalledTimes(2);
    expect(sheet.material.uniforms.uRefraction!.value).toBe(0);
    cascade.dispose(); cascade.dispose();
    expect(releaseSecond).toHaveBeenCalledTimes(1);
  } finally { cascade.dispose(); water.dispose(); target.dispose(); }
});
