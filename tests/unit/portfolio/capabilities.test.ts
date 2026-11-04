import { afterEach, expect, it, vi } from "vitest";
import { createCapabilityReader, worldEligibility } from "@/components/portfolio/capabilities";

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  [{ webgl2: true, finePointer: true, width: 1024 }, "eligible"],
  [{ webgl2: false, finePointer: true, width: 1280 }, "webgl2"],
  [{ webgl2: true, finePointer: false, width: 1280 }, "pointer"],
  [{ webgl2: true, finePointer: true, width: 1023 }, "width"],
  [{ webgl2: false, finePointer: false, width: 390 }, "pointer"],
  [{ webgl2: false, finePointer: true, width: 1023 }, "width"],
] as const)("selects experience for %j", (input, expected) => {
  expect(worldEligibility(input)).toBe(expected);
});

function browserCapabilities() {
  const loseContext = vi.fn();
  const getContext = vi.fn(() => ({
    getExtension: vi.fn(() => ({ loseContext })),
  }));
  const createElement = vi.fn(() => ({ getContext }));
  const viewport = {
    innerWidth: 1280,
    matchMedia: vi.fn(() => ({ matches: true })),
  };
  vi.stubGlobal("window", viewport);
  vi.stubGlobal("document", { createElement });
  return { viewport, createElement, getContext, loseContext };
}

it.each([
  { width: 390, finePointer: true, reason: "width" },
  { width: 1280, finePointer: false, reason: "pointer" },
])("does not create a WebGL context for Editorial: $reason", ({ width, finePointer, reason }) => {
  const { viewport, createElement } = browserCapabilities();
  viewport.innerWidth = width;
  viewport.matchMedia.mockReturnValue({ matches: finePointer });
  expect(worldEligibility(createCapabilityReader()())).toBe(reason);
  expect(createElement).not.toHaveBeenCalled();
});

it("probes when a viewport becomes eligible and reuses that result across resize/pointer changes", () => {
  const { viewport, getContext, loseContext } = browserCapabilities();
  const read = createCapabilityReader();
  viewport.innerWidth = 800;
  expect(worldEligibility(read())).toBe("width");
  viewport.innerWidth = 1024;
  expect(worldEligibility(read())).toBe("eligible");
  expect(getContext).toHaveBeenCalledExactlyOnceWith("webgl2");
  expect(loseContext).toHaveBeenCalledOnce();
  viewport.matchMedia.mockReturnValue({ matches: false });
  expect(worldEligibility(read())).toBe("pointer");
  viewport.matchMedia.mockReturnValue({ matches: true });
  viewport.innerWidth = 1366;
  expect(worldEligibility(read())).toBe("eligible");
  expect(getContext).toHaveBeenCalledOnce();
});

it("caches an unavailable WebGL result when context creation throws", () => {
  const { getContext } = browserCapabilities();
  getContext.mockImplementation(() => {
    throw new Error("Graphics access blocked");
  });
  const read = createCapabilityReader();
  expect(worldEligibility(read())).toBe("webgl2");
  expect(worldEligibility(read())).toBe("webgl2");
  expect(getContext).toHaveBeenCalledOnce();
});
