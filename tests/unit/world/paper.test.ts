import {
  ACESFilmicToneMapping, BufferGeometry, Color, DepthTexture, Fog, HalfFloatType,
  Matrix3, Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, Scene, ShaderChunk, ShaderMaterial,
  SRGBColorSpace, Vector2, Vector3, Vector4, WebGLRenderTarget, type WebGLRenderer,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PALETTE } from "../../../src/features/world/art/palette";
import { fogAt as directedFogAt, FOREST_ATMOSPHERE_TRANSITION, paletteColor, STYLE_PRESETS } from "../../../src/features/world/art/direction";
import { createGradedPaperPass } from "../../../src/features/world/scene/paper";
import { directGrade } from "../../../src/features/world/scene/compose";
import { timeOfDayAt } from "../../../src/features/world/layout/lighting";
import { applyCoastAtmosphere, lightingAt } from "../../../src/features/world/sky/grade";
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

function shaderDepthJump(shader: string) {
  // Execute the actual scalar GLSL body: its arithmetic/branch syntax is also
  // valid JS. This avoids testing a separately maintained copy of the detector.
  const body = shader.match(/float relativeDepthDiscontinuity\(float center, float forward, float backward\) \{([\s\S]*?)\n  \}/)![1]!;
  const evaluate = new Function("center", "forward", "backward", "perspective", "max", body);
  return (center: number, forward: number, backward: number, perspective: boolean) =>
    evaluate(center, forward, backward, perspective, Math.max) as number;
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it("changes and clears cinematic fog on the existing pass without rebuilding GPU resources", () => {
  const { gpu, renderer } = mockRenderer();
  const pass = createGradedPaperPass(gpu, "High");
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  try {
    pass.render(scene, camera);
    const material = screenMaterial(renderer).material;
    const allocations = vi.mocked(WebGLRenderTarget).mock.calls.length;
    const horizon = new Color(PALETTE.sunGold);
    pass.setFogColorOverride(horizon);
    pass.setGrade(lightingAt(0.8));
    pass.render(scene, camera);
    expect(screenMaterial(renderer).material).toBe(material);
    expect(material.uniforms.fogColor!.value.toArray()).toEqual(horizon.toArray());
    pass.setFogColorOverride(null);
    pass.setGrade(lightingAt(0.2));
    pass.render(scene, camera);
    expect(screenMaterial(renderer).material).toBe(material);
    expect(vi.mocked(WebGLRenderTarget).mock.calls.length).toBe(allocations);
    expect(material.uniforms.fogColor!.value.toArray()).not.toEqual(horizon.toArray());
  } finally { pass.dispose(); }
});

// Resolve the material's feature switches before checking which reads/operations
// execute. Merely finding grain text in an inactive #ifdef would miss this contract.
function activeShader(material: ShaderMaterial) {
  const enabled = [true];
  return material.fragmentShader.split("\n").filter(line => {
    const directive = line.trim().match(/^#(ifdef|ifndef|endif)\s*(\w*)/);
    if (directive?.[1] === "ifdef" || directive?.[1] === "ifndef") {
      const defined = Object.hasOwn(material.defines, directive[2]!);
      enabled.push(enabled.at(-1)! && (directive[1] === "ifdef" ? defined : !defined));
      return false;
    }
    if (directive?.[1] === "endif") { enabled.pop(); return false; }
    return enabled.at(-1);
  }).join("\n");
}

function aces(color: Color, exposure: number): Color {
  // Execute the installed Three shader's coefficients and scalar fit on the CPU.
  const source = ShaderChunk.tonemapping_pars_fragment;
  const matrix = (name: string) => {
    const body = source.match(new RegExp(`const mat3 ${name} = mat3\\(([\\s\\S]*?)\\);`))![1]!;
    const values = [...body.matchAll(/vec3\(\s*([^)]*)\)/g)].flatMap(match => match[1]!.split(",").map(Number));
    return new Matrix3().fromArray(values);
  };
  const body = source.match(/vec3 RRTAndODTFit\( vec3 v \) \{([\s\S]*?)\}/)![1]!;
  const fit = new Function("v", body.replaceAll("vec3", "const")) as (v: number) => number;
  const value = new Vector3(...color.toArray()).multiplyScalar(exposure / 0.6).applyMatrix3(matrix("ACESInputMat"));
  value.set(...value.toArray().map(fit) as [number, number, number]).applyMatrix3(matrix("ACESOutputMat"));
  return new Color().setRGB(...value.toArray().map(channel => Math.max(0, Math.min(1, channel))) as [number, number, number]);
}

describe("R clear post", () => {
  it.each(["Balanced", "High"] as const)("%s retains >=85%% green saturation at 40 m, including the screen rim", quality => {
    const { renderer, gpu } = mockRenderer();
    const paper = createGradedPaperPass(gpu, quality);
    const smoothstep = (a: number, b: number, x: number) => {
      const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return u * u * (3 - 2 * u);
    };
    const saturation = (color: Color) => {
      const rgb = color.getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
      return (Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)) / Math.max(rgb.r, rgb.g, rgb.b);
    };
    try {
      for (const t of [0.5, 0.9]) {
        paper.setFog(directedFogAt(t));
        paper.setGrade(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)));
        paper.render(new Scene(), new PerspectiveCamera());
        const { material } = screenMaterial(renderer);
        const u = material.uniforms;
        const source = activeShader(material);
        expect(source).not.toMatch(/float grain\s*=|float vignette\s*=|pooling \* paperRim/);
        expect(u.inkEnabled!.value).toBe(false);
        expect(u.bleedStrength!.value).toBeLessThanOrEqual(0.04);
        const bands = (u.mistBands!.value as Vector3).toArray().map(d => smoothstep(d - 1.2, d + 1.2, 40));
        const expression = source.match(/float layeredMist = ([\s\S]*?);/)![1]!;
        const layered = new Function("bands", "lowMist", `return ${expression}`)({ x: bands[0], y: bands[1], z: bands[2] }, 1) as number;
        const original = new Color(PALETTE.grass);
        // Include ACES at the renderer exposure, maximum ground mist and edge
        // pooling toward a black neighbour. Grain/vignette/rim are compiled out.
        const after = aces(original, renderer.toneMappingExposure).multiplyScalar(1 - u.bleedStrength!.value * 0.12)
          .lerp(u.mistColor!.value, layered * u.mistStrength!.value)
          .lerp(u.fogColor!.value, smoothstep(u.fogNear!.value, u.fogFar!.value, 40));
        expect(saturation(after) / saturation(original)).toBeGreaterThanOrEqual(0.85);
        expect(layered * u.mistStrength!.value).toBeLessThanOrEqual(0.004);
        expect(smoothstep(u.fogNear!.value, u.fogFar!.value, 119.99)).toBe(0);
      }
    } finally { paper.dispose(); }
  });

  it.each([0.3, 0.9])("directs fog at path t=%s toward warm dawn/dusk air without paper", t => {
    const tod = timeOfDayAt(t);
    const fog = directGrade(lightingAt(tod), tod).fogColor;
    const distance = (color: Color) => new Vector3(...fog.toArray()).distanceTo(new Vector3(...color.toArray()));
    // B2-180 intentionally replaces B2-161's blue-at-all-times fog expectation.
    expect(distance(new Color(PALETTE.mist))).toBeLessThan(distance(new Color(PALETTE.paper)));
    expect(fog.r).toBeGreaterThan(fog.b);
    if (t === 0.9) expect(fog.toArray()).toEqual(lightingAt(1).fogColor.toArray().map(v => expect.closeTo(v, 12)));
  });

  it("keeps grain off across quality changes, reads no paper texture, and retains one post triangle", () => {
    const { renderer, gpu } = mockRenderer();
    const paper = createGradedPaperPass(gpu, "Balanced");
    try {
      for (const quality of ["High", "Balanced", "Low", "High"] as const) {
        paper.setQuality(quality);
        renderer.render.mockClear();
        paper.render(new Scene(), new PerspectiveCamera());
        expect(renderer.render).toHaveBeenCalledTimes(quality === "Low" ? 1 : 2);
        if (quality === "Low") continue;
        const { material, triangle } = screenMaterial(renderer);
        const source = activeShader(material);
        expect(source.match(/uniform sampler2D \w+;/g)).toEqual(["uniform sampler2D tColor;", "uniform sampler2D tDepth;"]);
        expect(source).not.toContain("float grain =");
        expect(source).not.toContain("float vignette =");
        expect(triangle.geometry.getAttribute("position").count).toBe(3);
        expect(material.uniforms.inkEnabled!.value).toBe(false);
      }
    } finally { paper.dispose(); }
  });

  it("keeps actual coast/hill fog blue in both native Low and post rendering", () => {
    const { renderer, gpu } = mockRenderer();
    const pass = createGradedPaperPass(gpu, "Balanced");
    const scene = new Scene();
    const native = new Fog(PALETTE.paper, 120, 700);
    scene.fog = native;
    const expected = new Color(PALETTE.skyLow).lerp(new Color(PALETTE.cloud), 0.3);
    try {
      for (const quality of ["Balanced", "High", "Low", "High"] as const) {
        pass.setQuality(quality);
        for (const t of [0.5, 0.9, 0.5]) {
          const distances = directedFogAt(t);
          const grade = applyCoastAtmosphere(directGrade(lightingAt(timeOfDayAt(t)), timeOfDayAt(t)), t);
          // Known integration limit for B2-180: scene/paper.ts (outside the ticket)
          // still overrides the warm coast grade with its fixed blue clearFog.
          if (t === 0.9) expect(grade.fogColor).not.toEqual(expected);
          native.color.copy(grade.fogColor); // Composer sets this before paper.render.
          Object.assign(native, distances);
          pass.setFog(distances);
          pass.setGrade(grade);
          pass.render(scene, new PerspectiveCamera());
          expect(scene.fog).toBe(native);
          expect(native.color).toEqual(expected);
          expect(native.near).toBe(distances.near);
          expect(native.far).toBe(distances.far);
          if (quality !== "Low") {
            const { material } = screenMaterial(renderer);
            expect(material.uniforms.fogColor!.value).toEqual(expected);
            expect(material.uniforms.mistColor!.value).toEqual(expected);
          }
        }
      }
    } finally { pass.dispose(); }
  });

  it.each(["A", "B", "C"] as const)("preserves the %s paper/grain profile", id => {
    const { renderer, gpu } = mockRenderer();
    const pass = createGradedPaperPass(gpu, "High", STYLE_PRESETS[id]);
    try {
      pass.render(new Scene(), new PerspectiveCamera());
      const { material } = screenMaterial(renderer);
      expect(activeShader(material)).toContain("float grain =");
      expect(activeShader(material)).toContain("float vignette =");
      expect(material.uniforms.inkEnabled!.value).toBe(STYLE_PRESETS[id].background.edges.ink);
    } finally { pass.dispose(); }
  });
});

describe("forest depth atmosphere (B2-169)", () => {
  const smoothstep = (a: number, b: number, x: number) => {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const distance = (a: Color, b: Color) => new Vector3(...a.toArray()).distanceTo(new Vector3(...b.toArray()));

  it.each(["Low", "Balanced", "High"] as const)("%s keeps near trees clear, fades depth layers and restores clear hills", quality => {
    const { renderer, gpu } = mockRenderer();
    const paper = createGradedPaperPass(gpu, quality);
    const scene = new Scene();
    const native = new Fog(PALETTE.paper, 1, 2);
    scene.fog = native;
    const forestColor = new Color(paletteColor(STYLE_PRESETS.R.background.forest!.color));
    const { start, end } = FOREST_ATMOSPHERE_TRANSITION;
    const samples = [0.1, (start + end) / 2, 0.5, 0.9, 0.1];
    const readings: number[] = [];
    try {
      for (const t of samples) {
        const fog = directedFogAt(t);
        paper.setFog(fog);
        paper.setGrade(applyCoastAtmosphere(lightingAt(1), t));
        paper.setMist({ height: 100 }); // Worst-case ground mist, also at elevated forest terrain.
        paper.render(scene, new PerspectiveCamera());
        expect(native.near).toBe(fog.near);
        expect(native.far).toBe(fog.far);
        const u = quality === "Low" ? undefined : screenMaterial(renderer).material.uniforms;
        const amount = (depth: number) => {
          if (!u) return smoothstep(native.near, native.far, depth);
          const source = screenMaterial(renderer).material.fragmentShader;
          const expression = source.match(/float layeredMist = ([\s\S]*?);/)![1]!;
          const bands = (u.mistBands!.value as Vector3).toArray().map(d => smoothstep(d - 1.2, d + 1.2, depth));
          const layered = new Function("bands", "lowMist", `return ${expression}`)({ x: bands[0], y: bands[1], z: bands[2] }, 1) as number;
          const mist = layered * u.mistStrength!.value * smoothstep(8, 12, depth);
          const fogAlpha = smoothstep(u.fogNear!.value, u.fogFar!.value, depth);
          return 1 - (1 - mist) * (1 - fogAlpha);
        };
        if (t === 0.1) {
          for (const depth of [0, 8, 12, 24.99]) expect(amount(depth)).toBeLessThanOrEqual(0.03);
          expect(amount(30)).toBeLessThanOrEqual(0.15);
          expect(amount(100)).toBeGreaterThanOrEqual(0.45);
          const depths = [40, 60, 80, 100, 120].map(amount);
          depths.slice(1).forEach((value, i) => expect(value).toBeGreaterThan(depths[i]!));
          expect(native.color).toEqual(forestColor);
          for (const color of [native.color, ...(u ? [u.fogColor!.value as Color, u.mistColor!.value as Color] : [])]) {
            expect(distance(color, new Color(PALETTE.mist))).toBeLessThan(distance(color, new Color(PALETTE.paper)));
            expect(distance(color, new Color(PALETTE.skyLow))).toBeLessThan(distance(color, new Color(PALETTE.paper)));
            expect(color.g).toBeGreaterThan(color.r);
          }
        } else if (t >= 0.5) expect(amount(100)).toBeLessThanOrEqual(0.15);
        if (u) {
          expect(u.fogNear!.value).toBe(native.near);
          expect(u.fogFar!.value).toBe(native.far);
          expect(u.fogColor!.value).toEqual(native.color);
          expect(renderer.render.mock.calls.at(-1)![0].children).toHaveLength(1);
        }
        readings.push(amount(100));
      }
      expect(readings[0]).toBe(readings.at(-1));
      expect(readings[1]).toBeLessThan(readings[0]!);
      expect(readings[1]).toBeGreaterThan(readings[2]!);
      // Forest parameters and its palette tint survive Low -> High allocation.
      paper.setQuality("Low");
      paper.setQuality("High");
      paper.render(scene, new PerspectiveCamera());
      const u = screenMaterial(renderer).material.uniforms;
      expect(u.fogColor!.value).toEqual(forestColor);
      expect(u.mistStrength!.value).toBe(STYLE_PRESETS.R.background.forest!.mist.strength);
    } finally { paper.dispose(); }
  });
});

describe("position-graded coast clarity", () => {
  const fogAt = (t: number) => directedFogAt(t, STYLE_PRESETS.C);
  it.each(["Balanced", "High"] as const)("%s preserves at least 75%% contrast at 30 m, with <=25%% of forest mist/fog", quality => {
    const { renderer, gpu } = mockRenderer();
    const paper = createGradedPaperPass(gpu, quality, STYLE_PRESETS.C);
    const smoothstep = (a: number, b: number, x: number) => {
      const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return u * u * (3 - 2 * u);
    };
    const measure = (t: number) => {
      paper.setFog(fogAt(t));
      paper.setGrade(applyCoastAtmosphere(lightingAt(1), t));
      paper.render(new Scene(), new PerspectiveCamera());
      const { material } = screenMaterial(renderer);
      const u = material.uniforms;
      const bands = (u.mistBands!.value as Vector3).toArray().map(d => smoothstep(d - 1.2, d + 1.2, 30));
      // Evaluate the shader's actual layer composition at maximum ground mist.
      const expression = material.fragmentShader.match(/float layeredMist = ([\s\S]*?);/)![1]!;
      const layered = new Function("bands", "lowMist", `return ${expression}`)({ x: bands[0], y: bands[1], z: bands[2] }, 1) as number;
      return {
        mist: layered * (u.mistStrength!.value as number),
        fog: smoothstep(u.fogNear!.value as number, u.fogFar!.value as number, 30),
        fog120: smoothstep(u.fogNear!.value as number, u.fogFar!.value as number, 120),
        far: u.fogFar!.value as number,
      };
    };
    try {
      const forest = measure(0.3);
      expect(forest).toMatchInlineSnapshot(`
        {
          "far": 260,
          "fog": 0,
          "fog120": 0.3005259203606311,
          "mist": 0.08999999999999997,
        }
      `);
      for (const t of [0.82, 0.9, 1]) {
        const coast = measure(t);
        expect(coast.mist).toBeLessThanOrEqual(0.25 * forest.mist);
        expect(coast.fog).toBeLessThanOrEqual(0.25 * forest.fog);
        expect((1 - coast.mist) * (1 - coast.fog)).toBeGreaterThanOrEqual(0.75);
      }
      const coast = measure(0.9);
      expect(coast).toMatchInlineSnapshot(`
        {
          "far": 400,
          "fog": 0,
          "fog120": 0.012740740740740742,
          "mist": 0.008999999999999994,
        }
      `);
      expect(coast.far).toBeGreaterThanOrEqual(380);
      expect(coast.fog120).toBeLessThanOrEqual(0.25 * forest.fog120);
      expect(measure(0.3)).toEqual(forest); // Walking back restores the forest.
      paper.setQuality("Low");
      paper.setFog(fogAt(0.9));
      paper.setGrade(applyCoastAtmosphere(lightingAt(1), 0.9));
      paper.setQuality(quality);
      expect(measure(0.9)).toEqual(coast);
    } finally { paper.dispose(); }
  });

  it("leaves forest cinematic mist overrides intact", () => {
    const { renderer, gpu } = mockRenderer();
    const paper = createGradedPaperPass(gpu, "Balanced", STYLE_PRESETS.C);
    try {
      paper.setMist({ strength: STYLE_PRESETS.C.background.mist.strength + 0.2 });
      paper.setGrade(applyCoastAtmosphere(lightingAt(0), 0.3));
      paper.render(new Scene(), new PerspectiveCamera());
      expect(screenMaterial(renderer).material.uniforms.mistStrength!.value).toBe(0.7);
    } finally { paper.dispose(); }
  });
});

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
    expect(shader).toContain("mix(0.03, 0.06, fiber)");
    expect(shader).toContain("relativeDepthDiscontinuity(viewDepth, adjacent.x, adjacent.y)");
    expect(shader).toContain("relativeDepthDiscontinuity(viewDepth, adjacent.z, adjacent.w)");
    expect(shader).toContain("max(abs(discontinuity.x), abs(discontinuity.y))");
    expect(shader).toContain("float foregroundEdge = max(discontinuity.x, discontinuity.y)");
    expect(shader).toContain("dot(other, luma) < dot(color, luma) ? other : color");
    expect(shader).toContain("mix(color, paperColor, pooling * paperRim)");
    expect(shader).toContain("#ifdef INK_OUTLINE");
    expect(shader).toContain("inkEnabled && depth < 1.0");
    expect(shader).toContain("1.0 - smoothstep(25.0, 40.0, distanceToCamera)");
    expect(shader).toContain("inkEdge * inkFade * 0.35");
    expect(shader).toContain("mix(color, inkColor, inkAlpha)");
    pass.dispose();
  });

  it.each([true, false])("rejects continuous slopes and nearly coplanar terrain (perspective=%s)", perspective => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "High" });
    try {
      pass.render(new Scene(), new PerspectiveCamera());
      const shader = screenMaterial(renderer).material.fragmentShader;
      const jump = shaderDepthJump(shader);
      for (const distance of [0.05, 2, 10, 35, 120]) {
        for (const slope of [-0.45, -0.15, -0.02, 0, 0.02, 0.15, 0.45]) {
          // Perspective planes have affine reciprocal depth; orthographic planes
          // have affine linear depth. Even a large first difference is no edge.
          const forward = perspective ? distance / (1 - slope) : distance * (1 + slope);
          const backward = perspective ? distance / (1 + slope) : distance * (1 - slope);
          expect(Math.abs(jump(distance, forward, backward, perspective))).toBeLessThan(1e-12);
          // Adjacent terrain triangles differing by 0.5% of depth remain unpainted
          // at every fiber threshold, rather than tracing the tessellation.
          const facet = perspective ? distance / (1 - slope - 0.005) : forward + distance * 0.005;
          expect(Math.abs(jump(distance, facet, backward, perspective))).toBeLessThan(0.03);
        }
      }
    } finally { pass.dispose(); }
  });

  it.each([true, false])("retains foreground object/sky silhouettes at relative distances (perspective=%s)", perspective => {
    const { renderer, gpu } = mockRenderer();
    const pass = createPaperPass(gpu, { quality: "High" });
    try {
      pass.render(new Scene(), new PerspectiveCamera());
      const shader = screenMaterial(renderer).material.fragmentShader;
      const jump = shaderDepthJump(shader);
      for (const distance of [0.05, 2, 10, 25, 35]) {
        const background = distance * 1.25;
        // A trunk, prop or character with a 25% background gap survives even
        // the highest fiber threshold's upper smoothstep bound (2 * 6%).
        expect(jump(distance, background, distance, perspective)).toBeGreaterThan(0.12);
        expect(jump(distance, distance, background, perspective)).toBeGreaterThan(0.12);
        expect(jump(distance, background, background, perspective)).toBeGreaterThan(0.12); // Thin object.
        expect(jump(distance, 320, distance, perspective)).toBeGreaterThan(0.12); // Sky.
        expect(jump(background, distance, background, perspective)).toBeLessThan(0); // Rear side gets no ink.
        expect(jump(distance, distance * 1.01, distance, perspective)).toBeLessThan(0.03);
      }
    } finally { pass.dispose(); }
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
