import type { SecretId } from "../journal/model";

export type EndingState = "locked" | "ready" | "playing" | "seen";
export interface StoryFeedback {
  readonly id: SecretId;
  readonly feedback: "found" | "not-yet";
}

export interface StoryState {
  readonly found: ReadonlySet<SecretId>;
  readonly endingState: EndingState;
  readonly lastFeedback: StoryFeedback | null;
}

export type StoryAction =
  | { type: "discover"; id: SecretId }
  | { type: "startEnding" }
  | { type: "finishEnding"; valid: boolean }
  | { type: "reset" };

const REQUIRED_SECRETS = ["reflection", "forgotten-sound", "unmarked-road"] as const;

/** One fresh, memory-only state per world session. */
export const initialStory = (): StoryState => ({
  found: new Set(),
  endingState: "locked",
  lastFeedback: null,
});

export function storyReducer(state: StoryState, action: StoryAction): StoryState {
  switch (action.type) {
    case "discover": {
      if (state.found.has(action.id)) return state;
      if (action.id === "unwritten-page" && !REQUIRED_SECRETS.every(id => state.found.has(id))) {
        if (state.lastFeedback?.id === action.id && state.lastFeedback.feedback === "not-yet") return state;
        return { ...state, lastFeedback: { id: action.id, feedback: "not-yet" } };
      }
      return {
        ...state,
        found: new Set([...state.found, action.id]),
        endingState: action.id === "unwritten-page" ? "ready" : state.endingState,
        lastFeedback: { id: action.id, feedback: "found" },
      };
    }
    case "startEnding":
      return state.endingState === "ready" ? { ...state, endingState: "playing" } : state;
    case "finishEnding":
      // The cinematic caller validates its completion, including a successful Skip.
      return state.endingState === "playing" && action.valid
        ? { ...state, endingState: "seen" }
        : state;
    case "reset":
      return initialStory();
  }
}
