import { expect, it } from "vitest";
import { inputReducer, isInputTarget } from "../../../src/features/interaction/input";

const targetWithin = (selector: string) => ({
  closest: (selectors: string) => selectors.split(",").includes(selector) ? {} : null,
});

it.each(["input", "textarea", "select", "[contenteditable]", "dialog", "[role=dialog]"])(
  "Q13: WASDE inside %s does not enter gameplay input", (selector) => {
    const target = targetWithin(selector);
    expect(isInputTarget(target)).toBe(true);
    let keys: ReadonlySet<string> = new Set();
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE"]) {
      keys = inputReducer(keys, { type: "keydown", enabled: true, event: { code, target } });
    }
    expect(keys.size).toBe(0);
  },
);

it("tracks physical codes, ignores repeats and releases keys even over an input", () => {
  const original = new Set<string>();
  let keys = inputReducer(original, { type: "keydown", enabled: true, event: { code: "KeyW" } });
  keys = inputReducer(keys, { type: "keydown", enabled: true, event: { code: "KeyW" } });
  expect([...keys]).toEqual(["KeyW"]);
  expect(original.size).toBe(0);
  keys = inputReducer(keys, { type: "keyup", event: { code: "KeyW", target: targetWithin("input") } });
  expect(keys.size).toBe(0);
});

it.each(["blur", "hidden", "focusin"] as const)("clears held keys on %s", (type) => {
  const held = inputReducer(new Set(), { type: "keydown", enabled: true, event: { code: "KeyW" } });
  expect(inputReducer(held, type === "focusin" ? { type, event: { target: targetWithin("input") } } : { type }).size).toBe(0);
  expect([...held]).toEqual(["KeyW"]);
});

it("rejects movement while paused and accepts non-element targets safely", () => {
  expect(inputReducer(new Set(), { type: "keydown", enabled: false, event: { code: "KeyD" } }).size).toBe(0);
  for (const target of [null, undefined, {}, "input"]) expect(isInputTarget(target)).toBe(false);
});
