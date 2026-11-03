export type CapabilityInput = {
  webgl2: boolean;
  finePointer: boolean;
  width: number;
};

export function worldEligibility(input: CapabilityInput) {
  if (!input.webgl2) return "webgl2";
  if (!input.finePointer) return "pointer";
  if (input.width < 1024) return "width";
  return "eligible";
}

export function readCapabilities(): CapabilityInput {
  const canvas = document.createElement("canvas");
  let webgl2 = false;
  try {
    const context = canvas.getContext("webgl2");
    webgl2 = context !== null;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Context creation can throw when graphics access is blocked.
  }
  return {
    webgl2,
    finePointer: window.matchMedia("(pointer: fine)").matches,
    width: window.innerWidth,
  };
}
