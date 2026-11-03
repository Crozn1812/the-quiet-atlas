/** Structural event targets keep input logic usable without a DOM or WebGL. */
export function isInputTarget(target: unknown): boolean {
  return typeof target === "object" && target !== null && "closest" in target
    && typeof target.closest === "function"
    && !!target.closest("input,textarea,select,[contenteditable],dialog,[role=dialog]");
}

export interface KeyEventLike { code: string; target?: unknown }
export type InputAction =
  | { type: "keydown"; event: KeyEventLike; enabled: boolean }
  | { type: "keyup"; event: KeyEventLike }
  | { type: "clear" | "blur" | "hidden" }
  | { type: "focusin"; event: { target?: unknown } };

/** Never consumes browser events; text entry retains ownership of its keys. */
export function inputReducer(keys: ReadonlySet<string>, action: InputAction): ReadonlySet<string> {
  if (action.type === "focusin") return isInputTarget(action.event.target) ? new Set() : keys;
  if (action.type !== "keydown" && action.type !== "keyup") return new Set();
  if (action.type === "keydown" && (!action.enabled || isInputTarget(action.event.target))) return keys;
  const next = new Set(keys);
  if (action.type === "keydown") next.add(action.event.code);
  else next.delete(action.event.code);
  return next;
}
