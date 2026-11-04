import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZONE_IDS } from "../../../src/features/interaction/targets";
import {
  blankPages,
  endingUnlocked,
  initialJournal,
  journalEntries,
  journalReducer,
  journalTitle,
  type SecretId,
} from "../../../src/features/journal/model";

const secretIds: readonly SecretId[] = [
  "reflection", "forgotten-sound", "unmarked-road", "unwritten-page",
];

describe("journal model", () => {
  it("starts closed with fresh, empty sets for each session", () => {
    const state = initialJournal();
    const other = initialJournal();
    expect(state).toEqual({ visited: new Set(), secrets: new Set(), open: false });
    expect(state.visited).not.toBe(other.visited);
    expect(state.secrets).not.toBe(other.secrets);
  });

  it.each(["en", "vi"] as const)("lists exactly eight ordered stamp entries in %s", locale => {
    const state = journalReducer(initialJournal(), { type: "visit", zoneId: "workshop" });
    const entries = journalEntries(state, locale);
    expect(entries.map(entry => entry.zoneId)).toEqual(ZONE_IDS);
    expect(entries.map(entry => entry.title)).toEqual([
      "The First Light", "The Roots", "The Workshop", "The Milestones",
      "The Old Trail", "The Horizon", "The Quiet Shore", "The Last Postcard",
    ]);
    expect(entries.map(entry => entry.stamped)).toEqual([
      false, false, true, false, false, false, false, false,
    ]);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(["stamped", "title", "zoneId"]);
    }
    expect(journalEntries(initialJournal(), locale).every(entry => !entry.stamped)).toBe(true);
  });

  it("provides localized journal headings", () => {
    expect(journalTitle("en")).toBe("Atlas Journal");
    expect(journalTitle("vi")).toBe("Sổ Atlas");
  });

  it("visits without mutating previous sets or duplicating stamps", () => {
    const initial = initialJournal();
    const first = journalReducer(initial, { type: "visit", zoneId: "roots" });
    const repeated = journalReducer(first, { type: "visit", zoneId: "roots" });
    const next = journalReducer(repeated, { type: "visit", zoneId: "horizon" });
    expect([...initial.visited]).toEqual([]);
    expect([...first.visited]).toEqual(["roots"]);
    expect(repeated).toBe(first);
    expect([...next.visited]).toEqual(["roots", "horizon"]);
    expect(next.secrets).toBe(initial.secrets);
  });

  it("opens, closes and toggles without losing progress or changing input", () => {
    const state = journalReducer(
      journalReducer(initialJournal(), { type: "visit", zoneId: "roots" }),
      { type: "findSecret", id: "reflection" },
    );
    const opened = journalReducer(state, { type: "open" });
    expect(state.open).toBe(false);
    expect(opened.open).toBe(true);
    expect(journalReducer(opened, { type: "open" }).open).toBe(true);
    const closed = journalReducer(opened, { type: "close" });
    expect(closed.open).toBe(false);
    expect(journalReducer(closed, { type: "close" }).open).toBe(false);
    const toggled = journalReducer(closed, { type: "toggle" });
    expect(toggled.open).toBe(true);
    expect(journalReducer(toggled, { type: "toggle" }).open).toBe(false);
    for (const result of [opened, closed, toggled]) {
      expect(result.visited).toBe(state.visited);
      expect(result.secrets).toBe(state.secrets);
    }
  });

  it("deduplicates secrets, preserves previous states, and never reveals secrets in entries", () => {
    const initial = initialJournal();
    let state = initial;
    for (const id of secretIds) {
      const previous = state;
      state = journalReducer(state, { type: "findSecret", id });
      expect(previous.secrets.has(id)).toBe(false);
      expect(state.secrets.has(id)).toBe(true);
      expect(journalReducer(state, { type: "findSecret", id })).toBe(state);
    }
    expect(initial.secrets.size).toBe(0);
    expect(state.secrets.size).toBe(4);
    for (const locale of ["en", "vi"] as const) {
      expect(journalEntries(state, locale)).toEqual(journalEntries(initial, locale));
    }
  });

  it("counts blank pages and unlocks the ending for every secret subset", () => {
    for (let mask = 0; mask < 16; mask++) {
      let state = initialJournal();
      for (const [index, id] of secretIds.entries()) {
        if (mask & (1 << index)) state = journalReducer(state, { type: "findSecret", id });
      }
      const requiredFound = Number(Boolean(mask & 1))
        + Number(Boolean(mask & 2)) + Number(Boolean(mask & 4));
      expect(blankPages(state), `blank pages for subset ${mask}`).toBe(mask === 0 ? 0 : 3 - requiredFound);
      expect(endingUnlocked(state), `ending for subset ${mask}`).toBe(requiredFound === 3);
    }
  });

  it("repeated discoveries cannot advance blank pages or unlock the ending", () => {
    let state = initialJournal();
    for (let count = 0; count < 5; count++) {
      state = journalReducer(state, { type: "findSecret", id: "reflection" });
      expect(blankPages(state)).toBe(2);
      expect(endingUnlocked(state)).toBe(false);
    }
    expect(state.secrets.size).toBe(1);
  });

  it("resets all progress and open state with fresh sets when leaving the world", () => {
    let state = initialJournal();
    for (const zoneId of ZONE_IDS) state = journalReducer(state, { type: "visit", zoneId });
    for (const id of secretIds) state = journalReducer(state, { type: "findSecret", id });
    state = journalReducer(state, { type: "open" });
    const reset = journalReducer(state, { type: "reset" });
    expect(reset).toEqual(initialJournal());
    expect(reset.visited).not.toBe(state.visited);
    expect(reset.secrets).not.toBe(state.secrets);
    expect(blankPages(reset)).toBe(0);
    expect(endingUnlocked(reset)).toBe(false);
    expect(state.visited.size).toBe(8);
    expect(state.secrets.size).toBe(4);
    expect(state.open).toBe(true);
  });

  it("has no persistence or browser access in the model source", () => {
    const source = readFileSync("src/features/journal/model.ts", "utf8");
    for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "location"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/\b(?:document|window|React)\b|from\s+["']react["']/);
  });
});
