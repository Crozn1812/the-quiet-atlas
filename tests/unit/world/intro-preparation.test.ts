import { expect, it } from "vitest";
import type { WebGLRenderer } from "three";
import { createIntroPreparation, introAssetsAllowed, introAssetsReady, trackIntroAsset } from "../../../src/features/world/cinematic/preparation";

it("holds paper until dressing and HR settle, but caps the wait at eight seconds", () => {
  const preparation = createIntroPreparation(100);
  expect(preparation.ready(100, false, true)).toBe(false);
  expect(preparation.ready(300, true, false)).toBe(false);
  expect(preparation.ready(400, true, true)).toBe(false);
  expect(preparation.ready(649, true, true)).toBe(false);
  expect(preparation.ready(650, true, true)).toBe(true);
  expect(createIntroPreparation(100).ready(8100, false, false)).toBe(true);
});

it("resets the quiet window when another visible asset starts", () => {
  const preparation = createIntroPreparation(0);
  preparation.ready(100, true, true);
  expect(preparation.ready(300, true, false)).toBe(false);
  expect(preparation.ready(400, true, true)).toBe(false);
  expect(preparation.ready(650, true, true)).toBe(true);
});

it("tracks renderer-owned loads and releases failed assets to their fallback", async () => {
  const renderer = {} as WebGLRenderer, other = {} as WebGLRenderer;
  let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; });
  trackIntroAsset(renderer, pending);
  expect(introAssetsReady(renderer, Infinity)).toBe(false);
  expect(introAssetsReady(other, Infinity)).toBe(true);
  resolve(); await pending;
  expect(introAssetsReady(renderer, performance.now())).toBe(false);
  expect(introAssetsReady(renderer, performance.now() + 251)).toBe(true);
  trackIntroAsset(renderer, Promise.reject(new Error("asset unavailable")));
  await Promise.resolve();
  expect(introAssetsReady(renderer, performance.now() + 251)).toBe(true);
});

it("does not opt Low or ordinary viewports into intro asset loading", () => {
  expect(introAssetsAllowed(null)).toBe(false);
  expect(introAssetsAllowed({ dataset: {} } as HTMLElement)).toBe(false);
  expect(introAssetsAllowed({ dataset: { worldIntroAssets: "true" } } as unknown as HTMLElement)).toBe(true);
});

it("loads and displays a hardware setpiece behind High paper before intro handoff", async () => {
  const { BoxGeometry, Group, Mesh, MeshStandardMaterial } = await import("three");
  const { bindSetpieces } = await import("../../../src/features/world/zones/setpiece-hr");
  const { setBakedPropQuality } = await import("../../../src/features/world/props/batched");
  const viewport = {
    dataset: { worldIntroAssets: "true" },
    getAttribute: (name: string) => name === "data-world-paused" ? "false" : "pending",
  };
  const renderer = { domElement: { closest: () => viewport } } as unknown as WebGLRenderer;
  const parent = new Group(), material = new MeshStandardMaterial(), anchor = new Mesh(new BoxGeometry(), material);
  parent.add(anchor);
  setBakedPropQuality(parent, "High");
  let requests = 0;
  const release = bindSetpieces(anchor, {
    file: "horizon",
    load: async () => { requests++; return { piece: () => new Group(), dispose() {} }; },
    place(asset, add) { const piece = asset.piece("viewer"); piece.name = "intro-hr-viewer"; add(piece); },
  });
  const draw = () => anchor.onBeforeRender(renderer, null!, null!, anchor.geometry, material, null!);
  try {
    draw();
    expect(requests).toBe(1);
    expect(introAssetsReady(renderer, Infinity)).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    draw();
    expect(parent.getObjectByName("intro-hr-viewer")?.visible).toBe(true);
    expect(introAssetsReady(renderer, performance.now() + 251)).toBe(true);
  } finally {
    release(); anchor.geometry.dispose(); material.dispose();
  }
});
