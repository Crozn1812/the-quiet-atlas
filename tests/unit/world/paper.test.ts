import {
  ACESFilmicToneMapping, BufferGeometry, Color, DepthTexture, Fog, HalfFloatType,
  Mesh, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial,
  SRGBColorSpace, Vector2, WebGLRenderTarget, type WebGLRenderer,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { createPaperPass } from "../../../src/features/world/post/paper";

// Real CPU-side three.js resources, with only the renderer mocked. No canvas/GPU.
vi.mock("three", async importOriginal => {
  const three = await importOriginal<typeof import("three")>();
  return {
    ...three,
    WebGLRenderTarget: vi.fn(class extends three.WebGLRenderTarget {}),
    DepthTexture: vi.fn(class extends three.DepthTexture {}),
  };
});

function mockRenderer() {
  let destination: WebGLRenderTarget | null = null;
  const renderer = {
    getSize: vi.fn((v: Vector2) => v.set(320, 180)),
    getPixelRatio: vi.fn(() => 1.25),
    getRenderTarget: vi.fn(() => destination),
    setRenderTarget: vi.fn((target: WebGLRenderTarget | null) => { destination = target; }),
    autoClear: true,
    clear: vi.fn(),
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.3,
    outputColorSpace: SRGBColorSpace,
    render: vi.fn<(scene: Scene, camera: PerspectiveCamera | OrthographicCamera) => void>(),
  };
  return { renderer, gpu: renderer as unknown as WebGLRenderer };
}

function target() {
  return vi.mocked(WebGLRenderTarget).mock.results.at(-1)!.value as WebGLRenderTarget;
}

function screenMaterial(renderer: ReturnType<typeof mockRenderer>["renderer"]) {
  const screen = renderer.render.mock.calls.at(-1)![0];
  const triangle = screen.children[0] as Mesh<BufferGeometry, ShaderMaterial>;
  return { triangle, material: triangle.material };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("paper post pass", () => {
  it("Low allocates no target/depth and renders directly, preserving scene fog", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Low" });
    const scene = new Scene();
    const fog = new Fog(PALETTE.paper, 15, 65);
    scene.fog = fog;
    const camera = new PerspectiveCamera();
    pass.setSize(640, 360);
    pass.render(scene, camera);
    pass.dispose();
    expect(WebGLRenderTarget).not.toHaveBeenCalled();
    expect(DepthTexture).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledExactlyOnceWith(scene, camera);
    expect(renderer.setRenderTarget).not.toHaveBeenCalled();
    expect(renderer.clear).not.toHaveBeenCalled();
    expect(scene.fog).toBe(fog);
  });

  it.each(["Balanced", "High"] as const)("%s uses one HDR target/depth and one fullscreen triangle", quality => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality });
    pass.render(new Scene(), new PerspectiveCamera(55, 1, 0.2, 120));
    expect(WebGLRenderTarget).toHaveBeenCalledTimes(1);
    expect(DepthTexture).toHaveBeenCalledTimes(1);
    expect(target().depthTexture).toBeInstanceOf(DepthTexture);
    expect(target().texture.type).toBe(HalfFloatType);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    const { triangle, material } = screenMaterial(renderer);
    expect(triangle.geometry.getAttribute("position").count).toBe(3);
    expect(triangle.frustumCulled).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.uniforms.tColor!.value).toBe(target().texture);
    expect(material.uniforms.tDepth!.value).toBe(target().depthTexture);
    expect(material.uniforms.paperColor!.value).toEqual(new Color(PALETTE.paper));
    expect(material.uniforms.fogNear!.value).toBe(15);
    expect(material.uniforms.fogFar!.value).toBe(65);
    expect(material.uniforms.cameraNear!.value).toBe(0.2);
    expect(material.uniforms.cameraFar!.value).toBe(120);
    expect(material.uniforms.perspective!.value).toBe(true);
    expect(material.toneMapped).toBe(true);
    expect(material.fragmentShader).toContain("#include <tonemapping_fragment>");
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.3);
    expect(renderer.outputColorSpace).toBe(SRGBColorSpace);
    pass.dispose();
  });

  it("sizes to physical pixels, including changed DPR and sizes remembered while Low", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    expect([target().width, target().height]).toEqual([400, 225]);
    pass.setSize(801, 401);
    expect([target().width, target().height]).toEqual([1001, 501]);
    renderer.getPixelRatio.mockReturnValue(2);
    pass.setSize(801, 401);
    expect([target().width, target().height]).toEqual([1602, 802]);
    pass.setQuality("Low");
    pass.setSize(200, 100);
    pass.setQuality("High");
    expect([target().width, target().height]).toEqual([400, 200]);
    pass.setSize(0, 0);
    expect([target().width, target().height]).toEqual([1, 1]);
    pass.dispose();
  });

  it("reuses Balanced/High resources and releases every resource when switching to Low", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    pass.render(new Scene(), new PerspectiveCamera());
    const { triangle, material } = screenMaterial(renderer);
    const disposals = [target(), target().depthTexture!, material, triangle.geometry].map(resource => vi.spyOn(resource, "dispose"));
    pass.setQuality("High");
    pass.setQuality("High");
    expect(WebGLRenderTarget).toHaveBeenCalledTimes(1);
    pass.setQuality("Low");
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    renderer.render.mockClear();
    pass.render(new Scene(), new PerspectiveCamera());
    expect(renderer.render).toHaveBeenCalledTimes(1);
    pass.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("dispose releases target, depth, material and geometry exactly once and prevents resurrection", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "High" });
    pass.render(new Scene(), new PerspectiveCamera());
    const { triangle, material } = screenMaterial(renderer);
    const disposals = [target(), target().depthTexture!, material, triangle.geometry].map(resource => vi.spyOn(resource, "dispose"));
    pass.dispose();
    pass.dispose();
    pass.setQuality("Low");
    pass.setQuality("Balanced");
    pass.setSize(800, 600);
    renderer.render.mockClear();
    pass.render(new Scene(), new PerspectiveCamera());
    expect(renderer.render).not.toHaveBeenCalled();
    expect(WebGLRenderTarget).toHaveBeenCalledTimes(1);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("uses current camera clipping planes, restores fog/destination and keeps grain static", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    const scene = new Scene();
    const fog = new Fog(PALETTE.paper, 15, 65);
    scene.fog = fog;
    const sceneTarget = target();
    const destination = new WebGLRenderTarget(8, 8);
    renderer.setRenderTarget(destination);
    renderer.autoClear = false;
    renderer.render.mockImplementationOnce(() => {
      expect(scene.fog).toBeNull();
      expect(renderer.getRenderTarget()).toBe(sceneTarget);
    });
    pass.render(scene, new PerspectiveCamera());
    const { material } = screenMaterial(renderer);
    const uniforms = Object.fromEntries(Object.entries(material.uniforms).map(([key, uniform]) => [key, uniform.value]));
    pass.render(scene, new PerspectiveCamera());
    expect(Object.fromEntries(Object.entries(material.uniforms).map(([key, uniform]) => [key, uniform.value]))).toEqual(uniforms);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 2, 90);
    pass.render(scene, camera);
    expect(material.uniforms.cameraNear!.value).toBe(2);
    expect(material.uniforms.cameraFar!.value).toBe(90);
    expect(material.uniforms.perspective!.value).toBe(false);
    expect(renderer.getRenderTarget()).toBe(destination);
    expect(scene.fog).toBe(fog);
    expect(renderer.clear).toHaveBeenCalledTimes(3);
    pass.dispose();
    destination.dispose();
  });

  it.each([1, 2])("restores scene fog and render target if render call %i throws", failingCall => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    const scene = new Scene();
    const fog = new Fog(PALETTE.paper, 15, 65);
    scene.fog = fog;
    let calls = 0;
    renderer.render.mockImplementation(() => {
      if (++calls === failingCall) throw new Error("render failed");
    });
    expect(() => pass.render(scene, new PerspectiveCamera())).toThrow("render failed");
    expect(scene.fog).toBe(fog);
    expect(renderer.getRenderTarget()).toBeNull();
    pass.dispose();
  });
});
