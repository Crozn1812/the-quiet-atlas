export type Quality = "low" | "balanced" | "high";

export function escapeAction(inWorld: boolean, editing: boolean, hasDialog: boolean) {
  if (!inWorld || editing) return "ignore";
  return hasDialog ? "close" : "open";
}

export function trapFocus<T>(items: readonly T[], active: T | null, backwards: boolean): T | undefined {
  if (!items.length) return undefined;
  if (backwards && (active === items[0] || !items.includes(active as T))) return items.at(-1);
  if (!backwards && (active === items.at(-1) || !items.includes(active as T))) return items[0];
  return undefined;
}

export function pauseWorld(target: EventTarget, paused: boolean) {
  target.dispatchEvent(new CustomEvent("tqa:pause", { detail: { reason: "overlay", paused } }));
}

export function setWorldQuality(target: EventTarget, quality: Quality) {
  target.dispatchEvent(new CustomEvent("tqa:set-quality", { detail: { quality } }));
}

export function returnToPath(target: EventTarget) {
  target.dispatchEvent(new CustomEvent("tqa:return-to-path"));
}
