export type AppMode = "welcome" | "loading" | "world" | "editorial" | "recoverableError";
export type PauseReason = "overlay" | "hiddenTab" | "windowBlur" | "error";
export interface Position {
  x: number;
  y: number;
  z: number;
}
export interface SessionState {
  appMode: AppMode;
  pauseReasons: ReadonlySet<PauseReason>;
  sessionProgress: {
    lastSafePosition: Position;
    secrets: ReadonlySet<string>;
    visitedZones: ReadonlySet<string>;
  };
  position: Position;
}
export type SessionAction =
  | { type: "safePosition"; position: Position }
  | { type: "recover" }
  | { type: "mode"; mode: AppMode }
  | { type: "pause"; reason: PauseReason; paused: boolean };
export const initialSession = (): SessionState => ({
  appMode: "welcome",
  pauseReasons: new Set(),
  position: { x: 0, y: 0.92, z: 4 },
  sessionProgress: {
    lastSafePosition: { x: 0, y: 0.92, z: 4 },
    secrets: new Set(),
    visitedZones: new Set(),
  },
});
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === "recover") {
    return { ...state, position: { ...state.sessionProgress.lastSafePosition } };
  }
  if (action.type === "safePosition") {
    return {
      ...state,
      sessionProgress: { ...state.sessionProgress, lastSafePosition: { ...action.position } },
    };
  }
  const pauseReasons = new Set(state.pauseReasons);
  if (action.type === "mode") {
    if (action.mode === "recoverableError") pauseReasons.add("error");
    else pauseReasons.delete("error");
    return { ...state, appMode: action.mode, pauseReasons };
  }
  if (action.paused) pauseReasons.add(action.reason);
  else pauseReasons.delete(action.reason);
  return { ...state, pauseReasons };
}
export const canSimulate = (state: SessionState) => state.appMode === "world" && state.pauseReasons.size === 0;
