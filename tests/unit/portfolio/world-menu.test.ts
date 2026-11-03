import { expect, it } from "vitest";
import { escapeAction, pauseWorld, returnToPath, setWorldQuality, trapFocus } from "@/components/portfolio/worldMenuControls";

it("closes existing UI before opening the menu on the next Escape", () => {
  expect(escapeAction(true, false, true)).toBe("close");
  expect(escapeAction(true, false, false)).toBe("open");
  expect(escapeAction(false, false, false)).toBe("ignore");
  expect(escapeAction(true, true, true)).toBe("ignore");
});

it("wraps focus at both ends and from the title", () => {
  const first = {};
  const middle = {};
  const last = {};
  const items = [first, middle, last];
  expect(trapFocus(items, last, false)).toBe(first);
  expect(trapFocus(items, first, true)).toBe(last);
  expect(trapFocus(items, null, false)).toBe(first);
  expect(trapFocus(items, null, true)).toBe(last);
  expect(trapFocus(items, middle, false)).toBeUndefined();
  expect(trapFocus(items, middle, true)).toBeUndefined();
  expect(trapFocus([], null, false)).toBeUndefined();
  expect(trapFocus([first], first, true)).toBe(first);
});

it("dispatches ADR 0008 events on the supplied container only", () => {
  const target = new EventTarget();
  const received: [string, unknown, boolean][] = [];
  for (const name of ["tqa:pause", "tqa:set-quality", "tqa:return-to-path"]) {
    target.addEventListener(name, (event) => {
      received.push([event.type, (event as CustomEvent).detail, event.bubbles]);
    });
  }
  pauseWorld(target, true);
  pauseWorld(target, false);
  setWorldQuality(target, "low");
  setWorldQuality(target, "balanced");
  setWorldQuality(target, "high");
  returnToPath(target);
  expect(received).toEqual([
    ["tqa:pause", { reason: "overlay", paused: true }, false],
    ["tqa:pause", { reason: "overlay", paused: false }, false],
    ["tqa:set-quality", { quality: "low" }, false],
    ["tqa:set-quality", { quality: "balanced" }, false],
    ["tqa:set-quality", { quality: "high" }, false],
    ["tqa:return-to-path", null, false],
  ]);
});
