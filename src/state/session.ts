export type AppMode = "welcome" | "loading" | "world" | "editorial" | "recoverableError";
export type PauseReason = "overlay" | "hiddenTab" | "windowBlur" | "error";
export interface SessionState { appMode: AppMode; pauseReasons: ReadonlySet<PauseReason> }
export type SessionAction =
  | { type: "mode"; mode: AppMode }
  | { type: "pause"; reason: PauseReason; paused: boolean };
export const initialSession = (): SessionState => ({ appMode: "welcome", pauseReasons: new Set() });
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  const pauseReasons = new Set(state.pauseReasons);
  if (action.type === "mode") {
    if (action.mode === "recoverableError") pauseReasons.add("error");
    else pauseReasons.delete("error");
    return { appMode: action.mode, pauseReasons };
  }
  if (action.paused) pauseReasons.add(action.reason);
  else pauseReasons.delete(action.reason);
  return { ...state, pauseReasons };
}
export const canSimulate = (state: SessionState) => state.appMode === "world" && state.pauseReasons.size === 0;
