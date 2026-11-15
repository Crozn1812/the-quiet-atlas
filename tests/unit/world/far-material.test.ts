import { describe, expect, it, vi } from "vitest";
import { LessEqualDepth, RepeatWrapping, SRGBColorSpace, Texture, type WebGLRenderer } from "three";
import { createFarMaterial } from "../../../src/features/world/scene/far-material";

const fixture = vi.hoisted(() => ({ load: vi.fn(), dispose: vi.fn() }));
vi.mock("three/examples/jsm/loaders/KTX2Loader.js", () => ({ KTX2Loader: class {
  detectSupport() { return this; }
  loadAsync(url: string) { return fixture.load(url); }
  dispose() { fixture.dispose(); }
} }));
const renderer = { capabilities: { getMaxAnisotropy: () => 16 } } as WebGLRenderer;

describe("far relief depth and deferred photograph", () => {
  it("preserves real foreground and self occlusion without copying or resetting depth", () => {
    const material = createFarMaterial({ value: 0 });
    const gpu = { getRenderTarget: vi.fn(), copyTextureToTexture: vi.fn() };
    material.prepareDepth(gpu as unknown as WebGLRenderer, true);
    expect(material.depthTest).toBe(true); expect(material.depthWrite).toBe(true);
    expect(material.depthFunc).toBe(LessEqualDepth);
    expect(gpu.getRenderTarget).not.toHaveBeenCalled();
    expect(gpu.copyTextureToTexture).not.toHaveBeenCalled();
    const shader = { uniforms: {}, vertexShader: "#include <begin_vertex>", fragmentShader: "#include <clipping_planes_fragment>\n#include <fog_fragment>" };
    material.onBeforeCompile(shader as never, renderer);
    expect(shader.fragmentShader).not.toContain("gl_FragDepth");
    expect(shader.fragmentShader).not.toContain("groundFog");
    expect(shader.fragmentShader).toContain("gl_FragColor.rgb=target");
    material.prepareDepth(renderer, false); expect(material.depthWrite).toBe(false);
    material.dispose();
  });
  it("starts no asset at creation, deduplicates streaming and releases its owned photo", async () => {
    fixture.load.mockReset(); fixture.dispose.mockClear();
    const photo = new Texture(), release = vi.spyOn(photo, "dispose");
    fixture.load.mockResolvedValue(photo);
    const material = createFarMaterial({ value: 0 });
    expect(fixture.load).not.toHaveBeenCalled();
    await Promise.all([material.startDetail(renderer), material.startDetail(renderer)]);
    expect(fixture.load).toHaveBeenCalledExactlyOnceWith("/world/cliff/cliff-color.ktx2");
    expect(photo.wrapS).toBe(RepeatWrapping); expect(photo.wrapT).toBe(RepeatWrapping);
    expect(photo.colorSpace).toBe(SRGBColorSpace); expect(photo.anisotropy).toBe(8);
    material.dispose(); material.dispose(); expect(release).toHaveBeenCalledOnce();
    expect(fixture.dispose).toHaveBeenCalledOnce();
  });
  it("releases a late photo after unmount and retains analytic relief on failure", async () => {
    let finish!: (photo: Texture) => void;
    fixture.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const material = createFarMaterial({ value: 0 });
    const task = material.startDetail(renderer);
    await vi.waitFor(() => expect(finish).toBeDefined());
    material.dispose(); const photo = new Texture(), release = vi.spyOn(photo, "dispose"); finish(photo);
    await task; expect(release).toHaveBeenCalledOnce();
    fixture.load.mockRejectedValueOnce(new Error("offline"));
    const fallback = createFarMaterial({ value: 0 });
    await expect(fallback.startDetail(renderer)).resolves.toBeUndefined(); fallback.dispose();
  });
});
