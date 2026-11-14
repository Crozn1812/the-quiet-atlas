import { describe, expect, it, vi } from "vitest";
import { AlwaysDepth, LessEqualDepth, DepthTexture, WebGLRenderTarget, type WebGLRenderer } from "three";
import { createFarMaterial } from "../../../src/features/world/scene/far-material";

function fixture() {
  const source = new WebGLRenderTarget(1600, 900, { depthTexture: new DepthTexture(1600, 900) });
  const renderer = { getRenderTarget: vi.fn(() => source as WebGLRenderTarget | null),
    initRenderTarget: vi.fn(), copyTextureToTexture: vi.fn(), setRenderTarget: vi.fn() };
  const material = createFarMaterial({ value: 0 });
  return { source, renderer, material, prepare: (enabled = true) => material.prepareDepth(renderer as unknown as WebGLRenderer, enabled) };
}

describe("far backdrop depth ownership", () => {
  it("does not allocate or copy on Low or before the post target exists", () => {
    const f = fixture();
    try {
      f.prepare(false); f.renderer.getRenderTarget.mockReturnValue(null); f.prepare();
      expect(f.renderer.initRenderTarget).not.toHaveBeenCalled();
      expect(f.renderer.copyTextureToTexture).not.toHaveBeenCalled();
      expect(f.material.depthTest).toBe(true); expect(f.material.depthWrite).toBe(false);
    } finally { f.material.dispose(); f.source.dispose(); }
  });
  it("copies a separate depth attachment, reuses/resizes it, and releases its owned buffers", () => {
    const f = fixture();
    try {
      f.prepare();
      const copy = f.renderer.initRenderTarget.mock.calls[0]![0] as WebGLRenderTarget;
      const release = vi.spyOn(copy, "dispose"), releaseDepth = vi.spyOn(copy.depthTexture!, "dispose");
      expect(copy.depthTexture).not.toBe(f.source.depthTexture);
      expect(f.renderer.copyTextureToTexture).toHaveBeenCalledWith(f.source.depthTexture, copy.depthTexture);
      expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.source);
      expect(f.material.depthTest).toBe(true); expect(f.material.depthWrite).toBe(true);
      expect(f.material.depthFunc).toBe(AlwaysDepth);
      f.prepare(); expect(f.renderer.initRenderTarget.mock.calls[1]![0]).toBe(copy);
      f.source.setSize(800, 450); f.prepare();
      expect(copy.width).toBe(800); expect(copy.height).toBe(450);
      expect(release).toHaveBeenCalledOnce(); // Old allocation on resize.
      f.prepare(false); expect(f.renderer.copyTextureToTexture).toHaveBeenCalledTimes(3);
      expect(f.material.depthTest).toBe(true); expect(f.material.depthWrite).toBe(false);
      expect(f.material.depthFunc).toBe(LessEqualDepth);
      f.material.dispose(); f.material.dispose();
      expect(release).toHaveBeenCalledTimes(2); expect(releaseDepth).toHaveBeenCalledOnce();
    } finally { f.material.dispose(); f.source.dispose(); }
  });
  it("restores the active target even if a GPU copy fails", () => {
    const f = fixture();
    f.renderer.copyTextureToTexture.mockImplementation(() => { throw new Error("copy failed"); });
    try {
      expect(() => f.prepare()).toThrow("copy failed");
      expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.source);
    } finally { f.material.dispose(); f.source.dispose(); }
  });
});
