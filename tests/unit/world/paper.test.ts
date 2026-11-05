import {
  ACESFilmicToneMapping, BufferGeometry, Color, DepthTexture, Fog, HalfFloatType,
  Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial,
  SRGBColorSpace, Vector2, Vector3, Vector4, WebGLRenderTarget, type WebGLRenderer,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import {
  CORRIDOR_POINTS, createPaperPass, DEFAULT_MIST_BANDS, DEFAULT_MIST_HEIGHT, DEFAULT_MIST_STRENGTH,
} from "../../../src/features/world/post/paper";

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
    pass.setMist({ bands: [18, 32, 50], height: 2, strength: 0.8 });
    pass.setEdges({ bleed: 0.8, ink: true });
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
    expect(material.uniforms.inkColor!.value).toEqual(new Color(PALETTE.ink));
    expect(material.uniforms.bleedStrength!.value).toBe(0.5);
    expect(material.uniforms.inkEnabled!.value).toBe(quality === "High");
    expect(material.uniforms.texelSize!.value).toEqual(new Vector2(1 / 400, 1 / 225));
    expect(material.uniforms.mistColor!.value).toEqual(new Color(PALETTE.mist));
    expect(material.uniforms.mistBands!.value.toArray()).toEqual([20, 35, 55]);
    expect(material.uniforms.mistBands!.value.toArray()).toEqual(DEFAULT_MIST_BANDS);
    expect(material.uniforms.mistHeight!.value).toBe(DEFAULT_MIST_HEIGHT);
    expect(DEFAULT_MIST_HEIGHT).toBe(1.2);
    expect(material.uniforms.mistStrength!.value).toBe(DEFAULT_MIST_STRENGTH);
    expect(DEFAULT_MIST_STRENGTH).toBe(0.65);
    expect(material.uniforms.cameraProjectionMatrixInverse!.value).toBeInstanceOf(Matrix4);
    expect(material.uniforms.cameraMatrixWorld!.value).toBeInstanceOf(Matrix4);
    expect(material.uniforms.fogNear!.value).toBe(15);
    expect(material.uniforms.fogFar!.value).toBe(65);
    expect(material.uniforms.cameraNear!.value).toBe(0.2);
    expect(material.uniforms.cameraFar!.value).toBe(120);
    expect(material.uniforms.perspective!.value).toBe(true);
    expect(material.toneMapped).toBe(true);
    // Tone mapping is applied to lit geometry only; paper/mist/fog colours are composited after it, unmapped.
    expect(material.fragmentShader).not.toContain("#include <tonemapping_fragment>");
    expect(material.fragmentShader).toContain("mix(color.rgb, toneMapping(color.rgb), geometry)");
    expect(material.uniforms.fogColor!.value.getHexString()).toBe("eee8d8");
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.3);
    expect(renderer.outputColorSpace).toBe(SRGBColorSpace);
    pass.dispose();
  });

  it("updates mist in place, preserves omitted fields and remembers settings across Low", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    pass.render(new Scene(), new PerspectiveCamera());
    const { material } = screenMaterial(renderer);
    const bands: [number, number, number] = [18, 32, 50];
    pass.setMist({ bands, height: 2.2, strength: 0.8 });
    bands[0] = 99; // The caller's tuple must not alias live uniform data.
    expect(material.uniforms.mistBands!.value.toArray()).toEqual([18, 32, 50]);
    expect(material.uniforms.mistHeight!.value).toBe(2.2);
    expect(material.uniforms.mistStrength!.value).toBe(0.8);
    pass.setMist({ strength: 0 });
    expect(material.uniforms.mistBands!.value.toArray()).toEqual([18, 32, 50]);
    expect(material.uniforms.mistHeight!.value).toBe(2.2);
    expect(material.uniforms.mistStrength!.value).toBe(0);
    pass.setQuality("Low");
    pass.setMist({ bands: [22, 38, 60], height: -0.5 });
    expect(WebGLRenderTarget).toHaveBeenCalledTimes(1);
    pass.setQuality("High");
    pass.render(new Scene(), new PerspectiveCamera());
    const restored = screenMaterial(renderer).material;
    expect(restored.uniforms.mistBands!.value.toArray()).toEqual([22, 38, 60]);
    expect(restored.uniforms.mistHeight!.value).toBe(-0.5);
    expect(restored.uniforms.mistStrength!.value).toBe(0);
    pass.dispose();
  });

  it("requires finite, positive, increasing band distances and validates updates atomically", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    pass.render(new Scene(), new PerspectiveCamera());
    const { material } = screenMaterial(renderer);
    const invalidBands: [number, number, number][] = [
      [35, 20, 55], [20, 20, 55], [20, 55, 35], [0, 35, 55], [20, 35, Infinity], [NaN, 35, 55],
    ];
    for (const bands of invalidBands) {
      expect(() => pass.setMist({ bands, height: 3 })).toThrow(RangeError);
    }
    expect(() => pass.setMist({ bands: [10, 25, 40], height: NaN })).toThrow(RangeError);
    for (const strength of [-0.1, 1.1, NaN, Infinity]) {
      expect(() => pass.setMist({ bands: [10, 25, 40], height: 3, strength })).toThrow(RangeError);
    }
    expect(material.uniforms.mistBands!.value.toArray()).toEqual(DEFAULT_MIST_BANDS);
    expect(material.uniforms.mistHeight!.value).toBe(DEFAULT_MIST_HEIGHT);
    expect(material.uniforms.mistStrength!.value).toBe(DEFAULT_MIST_STRENGTH);
    pass.dispose();
  });

  it("High enables mist noise and ink defines without allocating new resources on quality changes", () => {
    const balanced = mockRenderer();
    const high = mockRenderer();
    const balancedPass = createPaperPass(balanced.gpu, { quality: "Balanced" });
    const highPass = createPaperPass(high.gpu, { quality: "High" });
    balancedPass.render(new Scene(), new PerspectiveCamera());
    highPass.render(new Scene(), new PerspectiveCamera());
    const b = screenMaterial(balanced.renderer).material;
    const h = screenMaterial(high.renderer).material;
    expect(b.defines).toEqual({ CORRIDOR_POINTS });
    expect(h.defines).toEqual({ CORRIDOR_POINTS, MIST_EDGE_NOISE: 1, INK_OUTLINE: 1 });
    expect(b.uniforms.inkEnabled!.value).toBe(false);
    expect(h.uniforms.inkEnabled!.value).toBe(true);
    expect(h.vertexShader).toBe(b.vertexShader);
    expect(h.fragmentShader).toBe(b.fragmentShader);
    expect(Object.keys(h.uniforms)).toEqual(Object.keys(b.uniforms));
    for (const key of Object.keys(h.uniforms)) {
      if (!["tColor", "tDepth", "inkEnabled"].includes(key)) expect(h.uniforms[key]).toEqual(b.uniforms[key]);
    }
    expect(h.fragmentShader).toContain("#ifdef MIST_EDGE_NOISE");
    expect(h.fragmentShader).toContain("fibers(worldPosition.xz * 0.12)");
    expect(h.fragmentShader).not.toMatch(/uniform\s+float\s+time/);
    const version = b.version;
    balancedPass.setQuality("High");
    expect(b.defines).toEqual(h.defines);
    expect(b.uniforms.inkEnabled!.value).toBe(true);
    expect(b.version).toBe(version + 1);
    balancedPass.setQuality("Balanced");
    expect(b.defines).toEqual({ CORRIDOR_POINTS });
    expect(b.uniforms.inkEnabled!.value).toBe(false);
    expect(b.version).toBe(version + 2);
    expect(WebGLRenderTarget).toHaveBeenCalledTimes(2);
    balancedPass.dispose();
    highPass.dispose();
  });

  it("updates edge uniforms in place and remembers partial settings across quality changes and Low", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "High" });
    pass.render(new Scene(), new PerspectiveCamera());
    const { material } = screenMaterial(renderer);
    const version = material.version;
    pass.setEdges({ bleed: 0.8, ink: false });
    expect(material.uniforms.bleedStrength!.value).toBe(0.8);
    expect(material.uniforms.inkEnabled!.value).toBe(false);
    pass.setEdges({ bleed: 0 });
    pass.setEdges({});
    expect(material.uniforms.bleedStrength!.value).toBe(0);
    expect(material.uniforms.inkEnabled!.value).toBe(false);
    expect(material.version).toBe(version); // Uniform edits do not recompile the shader.
    expect(material.defines.INK_OUTLINE).toBe(1);
    pass.setQuality("Balanced");
    pass.setEdges({ ink: true });
    expect(material.uniforms.inkEnabled!.value).toBe(false);
    expect(material.defines).not.toHaveProperty("INK_OUTLINE");
    pass.setQuality("High");
    expect(material.uniforms.inkEnabled!.value).toBe(true);
    expect(WebGLRenderTarget).toHaveBeenCalledTimes(1);
    pass.setQuality("Low");
    pass.setEdges({ bleed: 1, ink: false });
    expect(WebGLRenderTarget).toHaveBeenCalledTimes(1);
    pass.setQuality("High");
    pass.render(new Scene(), new PerspectiveCamera());
    const restored = screenMaterial(renderer).material;
    expect(restored.uniforms.bleedStrength!.value).toBe(1);
    expect(restored.uniforms.inkEnabled!.value).toBe(false);
    expect(restored.defines.INK_OUTLINE).toBe(1);
    pass.dispose();
  });

  it("validates bleed atomically and remembers edge settings made before allocation", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Low" });
    pass.setEdges({ bleed: 0.7, ink: true });
    for (const bleed of [-0.1, 1.1, NaN, Infinity, -Infinity]) {
      expect(() => pass.setEdges({ bleed, ink: false })).toThrow(RangeError);
    }
    expect(WebGLRenderTarget).not.toHaveBeenCalled();
    pass.setQuality("High");
    pass.render(new Scene(), new PerspectiveCamera());
    const { material } = screenMaterial(renderer);
    expect(material.uniforms.bleedStrength!.value).toBe(0.7);
    expect(material.uniforms.inkEnabled!.value).toBe(true);
    expect(() => pass.setEdges({ bleed: NaN, ink: false })).toThrow(RangeError);
    expect(material.uniforms.bleedStrength!.value).toBe(0.7);
    expect(material.uniforms.inkEnabled!.value).toBe(true);
    pass.dispose();
  });

  it.each(["Balanced", "High"] as const)("%s limits depth reads to five with a physical one-pixel cross", quality => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality });
    pass.render(new Scene(), new PerspectiveCamera());
    const shader = screenMaterial(renderer).material.fragmentShader;
    expect(shader.match(/texture2D\(tDepth\b/g)).toHaveLength(5);
    expect(shader).toContain("vUv + vec2(texelSize.x, 0.0)");
    expect(shader).toContain("vUv - vec2(texelSize.x, 0.0)");
    expect(shader).toContain("vUv + vec2(0.0, texelSize.y)");
    expect(shader).toContain("vUv - vec2(0.0, texelSize.y)");
    expect(shader).toContain("perspectiveDepthToViewZ(depth, cameraNear, cameraFar)");
    expect(shader).toContain("orthographicDepthToViewZ(depth, cameraNear, cameraFar)");
    expect(shader).toContain("(adjacent - vec4(viewDepth)) / max(viewDepth, 1.0)");
    expect(shader).toContain("mix(0.012, 0.028, fiber)");
    expect(shader).toContain("dot(other, luma) < dot(color, luma) ? other : color");
    expect(shader).toContain("mix(color, paperColor, pooling * paperRim)");
    expect(shader).toContain("#ifdef INK_OUTLINE");
    expect(shader).toContain("inkEnabled && depth < 1.0");
    expect(shader).toContain("1.0 - smoothstep(25.0, 40.0, distanceToCamera)");
    expect(shader).toContain("inkEdge * inkFade * 0.35");
    expect(shader).toContain("mix(color, inkColor, inkAlpha)");
    pass.dispose();
  });

  it.each(["perspective", "orthographic"])("refreshes %s reconstruction matrices after the scene render", kind => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    const camera = kind === "perspective"
      ? new PerspectiveCamera(55, 1.5, 0.2, 120)
      : new OrthographicCamera(-12, 12, 8, -8, 0.2, 120);
    const scene = new Scene();
    // Model the renderer's camera update, including a moved/rotated camera on each frame.
    renderer.render.mockImplementation(renderedScene => {
      if (renderedScene !== scene) return;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    });
    for (const x of [3, 9]) {
      camera.position.set(x, 6, 14);
      camera.lookAt(0, 1.2, -10);
      camera.zoom = x / 3;
      pass.render(scene, camera);
      const { material } = screenMaterial(renderer);
      const inverse = material.uniforms.cameraProjectionMatrixInverse!.value as Matrix4;
      const world = material.uniforms.cameraMatrixWorld!.value as Matrix4;
      expect(inverse).toEqual(camera.projectionMatrixInverse);
      expect(world).toEqual(camera.matrixWorld);
      expect(inverse).not.toBe(camera.projectionMatrixInverse);
      expect(world).not.toBe(camera.matrixWorld);
      const point = new Vector3(1, 1.2, -15);
      const ndc = point.clone().project(camera);
      const view = new Vector4(ndc.x, ndc.y, ndc.z, 1).applyMatrix4(inverse);
      view.divideScalar(view.w).applyMatrix4(world);
      expect(new Vector3(view.x, view.y, view.z).distanceTo(point)).toBeLessThan(1e-10);
    }
    pass.dispose();
  });

  it("guards both fog blends below 8 m while retaining height falloff and narrow band transitions", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    pass.render(new Scene(), new PerspectiveCamera());
    const shader = screenMaterial(renderer).material.fragmentShader;
    expect(shader).toContain("smoothstep(8.0, 12.0, distanceToCamera)");
    expect(shader).toContain("layeredMist * mistStrength * nearVisibility");
    expect(shader).toContain("smoothstep(fogNear, fogFar, viewDepth) * nearVisibility");
    expect(shader).toContain("smoothstep(mistHeight, mistHeight + 2.4, worldPosition.y)");
    expect(shader).toContain("smoothstep(mistBands - vec3(1.2)");
    expect(shader).toContain("mistBands + vec3(1.2)");
    pass.dispose();
  });

  it("sizes to physical pixels, including changed DPR and sizes remembered while Low", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "Balanced" });
    expect([target().width, target().height]).toEqual([400, 225]);
    pass.render(new Scene(), new PerspectiveCamera());
    const { material } = screenMaterial(renderer);
    const texelSize = material.uniforms.texelSize!.value as Vector2;
    expect(texelSize.toArray()).toEqual([1 / 400, 1 / 225]);
    pass.setSize(801, 401);
    expect([target().width, target().height]).toEqual([1001, 501]);
    expect(texelSize.toArray()).toEqual([1 / 1001, 1 / 501]);
    renderer.getPixelRatio.mockReturnValue(2);
    pass.setSize(801, 401);
    expect([target().width, target().height]).toEqual([1602, 802]);
    expect(texelSize.toArray()).toEqual([1 / 1602, 1 / 802]);
    pass.setQuality("Low");
    pass.setSize(200, 100);
    pass.setQuality("High");
    expect([target().width, target().height]).toEqual([400, 200]);
    pass.render(new Scene(), new PerspectiveCamera());
    const restoredTexelSize = screenMaterial(renderer).material.uniforms.texelSize!.value as Vector2;
    expect(restoredTexelSize.toArray()).toEqual([1 / 400, 1 / 200]);
    pass.setSize(0, 0);
    expect([target().width, target().height]).toEqual([1, 1]);
    expect(restoredTexelSize.toArray()).toEqual([1, 1]);
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
    pass.setMist({ bands: [18, 32, 50], height: 2, strength: 0.8 });
    pass.setEdges({ bleed: 0.2, ink: false });
    expect(material.uniforms.bleedStrength!.value).toBe(0.5);
    expect(material.uniforms.inkEnabled!.value).toBe(true);
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

describe("opening-cinematic corridor mask (B2-043b review)", () => {
  it("is off by default, uploads up to CORRIDOR_POINTS path points with a radius, and validates input", async () => {
    const { PerspectiveCamera, Scene } = await import("three");
    const shaders: import("three").ShaderMaterial[] = [];
    const renderer = {
      autoClear: true,
      getSize: (out: import("three").Vector2) => out.set(100, 100),
      getPixelRatio: () => 1,
      getRenderTarget: () => null,
      setRenderTarget() {},
      render(scene: import("three").Scene) {
        const material = (scene.children[0] as import("three").Mesh | undefined)?.material;
        if (material && "uniforms" in material) shaders.push(material as import("three").ShaderMaterial);
      },
    } as unknown as import("three").WebGLRenderer;
    const pass = createPaperPass(renderer, { quality: "Balanced" });
    try {
      pass.render(new Scene(), new PerspectiveCamera());
      const material = shaders.at(-1)!;
      expect(material.uniforms.corridorCount!.value).toBe(0);
      expect(material.fragmentShader).toContain("corridorDistance(worldPosition.xz)");
      pass.setCorridor([{ x: 0, z: 0 }, { x: 0, z: -50 }, { x: 10, z: -90 }], 40);
      expect(material.uniforms.corridorCount!.value).toBe(3);
      expect(material.uniforms.corridorRadius!.value).toBe(40);
      expect(material.uniforms.corridorPoints!.value[2].toArray()).toEqual([10, -90]);
      expect(() => pass.setCorridor(Array.from({ length: CORRIDOR_POINTS + 1 }, () => ({ x: 0, z: 0 })))).toThrow(RangeError);
      expect(() => pass.setCorridor([{ x: Number.NaN, z: 0 }])).toThrow(RangeError);
      pass.setCorridor(null);
      expect(material.uniforms.corridorCount!.value).toBe(0);
    } finally { pass.dispose(); }
  });
});
