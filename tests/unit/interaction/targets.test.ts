import { afterEach, expect, it, vi } from "vitest";
import { createInteraction, pickTarget, type InteractionTarget } from "../../../src/features/interaction/targets";
import { initialSession, sessionReducer } from "../../../src/state/session";

const player = { x: 0, y: 0, z: 0 };
const a: InteractionTarget = { id: "a", zoneId: "first-light", position: { x: 1, y: 0, z: 0 } };
const b: InteractionTarget = { id: "b", zoneId: "workshop", position: { x: -1, y: 0, z: 0 } };
afterEach(() => vi.unstubAllGlobals());

it("selects nearest, includes radius boundary, rejects distant and blocked targets", () => {
  expect(pickTarget(player, [b, a], 1)).toBe(a);
  expect(pickTarget(player, [a, b], 1)).toBe(a);
  expect(pickTarget(player, [a], 0.9)).toBeNull();
  expect(pickTarget(player, [a, b], 2, target => target.id === "b")).toBe(b);
  expect(pickTarget(player, [{ ...b, position: { x: 2, y: 0, z: 0 } }, a], 3)).toBe(a);
  expect(pickTarget(player, [a], -1)).toBeNull();
});

it("gates E/click, publishes hints, records closed zones without resuming and cleans up", () => {
  const hint = { textContent: "", setAttribute: vi.fn(), remove: vi.fn() };
  const document = { activeElement: null as unknown, createElement: () => hint };
  vi.stubGlobal("document", document);
  const container = Object.assign(new EventTarget(), { dataset: {} as Record<string, string>, appendChild: vi.fn() });
  let state = sessionReducer(initialSession(), { type: "mode", mode: "world" });
  let position = player;
  const opened = vi.fn();
  container.addEventListener("tqa:open-content", opened);
  const interaction = createInteraction({
    container: container as unknown as HTMLElement,
    targets: [a, b],
    player: () => position,
    enabled: () => state.pauseReasons.size === 0,
    visit: zoneId => { state = sessionReducer(state, { type: "visitZone", zoneId }); },
  });
  interaction.update();
  expect(container.dataset.worldHint).toBe("first-light");
  expect(hint.textContent).toContain("E");
  expect(hint.setAttribute).toHaveBeenCalledWith("aria-live", "polite");
  expect(interaction.keydown({ code: "KeyE", target: { closest: () => ({}) } })).toBe(false);
  document.activeElement = { closest: () => ({}) };
  expect(interaction.keydown({ code: "KeyE" })).toBe(false);
  document.activeElement = null;
  expect(interaction.keydown({ code: "KeyE", repeat: true })).toBe(false);
  expect(interaction.keydown({ code: "KeyQ" })).toBe(false);
  expect(opened).not.toHaveBeenCalled();
  expect(interaction.keydown({ code: "KeyE" })).toBe(true);
  expect(opened.mock.calls[0]![0].detail).toEqual({ zoneId: "first-light" });
  expect(interaction.click("b")).toBe(true);
  expect(opened.mock.calls[1]![0].detail).toEqual({ zoneId: "workshop" });
  position = { x: 20, y: 0, z: 0 };
  expect(interaction.click("b")).toBe(false);
  interaction.update();
  expect(container.dataset.worldHint).toBeUndefined();
  state = sessionReducer(state, { type: "pause", reason: "overlay", paused: true });
  position = player;
  expect(interaction.keydown({ code: "KeyE" })).toBe(false);
  expect(interaction.click("a")).toBe(false);
  const before = state;
  container.dispatchEvent(new CustomEvent("tqa:content-closed", { detail: { zoneId: "workshop" } }));
  expect(state.sessionProgress.visitedZones.has("workshop")).toBe(true);
  expect(before.sessionProgress.visitedZones.size).toBe(0);
  expect(state.position).toBe(before.position);
  expect(state.pauseReasons).toBe(before.pauseReasons);
  interaction.dispose();
  container.dispatchEvent(new CustomEvent("tqa:content-closed", { detail: { zoneId: "first-light" } }));
  expect(state.sessionProgress.visitedZones.has("first-light")).toBe(false);
  expect(hint.remove).toHaveBeenCalledOnce();
});
