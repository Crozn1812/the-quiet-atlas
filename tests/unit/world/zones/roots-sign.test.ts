import { Mesh, MeshBasicMaterial, MeshStandardMaterial, ShaderLib, Texture, type Material, type WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { content } from "../../../../src/content";
import { bindRootsBoardGrain, createRootsBoardGeometry, createRootsSign, paintRootsSign } from "../../../../src/features/world/zones/roots-sign";
import { createPhotoFallback, createPhotoMaterial } from "../../../../src/features/world/materials/cc0";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({
    skills: content.profiles.find(profile => profile.locale === "en")!.skills,
  }) })));
});
afterEach(() => vi.unstubAllGlobals());

function canvasContext() {
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), font: "", globalAlpha: 1, globalCompositeOperation: "source-over",
    fillText: vi.fn<(title: string, x: number, y: number, max: number) => void>(),
  };
  return ctx;
}

describe("Roots wood sign", () => {
  it("waits for the overlay font, paints approved titles, and cancels late paint on teardown", async () => {
    const ctx = canvasContext();
    let loaded!: () => void;
    const load = vi.fn(() => new Promise<void>(resolve => { loaded = resolve; }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ctx }), fonts: { load } });
    const board = createRootsSign()!;
    expect(board.mesh.material).toBeInstanceOf(MeshBasicMaterial);
    expect(load).toHaveBeenCalledWith('700 96px "Noto Serif"', expect.stringContaining("Tiếng Việt"));
    expect(ctx.fillText).not.toHaveBeenCalled();
    loaded();
    expect(await board.ready).toBe(true);
    const titles = content.profiles.find(profile => profile.locale === "en")!.skills.map(skill => skill.title);
    expect(ctx.fillText.mock.calls.filter((_, i) => i % 2 === 0).map(call => call[0])).toEqual(["Skills", ...titles]);
    expect(board.mesh.material.map!.version).toBe(2);
    board.dispose();
    ctx.fillText.mockClear();
    const late = createRootsSign()!;
    const released = vi.fn();
    late.mesh.material.map!.addEventListener("dispose", released);
    late.dispose(); late.dispose();
    loaded();
    expect(await late.ready).toBe(false);
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(released).toHaveBeenCalledTimes(1);
  });

  it("keeps Vietnamese text at a medium size with open wood around every baseline", () => {
    const ctx = canvasContext(), fonts: string[] = [];
    ctx.fillText.mockImplementation(() => { fonts.push(ctx.font); });
    paintRootsSign(ctx as unknown as CanvasRenderingContext2D, ["Điện toán đám mây", "Mạng và hệ thống"]);
    expect(ctx.fillText.mock.calls.map(call => call[0])).toContain("Mạng và hệ thống");
    expect(fonts.every(font => font.includes('"Noto Serif"'))).toBe(true);
    // 96 / 1920 * 4.2 m = 0.21 m; bold glyphs retain their interior at 5 m.
    expect(fonts).toContain('700 96px "Noto Serif"');
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1536, 1920);
    expect(ctx.fillRect.mock.calls.some(call => call[2] === 1536)).toBe(false);
    expect(ctx.globalCompositeOperation).toBe("source-over");
    expect(ctx.globalAlpha).toBe(1);
  });

  it("has six closed bevelled planks and open joints within the existing collider", () => {
    const wood = createRootsBoardGeometry();
    try {
      wood.computeBoundingBox();
      expect(wood.boundingBox!.min.x).toBeGreaterThanOrEqual(-1.7);
      expect(wood.boundingBox!.max.x).toBeLessThanOrEqual(1.7);
      expect(wood.boundingBox!.min.z).toBeCloseTo(-0.08);
      const p = wood.getAttribute("position");
      for (let row = 1; row < 6; row++) {
        const joint = 2.1 - row * 0.7;
        for (let i = 0; i < p.count; i++) expect(Math.abs(p.getY(i) - joint)).toBeGreaterThan(0.005);
      }
      expect(wood.getAttribute("color").count).toBe(p.count);
      expect(wood.getAttribute("signGrain").count).toBe(p.count);
      const grain = wood.getAttribute("signGrain");
      for (let i = 0; i < grain.count; i++) {
        expect(grain.getX(i)).toBeCloseTo(p.getX(i));
        expect(grain.getY(i)).toBeCloseTo(p.getY(i));
        expect(grain.getZ(i)).toBe(1);
      }
    } finally { wood.dispose(); }
  });

  it("replaces bark only on sign vertices for High and Low, decorating quality replacements once", () => {
    const geometry = createRootsBoardGeometry(), original = new MeshStandardMaterial();
    const atlases = [new Texture(), new Texture()];
    const high = createPhotoMaterial("bark", original, atlases, 2048);
    const low = createPhotoFallback("bark", original);
    const mesh = new Mesh(geometry, original as Material);
    bindRootsBoardGrain(mesh);
    const render = () => mesh.onBeforeRender(...([] as unknown as Parameters<typeof mesh.onBeforeRender>));
    try {
      render(); // Decorate the original before photo adapters inherit its hook.
      mesh.material = high;
      render();
      const key = high.customProgramCacheKey();
      render();
      expect(high.customProgramCacheKey()).toBe(key);
      expect(key).toContain("roots-sawn-timber-v2");
      const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} };
      high.onBeforeCompile(shader as Parameters<typeof high.onBeforeCompile>[0], {} as WebGLRenderer);
      expect(shader.uniforms).toMatchObject({ photoColor: { value: atlases[0] }, photoSurface: { value: atlases[1] } });
      expect(shader.vertexShader).toContain("vSignGrain = signGrain;");
      expect(shader.fragmentShader).toContain("diffuseColor.rgb = rootsTimber(vSignGrain.xy)");
      expect(shader.fragmentShader).toContain("if (vSignGrain.z < 0.5) normal");
      expect(shader.fragmentShader).not.toContain("photoRead(photoColor, vSignGrain.xy");
      mesh.material = low;
      const lowKey = low.customProgramCacheKey();
      render();
      expect(low.customProgramCacheKey()).toBe(lowKey + "|roots-sawn-timber-v2");
      const lowShader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader, uniforms: {} };
      low.onBeforeCompile(lowShader as Parameters<typeof low.onBeforeCompile>[0], {} as WebGLRenderer);
      expect(lowShader.fragmentShader).toContain("diffuseColor.rgb = rootsTimber(vSignGrain.xy)");
      expect(lowShader.fragmentShader).not.toContain("uniform sampler2D photo");
      expect(lowShader.vertexShader.split("attribute vec3 signGrain;")).toHaveLength(2);
      const balanced = createPhotoMaterial("bark", original, atlases, 512);
      mesh.material = balanced; render();
      const inherited = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} };
      balanced.onBeforeCompile(inherited as Parameters<typeof balanced.onBeforeCompile>[0], {} as WebGLRenderer);
      expect(inherited.vertexShader.split("attribute vec3 signGrain;")).toHaveLength(2);
      expect(inherited.fragmentShader.split("vec3 rootsTimber(")).toHaveLength(2);
      balanced.dispose();
      mesh.material = high;
      render();
      expect(high.customProgramCacheKey()).toBe(key);
    } finally {
      geometry.dispose(); original.dispose(); high.dispose(); low.dispose(); atlases.forEach(atlas => atlas.dispose());
    }
  });

  it("supports SSR, a missing canvas context, and failed font loads without leaking", async () => {
    expect(createRootsSign()).toBeUndefined();
    vi.stubGlobal("document", { createElement: () => ({}) });
    expect(createRootsSign()).toBeUndefined();
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    expect(createRootsSign()).toBeUndefined();
    const ctx = canvasContext();
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => ctx }), fonts: { load: () => Promise.reject(new Error("font unavailable")) },
    });
    const board = createRootsSign()!;
    expect(await board.ready).toBe(false);
    expect(ctx.fillText).not.toHaveBeenCalled();
    board.dispose();
  });
});
