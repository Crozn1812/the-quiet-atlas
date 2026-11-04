import { ZONE_IDS, type ZoneId } from "../interaction/targets";
import type { WorldLocale } from "../world/copy";

export type SecretId = "reflection" | "forgotten-sound" | "unmarked-road" | "unwritten-page";

export interface JournalState {
  visited: ReadonlySet<ZoneId>;
  secrets: ReadonlySet<SecretId>;
  open: boolean;
}

export type JournalAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "toggle" }
  | { type: "visit"; zoneId: ZoneId }
  | { type: "findSecret"; id: SecretId }
  | { type: "reset" };

export interface JournalEntry {
  zoneId: ZoneId;
  title: string;
  stamped: boolean;
}

const ZONE_TITLES: Record<ZoneId, string> = {
  "first-light": "The First Light",
  roots: "The Roots",
  workshop: "The Workshop",
  milestones: "The Milestones",
  "old-trail": "The Old Trail",
  horizon: "The Horizon",
  "quiet-shore": "The Quiet Shore",
  "last-postcard": "The Last Postcard",
};

const ENDING_SECRETS = ["reflection", "forgotten-sound", "unmarked-road"] as const;

export const initialJournal = (): JournalState => ({
  visited: new Set(),
  secrets: new Set(),
  open: false,
});

export function journalReducer(state: JournalState, action: JournalAction): JournalState {
  switch (action.type) {
    case "open":
      return state.open ? state : { ...state, open: true };
    case "close":
      return state.open ? { ...state, open: false } : state;
    case "toggle":
      return { ...state, open: !state.open };
    case "visit":
      return state.visited.has(action.zoneId)
        ? state
        : { ...state, visited: new Set([...state.visited, action.zoneId]) };
    case "findSecret":
      return state.secrets.has(action.id)
        ? state
        : { ...state, secrets: new Set([...state.secrets, action.id]) };
    case "reset":
      return initialJournal();
  }
}

export function journalTitle(locale: WorldLocale): string {
  return locale === "vi" ? "Sổ Atlas" : "Atlas Journal";
}

export function journalEntries(state: JournalState, locale: WorldLocale): JournalEntry[] {
  // Zone names stay in English in both supported languages.
  void locale;
  return ZONE_IDS.map(zoneId => ({
    zoneId,
    title: ZONE_TITLES[zoneId],
    stamped: state.visited.has(zoneId),
  }));
}

export function blankPages(state: JournalState): number {
  if (state.secrets.size === 0) return 0;
  return ENDING_SECRETS.filter(id => !state.secrets.has(id)).length;
}

export function endingUnlocked(state: JournalState): boolean {
  return ENDING_SECRETS.every(id => state.secrets.has(id));
}
