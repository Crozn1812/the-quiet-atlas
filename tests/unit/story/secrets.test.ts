import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { endingUnlocked, initialJournal, journalReducer, type SecretId } from "../../../src/features/journal/model";
import { NOT_YET_FEEDBACK, SECRET_FEEDBACK, storyFeedbackText } from "../../../src/features/story/copy";
import { SECRETS, nearestSecret } from "../../../src/features/story/secrets";
import { initialStory, storyReducer, type StoryState } from "../../../src/features/story/story";
import { pathPointAt } from "../../../src/features/world/layout/path";
import { ZONES } from "../../../src/features/world/layout/zones";
import { waterLevelAt, worldHeight } from "../../../src/features/world/terrain/height";

const required: readonly SecretId[] = ["reflection", "forgotten-sound", "unmarked-road"];
const ids: readonly SecretId[] = [...required, "unwritten-page"];

function orders(values: readonly SecretId[]): SecretId[][] {
  return values.length === 0 ? [[]] : values.flatMap((id, index) =>
    orders(values.filter((_, other) => other !== index)).map(rest => [id, ...rest]));
}

function readyStory(): StoryState {
  return ids.reduce((state, id) => storyReducer(state, { type: "discover", id }), initialStory());
}

describe("secret discovery and ending transitions (Q16)", () => {
  it("starts each session with an independent empty set", () => {
    const state = initialStory();
    expect(state).toEqual({ found: new Set(), endingState: "locked", lastFeedback: null });
    expect(state.found).not.toBe(initialStory().found);
  });

  it.each(orders(ids).map(order => ({ order })))("deduplicates every discovery order: $order", ({ order }) => {
    const initial = initialStory();
    let state = initial;
    for (const id of order) {
      const previous = state;
      const snapshot = [...previous.found];
      state = storyReducer(state, { type: "discover", id });
      expect([...previous.found]).toEqual(snapshot);
      expect(storyReducer(state, { type: "discover", id })).toBe(state);
      if (id === "unwritten-page" && !required.every(secret => previous.found.has(secret))) {
        expect(state.found).toBe(previous.found);
        expect(state.found.has(id)).toBe(false);
        expect(state.lastFeedback).toEqual({ id, feedback: "not-yet" });
        expect(state.endingState).toBe("locked");
      } else {
        expect(state.found.size).toBe(previous.found.size + 1);
        expect(state.lastFeedback).toEqual({ id, feedback: "found" });
      }
    }
    expect(initial.found.size).toBe(0);
    expect(required.every(id => state.found.has(id))).toBe(true);
    if (!state.found.has("unwritten-page")) expect(state.endingState).toBe("locked");
    state = storyReducer(state, { type: "discover", id: "unwritten-page" });
    expect(state.found).toEqual(new Set(ids));
    expect(state.endingState).toBe("ready");
  });

  it("rejects the page for every incomplete subset, even after many repeated discoveries", () => {
    for (let mask = 0; mask < 7; mask++) {
      let state = initialStory();
      for (const [index, id] of required.entries()) {
        if (mask & (1 << index)) {
          for (let repeat = 0; repeat < 5; repeat++) state = storyReducer(state, { type: "discover", id });
        }
      }
      const previous = state;
      state = storyReducer(state, { type: "discover", id: "unwritten-page" });
      expect(state.lastFeedback).toEqual({ id: "unwritten-page", feedback: "not-yet" });
      expect(state.found).toBe(previous.found);
      expect(state.endingState).toBe("locked");
      expect(storyReducer(state, { type: "startEnding" })).toBe(state);
      expect(storyReducer(state, { type: "finishEnding", valid: true })).toBe(state);
    }
  });

  it("requires a new bench interaction after the three prerequisites; journal agrees on IDs", () => {
    let state = storyReducer(initialStory(), { type: "discover", id: "unwritten-page" });
    let journal = initialJournal();
    for (const id of required) {
      state = storyReducer(state, { type: "discover", id });
      journal = journalReducer(journal, { type: "findSecret", id });
    }
    expect(state.found).toEqual(journal.secrets);
    expect(endingUnlocked(journal)).toBe(true);
    expect(state.endingState).toBe("locked");
    expect(storyReducer(state, { type: "startEnding" })).toBe(state);
    expect(storyReducer(state, { type: "discover", id: "unwritten-page" }).endingState).toBe("ready");
  });

  it("starts only once and never reopens after playing or completion", () => {
    const ready = readyStory();
    const playing = storyReducer(ready, { type: "startEnding" });
    expect(ready.endingState).toBe("ready");
    expect(playing.endingState).toBe("playing");
    expect(playing.found).toBe(ready.found);
    expect(storyReducer(playing, { type: "startEnding" })).toBe(playing);
    expect(storyReducer(playing, { type: "discover", id: "unwritten-page" })).toBe(playing);
    const seen = storyReducer(playing, { type: "finishEnding", valid: true });
    expect(seen.endingState).toBe("seen");
    for (const id of ids) expect(storyReducer(seen, { type: "discover", id })).toBe(seen);
    expect(storyReducer(seen, { type: "startEnding" })).toBe(seen);
    expect(storyReducer(seen, { type: "finishEnding", valid: true })).toBe(seen);
  });

  it.each(["natural completion", "Skip"])("accepts a validated %s only while playing", () => {
    const ready = readyStory();
    for (const state of [initialStory(), ready]) {
      for (const valid of [true, false]) {
        expect(storyReducer(state, { type: "finishEnding", valid })).toBe(state);
      }
    }
    const playing = storyReducer(ready, { type: "startEnding" });
    expect(storyReducer(playing, { type: "finishEnding", valid: false })).toBe(playing);
    const seen = storyReducer(playing, { type: "finishEnding", valid: true });
    expect(seen.endingState).toBe("seen");
    expect(playing.endingState).toBe("playing");
    expect(seen.found).toBe(playing.found);
  });

  it("resets from every ending phase without altering the previous session", () => {
    const ready = readyStory();
    const playing = storyReducer(ready, { type: "startEnding" });
    const seen = storyReducer(playing, { type: "finishEnding", valid: true });
    for (const state of [initialStory(), ready, playing, seen]) {
      const reset = storyReducer(state, { type: "reset" });
      expect(reset).toEqual(initialStory());
      expect(reset.found).not.toBe(state.found);
    }
    expect(seen.found.size).toBe(4);
    expect(seen.endingState).toBe("seen");
  });
});

const route = Array.from({ length: 8193 }, (_, index) => pathPointAt(index / 8192));

// Independent, dense segment projection checks the entire path, including nearby bends.
function pathDistance(x: number, z: number): { distance: number; t: number } {
  let distance = Infinity;
  let t = 0;
  for (let index = 1; index < route.length; index++) {
    const a = route[index - 1]!;
    const b = route[index]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const fraction = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const candidate = Math.hypot(x - a.x - fraction * dx, z - a.z - fraction * dz);
    if (candidate < distance) {
      distance = candidate;
      t = (index - 1 + fraction) / 8192;
    }
  }
  return { distance, t };
}

describe("secret scenery placement and proximity", () => {
  it("defines exactly the journal's four unique IDs and scenery landmarks", () => {
    expect(SECRETS.map(secret => secret.id)).toEqual(ids);
    expect(new Set(SECRETS.map(secret => secret.id)).size).toBe(4);
    expect(SECRETS.map(secret => secret.landmark)).toEqual([
      "vine-arch-mirror", "wind-chime", "faint-trail", "bench",
    ]);
    expect(Object.isFrozen(SECRETS)).toBe(true);
  });

  it.each(SECRETS)("places $id 12–40 m off the path, outside every zone, on dry ground", secret => {
    const { x, y, z } = secret.position;
    const { distance } = pathDistance(x, z);
    expect(distance).toBeGreaterThanOrEqual(12);
    expect(distance).toBeLessThanOrEqual(40);
    expect(y).toBe(worldHeight(x, z));
    expect(secret.radius).toBe(2.5);
    expect(Object.isFrozen(secret)).toBe(true);
    expect(Object.isFrozen(secret.position)).toBe(true);
    for (const zone of ZONES) {
      // Even the activation disc must not overlap a content zone.
      expect(Math.hypot(x - zone.position.x, z - zone.position.z)).toBeGreaterThan(zone.radius + secret.radius);
    }
    for (const radius of [0, secret.radius / 2, secret.radius]) {
      for (let angle = 0; angle < 32; angle++) {
        const px = x + radius * Math.cos(angle * Math.PI / 16);
        const pz = z + radius * Math.sin(angle * Math.PI / 16);
        const height = worldHeight(px, pz);
        expect(height, `ground at ${px}, ${pz}`).toBeGreaterThanOrEqual(0.4);
        expect(height - waterLevelAt(pz), `water clearance at ${px}, ${pz}`).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  it("keeps each detour by its intended part of the world and the bench within 30 m of Quiet Shore", () => {
    const roots = ZONES.find(zone => zone.id === "roots")!;
    const workshop = ZONES.find(zone => zone.id === "workshop")!;
    const milestones = ZONES.find(zone => zone.id === "milestones")!;
    const oldTrail = ZONES.find(zone => zone.id === "old-trail")!;
    const shore = ZONES.find(zone => zone.id === "quiet-shore")!;
    const reflection = SECRETS.find(secret => secret.id === "reflection")!;
    const sound = SECRETS.find(secret => secret.id === "forgotten-sound")!;
    const road = SECRETS.find(secret => secret.id === "unmarked-road")!;
    const page = SECRETS.find(secret => secret.id === "unwritten-page")!;
    const distanceTo = (secret: typeof page, zone: typeof shore) =>
      Math.hypot(secret.position.x - zone.position.x, secret.position.z - zone.position.z);
    expect(distanceTo(reflection, roots)).toBeLessThanOrEqual(40);
    const soundProgress = pathDistance(sound.position.x, sound.position.z).t;
    expect(soundProgress).toBeGreaterThan(workshop.t);
    expect(soundProgress).toBeLessThan(milestones.t);
    expect(distanceTo(road, oldTrail)).toBeLessThanOrEqual(40);
    expect(distanceTo(page, shore)).toBeLessThanOrEqual(30);
  });

  it.each(SECRETS)("selects $id inside and on its inclusive 3D boundary", secret => {
    const { x, y, z } = secret.position;
    expect(nearestSecret(secret.position)).toBe(secret);
    for (const offset of [1, 2.5]) {
      expect(nearestSecret({ x: x + offset, y, z })).toBe(secret);
      expect(nearestSecret({ x, y: y + offset, z })).toBe(secret);
      expect(nearestSecret({ x, y, z: z - offset })).toBe(secret);
    }
    expect(nearestSecret({ x: x + 2.5001, y, z })).toBeNull();
    expect(nearestSecret({ x, y: y + 2.5001, z })).toBeNull();
    expect(nearestSecret({ x, y, z: z - 2.5001 })).toBeNull();
    // X and Z can each fit while the combined distance exceeds the radius.
    expect(nearestSecret({ x: x + 2, y, z: z + 2 })).toBeNull();
  });

  it("finds nothing on the main route, far away, or at non-finite positions", () => {
    expect(nearestSecret({ x: 10000, y: 0, z: 10000 })).toBeNull();
    for (const secret of SECRETS) {
      const nearest = pathPointAt(pathDistance(secret.position.x, secret.position.z).t);
      expect(nearestSecret({ x: nearest.x, y: worldHeight(nearest.x, nearest.z), z: nearest.z })).toBeNull();
      for (const axis of ["x", "y", "z"] as const) {
        for (const value of [NaN, Infinity, -Infinity]) {
          expect(nearestSecret({ ...secret.position, [axis]: value })).toBeNull();
        }
      }
    }
  });
});

describe("metaphorical feedback and memory-only boundary", () => {
  it.each(["en", "vi"] as const)("provides one short sentence per discovery and not-yet in %s", locale => {
    for (const id of ids) {
      expect(storyFeedbackText({ id, feedback: "found" }, locale)).toBe(SECRET_FEEDBACK[id][locale]);
    }
    expect(storyFeedbackText({ id: "unwritten-page", feedback: "not-yet" }, locale)).toBe(NOT_YET_FEEDBACK[locale]);
    const sentences = [...Object.values(SECRET_FEEDBACK).map(copy => copy[locale]), NOT_YET_FEEDBACK[locale]];
    expect(new Set(sentences).size).toBe(5);
    for (const sentence of sentences) {
      expect(sentence.trim().split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(sentence.match(/[.!?]/g)).toHaveLength(1);
    }
    expect(readFileSync("src/features/story/copy.ts", "utf8")).toContain("// TBD: Duy duyệt câu chữ");
  });

  it("greps every story source for persistence, browser, network and backend APIs", () => {
    const directory = "src/features/story";
    const files = readdirSync(directory, { recursive: true, encoding: "utf8" }).filter(file => /\.tsx?$/.test(file));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const source = readFileSync(join(directory, file), "utf8");
      expect(source, file).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB|cookieStore|document|window|location|history|URL|URLSearchParams|fetch|XMLHttpRequest|WebSocket|navigator)\b/);
      expect(source, file).not.toMatch(/from\s+["'](?:react|node:fs|node:http|node:https)["']/);
    }
  });
});
