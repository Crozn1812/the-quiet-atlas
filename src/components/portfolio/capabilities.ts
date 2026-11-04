export type CapabilityInput = {
  webgl2: boolean;
  finePointer: boolean;
  width: number;
};

export function worldEligibility(input: CapabilityInput) {
  if (!input.finePointer) return "pointer";
  if (input.width < 1024) return "width";
  if (!input.webgl2) return "webgl2";
  return "eligible";
}

function readWebGL2() {
  try {
    const context = document.createElement("canvas").getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  } catch {
    // Context creation can throw when graphics access is blocked.
    return false;
  }
}

export function createCapabilityReader() {
  let webgl2: boolean | undefined;
  return (): CapabilityInput => {
    const input = {
      webgl2: false,
      finePointer: window.matchMedia("(pointer: fine)").matches,
      width: window.innerWidth,
    };
    // Editorial devices need no GPU probe. A first WebGL context can block hydration.
    // Keep an unprobed result out of the cache so resizing to desktop still checks it.
    if (input.finePointer && input.width >= 1024) {
      input.webgl2 = webgl2 ??= readWebGL2();
    }
    return input;
  };
}
