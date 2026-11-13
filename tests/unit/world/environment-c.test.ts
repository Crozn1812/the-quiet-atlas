import { readFileSync, statSync } from "node:fs";
import { PMREMGenerator, Scene, Texture, type WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnvironment, environmentUrls, environmentWeight } from "../../../src/features/world/sky/environment";

const state = vi.hoisted(() => ({ pending: [] as { resolve(value: Texture): void; reject(error: Error): void }[] }));
vi.mock("three", async original => {
  const actual = await original<typeof import("three")>();
  return { ...actual, PMREMGenerator: vi.fn(class {
    fromScene = vi.fn(() => new actual.WebGLCubeRenderTarget(16));
    dispose = vi.fn();
  }) };
});
vi.mock("three/examples/jsm/loaders/KTX2Loader.js", () => ({
  KTX2Loader: vi.fn(class {
    setWorkerLimit() { return this; }
    detectSupport() { return this; }
    parse = vi.fn((_buffer: ArrayBuffer, resolve: (value: Texture) => void, reject: (error: Error) => void) => state.pending.push({ resolve, reject }));
    dispose = vi.fn();
  }),
}));
beforeEach(() => {
  state.pending.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("deferred CC0 environment", () => {
  it("ships licensed 2K/1K UASTC panoramas and no Low downloads", () => {
    expect(environmentUrls("Low")).toEqual([]);
    const licenses = readFileSync("assets/LICENSES.csv", "utf8");
    let bytes = 0;
    for (const quality of ["High", "Balanced"] as const) for (const url of environmentUrls(quality)) {
      const file = `public${url}`, binary = readFileSync(file);
      expect(binary.subarray(0, 12).toString("hex")).toBe("ab4b5458203230bb0d0a1a0a");
      const width = quality === "High" ? 2048 : 1024;
      expect([binary.readUInt32LE(20), binary.readUInt32LE(24)]).toEqual([width, width / 2]);
      expect(binary.readUInt32LE(44)).toBe(2); // Zstandard-compressed UASTC.
      expect(licenses.split(/\r?\n/).filter(row => row.startsWith(`${file},`))).toEqual([expect.stringContaining(",CC0-1.0,yes,yes,yes,")]);
      bytes += statSync(file).size;
    }
    expect(bytes).toBeLessThan(4_000_000);
  });
  it("derives blend solely from clamped time of day, in either travel direction", () => {
    expect([NaN, -1, 0, 0.25, 0.5, 1, 2].map(environmentWeight)).toEqual([0, 0, 0, 0.25, 0.5, 1, 1]);
  });
  it("prefilters once per HDRI, caching both maps through time changes and hidden tabs", async () => {
    const renderer = { getRenderTarget: () => null, setRenderTarget: vi.fn(), autoClear: true };
    const scene = new Scene(), environment = createEnvironment(renderer as unknown as WebGLRenderer, scene);
    environment.setQuality("High");
    await vi.waitFor(() => expect(state.pending).toHaveLength(2));
    state.pending.forEach(pending => pending.resolve(new Texture()));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(PMREMGenerator).not.toHaveBeenCalled();
    environment.update(); expect(PMREMGenerator).toHaveBeenCalledTimes(1);
    environment.update(); expect(PMREMGenerator).toHaveBeenCalledTimes(2);
    environment.update();
    const texture = scene.environment;
    expect(texture).not.toBeNull();
    for (const time of [0.2, 0.7, 1, 0.4, 0]) { environment.setTimeOfDay(time); environment.update(); }
    environment.setActive(false); environment.setTimeOfDay(0.9); environment.update();
    environment.setActive(true); environment.update();
    expect(scene.environment).toBe(texture);
    expect(PMREMGenerator).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    environment.dispose(); expect(scene.environment).toBeNull();
  });
  it("does not fetch for Low; disposes late High textures after switching to Low", async () => {
    const scene = new Scene();
    const environment = createEnvironment({} as WebGLRenderer, scene);
    environment.setQuality("Low");
    await vi.waitFor(() => expect(state.pending).toHaveLength(0));
    expect(fetch).not.toHaveBeenCalled();
    environment.setQuality("High");
    await vi.waitFor(() => expect(state.pending).toHaveLength(2));
    environment.setQuality("Low");
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
    const textures = [new Texture(), new Texture()];
    const spies = textures.map(texture => vi.spyOn(texture, "dispose"));
    state.pending.forEach((pending, i) => pending.resolve(textures[i]!));
    await vi.waitFor(() => spies.forEach(spy => expect(spy).toHaveBeenCalledOnce()));
    expect(scene.environment).toBeNull();
    environment.update(); environment.dispose(); environment.dispose();
  });
  it("aborts hidden-tab downloads, drops late transcodes and restarts only when active", async () => {
    const scene = new Scene(), environment = createEnvironment({} as WebGLRenderer, scene);
    environment.setQuality("High");
    await vi.waitFor(() => expect(state.pending).toHaveLength(2));
    environment.setActive(false);
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
    const textures = [new Texture(), new Texture()];
    const spies = textures.map(texture => vi.spyOn(texture, "dispose"));
    state.pending.forEach((pending, i) => pending.resolve(textures[i]!));
    await vi.waitFor(() => spies.forEach(spy => expect(spy).toHaveBeenCalledOnce()));
    environment.update(); expect(scene.environment).toBeNull();
    environment.setTimeOfDay(0.7); environment.setQuality("Balanced");
    expect(fetch).toHaveBeenCalledTimes(2);
    environment.setActive(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(state.pending).toHaveLength(4));
    environment.dispose();
    state.pending.slice(2).forEach(pending => pending.resolve(new Texture()));
  });
  it("disposes partial successes and preserves fallback lighting when one HDRI fails", async () => {
    const scene = new Scene(), original = new Texture(); scene.environment = original;
    const environment = createEnvironment({} as WebGLRenderer, scene);
    environment.setQuality("Balanced");
    await vi.waitFor(() => expect(state.pending).toHaveLength(2));
    const texture = new Texture(), dispose = vi.spyOn(texture, "dispose");
    state.pending[0]!.resolve(texture); state.pending[1]!.reject(new Error("offline"));
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    environment.update(); expect(scene.environment).toBe(original);
    environment.dispose(); original.dispose();
  });
  it("disposes both staged textures on exit, without uploading on the async completion", async () => {
    const scene = new Scene(), environment = createEnvironment({} as WebGLRenderer, scene);
    environment.setQuality("High");
    await vi.waitFor(() => expect(state.pending).toHaveLength(2));
    const textures = [new Texture(), new Texture()];
    const spies = textures.map(texture => vi.spyOn(texture, "dispose"));
    state.pending.forEach((pending, i) => pending.resolve(textures[i]!));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(scene.environment).toBeNull();
    environment.dispose(); spies.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
