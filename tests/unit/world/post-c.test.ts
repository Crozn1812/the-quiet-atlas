import { Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, Vector2, WebGLRenderTarget, type WebGLRenderer } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { createGradedPaperPass } from "../../../src/features/world/post/runtime";
import { lightingAt } from "../../../src/features/world/sky/grade";
import { createEnvironment } from "../../../src/features/world/sky/environment";

vi.mock("three/examples/jsm/postprocessing/EffectComposer.js", async original => {
  const { EffectComposer: Real } = await original<typeof import("three/examples/jsm/postprocessing/EffectComposer.js")>();
  return { EffectComposer: vi.fn(class extends Real { render = vi.fn(); }) };
});
vi.mock("../../../src/features/world/sky/environment", () => ({ createEnvironment: vi.fn(() => ({
  setQuality: vi.fn(), setActive: vi.fn(), setTimeOfDay: vi.fn(), update: vi.fn(), dispose: vi.fn(),
})) }));

function setup(quality: "Low" | "Balanced" | "High", ready = true) {
  const renderer = {
    getSize: (out: Vector2) => out.set(800, 450), getPixelRatio: () => 1.5,
    shadowMap: { autoUpdate: true, enabled: true }, render: vi.fn(),
    autoClear: true, getRenderTarget: () => null, setRenderTarget: vi.fn(), clear: vi.fn(),
  };
  const gpu = renderer as unknown as WebGLRenderer;
  const scene = new Scene(), camera = new PerspectiveCamera();
  const pass = createGradedPaperPass(gpu, quality);
  if (ready) pass.startDeferred(scene);
  return { renderer, gpu, scene, camera, pass };
}
const composer = () => vi.mocked(EffectComposer).mock.results.at(-1)!.value as EffectComposer;
const bokeh = () => composer().passes.find(item => item instanceof ShaderPass && item.uniforms.aperture) as ShaderPass | undefined;
beforeEach(() => vi.clearAllMocks());

describe("direction C runtime", () => {
  it("leaves construction time between slow startup draws, but redraws pauses and completed Low worlds immediately", () => {
    const { renderer, scene, camera, pass } = setup("High", false);
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    renderer.render.mockImplementation(() => { now += 80; });
    try {
      pass.setMotion(false, 0.1); pass.render(scene, camera);
      expect(renderer.render).toHaveBeenCalledOnce();
      now = 100; pass.render(scene, camera);
      expect(renderer.render).toHaveBeenCalledOnce();
      pass.setMotion(false, 0); pass.render(scene, camera);
      expect(renderer.render).toHaveBeenCalledTimes(2);
      now = 400; pass.setMotion(false, 0.1); pass.render(scene, camera);
      expect(renderer.render).toHaveBeenCalledTimes(3);
      pass.startDeferred(scene); pass.setQuality("Low");
      pass.render(scene, camera); pass.render(scene, camera);
      expect(renderer.render).toHaveBeenCalledTimes(5);
      expect(EffectComposer).not.toHaveBeenCalled();
      expect(createEnvironment).not.toHaveBeenCalled();
    } finally { pass.dispose(); clock.mockRestore(); }
  });
  it("keeps every build-pending frame free of post, shadows and HDRI, even at High", () => {
    const { renderer, scene, camera, pass } = setup("High", false);
    for (let frame = 0; frame < 20; frame++) pass.render(scene, camera);
    expect(renderer.render).toHaveBeenCalledTimes(20);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(EffectComposer).not.toHaveBeenCalled();
    expect(createEnvironment).not.toHaveBeenCalled();
    expect(scene.getObjectByName("hr-forest-floor")).toBeUndefined();
    pass.setQuality("Low"); pass.startDeferred(scene); pass.render(scene, camera);
    expect(EffectComposer).not.toHaveBeenCalled();
    expect(createEnvironment).not.toHaveBeenCalled();
    pass.setQuality("Balanced"); pass.render(scene, camera);
    expect(EffectComposer).toHaveBeenCalledOnce();
    expect(createEnvironment).toHaveBeenCalledOnce();
    expect(scene.getObjectByName("hr-forest-floor")).toBeDefined();
    expect(renderer.shadowMap.enabled).toBe(true);
    pass.setQuality("Low"); pass.render(scene, camera);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(scene.getObjectByName("hr-forest-floor")).toBeUndefined();
    expect(vi.mocked(createEnvironment).mock.results[0]!.value.setQuality).toHaveBeenLastCalledWith("Low");
    pass.dispose();
  });
  it("cancels hidden-tab environment work and removes its visibility listener on exit", () => {
    const document = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", document);
    const remove = vi.spyOn(document, "removeEventListener");
    const { scene, camera, pass } = setup("High");
    try {
      pass.render(scene, camera); pass.render(scene, camera);
      const environment = vi.mocked(createEnvironment).mock.results[0]!.value;
      document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
      expect(environment.setActive).toHaveBeenLastCalledWith(false);
      document.hidden = false; document.dispatchEvent(new Event("visibilitychange"));
      expect(environment.setActive).toHaveBeenLastCalledWith(true);
      pass.dispose();
      expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    } finally { pass.dispose(); vi.unstubAllGlobals(); }
  });
  it("presents the first playable frame before allocating or compiling optional post effects", () => {
    const { renderer, scene, camera, pass } = setup("High");
    pass.render(scene, camera);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(EffectComposer).not.toHaveBeenCalled();
    pass.render(scene, camera);
    expect(EffectComposer).toHaveBeenCalledOnce();
    pass.dispose();
  });
  it("Low renders directly without post allocation; quality switches release all post resources", () => {
    const { renderer, scene, camera, pass } = setup("Low");
    pass.render(scene, camera);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(EffectComposer).not.toHaveBeenCalled();
    pass.setQuality("Balanced"); pass.render(scene, camera);
    const pipeline = composer();
    expect(pipeline.passes.map(item => item.constructor.name)).toEqual(["RenderPass", "GTAOPass", "UnrealBloomPass", "ShaderPass", "ShaderPass", "OutputPass"]);
    const release = pipeline.passes.map(item => vi.spyOn(item, "dispose"));
    pass.setQuality("Low");
    release.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    pass.dispose(); pass.dispose();
    release.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
  it("uses half physical resolution GTAO and follows DPR/viewport resize", () => {
    const { scene, camera, pass } = setup("High");
    pass.render(scene, camera);
    pass.render(scene, camera);
    const ao = composer().passes.find(item => item instanceof GTAOPass) as GTAOPass;
    expect([ao.width, ao.height]).toEqual([600, 338]);
    pass.setSize(1024, 768);
    expect([ao.width, ao.height]).toEqual([768, 576]);
    pass.dispose();
  });
  it("enables subtle High DOF only after idle, immediately disabling it for player or camera movement", () => {
    const { scene, camera, pass } = setup("High");
    pass.render(scene, camera);
    pass.render(scene, camera);
    const dof = bokeh()!;
    expect(dof.enabled).toBe(false);
    for (let i = 0; i < 4; i++) { pass.setMotion(false, 0.1, 14); pass.render(scene, camera); }
    expect(dof.enabled).toBe(true);
    expect(dof.uniforms.focus!.value).toBe(14);
    camera.rotation.y += 0.1; pass.render(scene, camera);
    expect(dof.enabled).toBe(false);
    for (let i = 0; i < 4; i++) { pass.setMotion(false, 0.1); pass.render(scene, camera); }
    expect(dof.enabled).toBe(true);
    pass.setMotion(true, 0.1); pass.render(scene, camera);
    expect(dof.enabled).toBe(false);
    pass.setQuality("Balanced"); pass.render(scene, camera);
    expect(bokeh()!.enabled).toBe(false);
    pass.dispose();
  });
  it.each(["Balanced", "High"] as const)("keeps moving %s cinematic subjects in focus before deferred assets, then restores gameplay", quality => {
    const { scene, camera, pass } = setup(quality, false);
    pass.render(scene, camera);
    pass.setCinematic({ kind: "intro", strength: 1, focus: 75 });
    pass.setMotion(true, 1 / 60);
    camera.position.z += 1;
    pass.render(scene, camera);
    const dof = bokeh()!;
    expect(dof.enabled).toBe(true);
    expect(dof.uniforms.focus!.value).toBe(75);
    expect(createEnvironment).not.toHaveBeenCalled();
    const grade = composer().passes.find(item => item instanceof ShaderPass && item.uniforms.saturation) as ShaderPass;
    expect(grade.uniforms.saturation!.value).toBe(0.92);
    pass.setCinematic({ kind: "ending", strength: 1, focus: 4.5 });
    pass.render(scene, camera);
    expect(dof.uniforms.focus!.value).toBe(4.5);
    expect(grade.uniforms.saturation!.value).toBe(0.9);
    pass.setCinematic(null); pass.startDeferred(scene); pass.render(scene, camera);
    expect(dof.enabled).toBe(false);
    expect(grade.uniforms.saturation!.value).toBe(0.94);
    pass.dispose();
  });
  it("applies cinematic light on Low without post/HDRI and restores lights after a failed draw", () => {
    const { scene, camera, renderer, pass } = setup("Low", false);
    const sun = new DirectionalLight(0xffffff, 1), fill = new HemisphereLight(0xffffff, 0x222222, 0.5);
    scene.add(sun, fill);
    const original = sun.color.clone();
    pass.setCinematic({ kind: "intro", strength: 1, focus: 10 });
    renderer.render.mockImplementation(() => {
      expect(sun.intensity).toBe(1.04); expect(fill.intensity).toBe(0.55);
      expect(sun.color.equals(original)).toBe(false);
      throw new Error("draw failed");
    });
    expect(() => pass.render(scene, camera)).toThrow("draw failed");
    expect(sun.color.equals(original)).toBe(true);
    expect(sun.intensity).toBe(1); expect(fill.intensity).toBe(0.5);
    expect(EffectComposer).not.toHaveBeenCalled(); expect(createEnvironment).not.toHaveBeenCalled();
    pass.dispose();
  });
  it("applies the native position fog and cinematic override, restoring scene state even on a draw error", () => {
    const { renderer, scene, camera, pass } = setup("Low");
    const fog = new Fog(0x123456, 10, 100); scene.fog = fog;
    const original = fog.color.clone();
    pass.setGrade(lightingAt(0)); pass.setFog({ near: 30, far: 180 });
    pass.setFogColorOverride(new Color(0xabcdef));
    renderer.render.mockImplementation(() => {
      expect(fog.color.getHex()).toBe(0xabcdef); expect([fog.near, fog.far]).toEqual([30, 180]);
      throw new Error("draw failed");
    });
    expect(() => pass.render(scene, camera)).toThrow("draw failed");
    expect(fog.color.equals(original)).toBe(true); expect([fog.near, fog.far]).toEqual([10, 100]);
    pass.dispose();
  });
  it("shares the true color-pass depth between AO/DOF without rendering geometry twice", () => {
    const { scene, camera, gpu, renderer, pass } = setup("High");
    pass.render(scene, camera);
    pass.render(scene, camera);
    const ao = composer().passes.find(item => item instanceof GTAOPass) as GTAOPass;
    expect(ao.normalTexture).toBeUndefined();
    expect(ao.depthTexture).toBe(bokeh()!.uniforms.tDepth!.value);
    const air = composer().passes.find(item => item instanceof ShaderPass && item.uniforms.airEnabled) as ShaderPass;
    expect(air.uniforms.tDepth!.value).toBe(ao.depthTexture);
    expect(bokeh()!.material.defines.DEPTH_PACKING).toBe(0);
    const write = new WebGLRenderTarget(1, 1), read = new WebGLRenderTarget(1, 1);
    renderer.render.mockClear();
    composer().passes[0]!.render(gpu, write, read, 0, false);
    expect(renderer.render.mock.calls.filter(call => call[0] === scene)).toHaveLength(1);
    expect(scene.overrideMaterial).toBeNull();
    pass.setSize(640, 480);
    const source = renderer.setRenderTarget.mock.calls.map(call => call[0]).find(target => target?.depthTexture === ao.depthTexture)!;
    expect([source.width, source.height]).toEqual([960, 720]);
    write.dispose(); read.dispose(); pass.dispose();
  });
  it("allows transient A/B only in the opt-in QA journey and removes its listener", () => {
    const document = new EventTarget(), window = { __tqaJourney: false };
    vi.stubGlobal("document", document); vi.stubGlobal("window", window);
    const remove = vi.spyOn(document, "removeEventListener");
    const { scene, camera, pass } = setup("High");
    try {
      pass.render(scene, camera); pass.render(scene, camera);
      const event = Object.assign(new Event("tqa:light-review"), { detail: false });
      document.dispatchEvent(event); pass.render(scene, camera);
      expect(scene.getObjectByName("hr-forest-floor")!.visible).toBe(true);
      window.__tqaJourney = true; document.dispatchEvent(event); pass.render(scene, camera);
      expect(scene.getObjectByName("hr-forest-floor")!.visible).toBe(false);
      expect(scene.getObjectByName("hr-canopy-rays")!.visible).toBe(false);
      const air = composer().passes.find(item => item instanceof ShaderPass && item.uniforms.airEnabled) as ShaderPass;
      expect(air.uniforms.airEnabled!.value).toBe(0);
      document.dispatchEvent(Object.assign(new Event("tqa:light-review"), { detail: true }));
      pass.render(scene, camera); expect(air.uniforms.airEnabled!.value).toBe(1);
      pass.dispose(); expect(remove).toHaveBeenCalledWith("tqa:light-review", expect.any(Function));
    } finally { pass.dispose(); vi.unstubAllGlobals(); }
  });
});
