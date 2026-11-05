import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountWorldMenu } from "@/components/portfolio/WorldMenu";
import { installJournalDOM } from "./journal-dom";

let dom: ReturnType<typeof installJournalDOM>;
let remove: (() => void) | undefined;
beforeEach(() => {
  dom = installJournalDOM();
  vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
});
afterEach(async () => {
  await act(async () => { remove?.(); });
  remove = undefined;
  vi.unstubAllGlobals();
});
async function mount(locale = "en") {
  await act(async () => {
    remove = mountWorldMenu(dom.container as unknown as HTMLElement, locale, dom.trigger as unknown as HTMLButtonElement, vi.fn(), vi.fn());
  });
}
const toggle = () => dom.shell.querySelectorAll("button").find(button => button.textContent.startsWith("Mascot:"))!;

it.each(["en", "vi"])("defaults on and dispatches container-only boolean toggle events in %s", async locale => {
  const events: CustomEvent[] = [];
  dom.container.addEventListener("tqa:set-mascot", event => events.push(event as CustomEvent));
  await mount(locale);
  expect(events).toHaveLength(0);
  const button = toggle();
  expect(button.textContent).toBe(locale === "vi" ? "Mascot: Bật" : "Mascot: On");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  await act(async () => { button.click(); });
  expect(button.textContent).toBe(locale === "vi" ? "Mascot: Tắt" : "Mascot: Off");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  await act(async () => { button.click(); });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(events.map(event => [event.type, event.detail, event.bubbles])).toEqual([
    ["tqa:set-mascot", { enabled: false }, false],
    ["tqa:set-mascot", { enabled: true }, false],
  ]);
});

it("keeps the setting across menu opens and locale changes, and resets on a fresh session", async () => {
  const events = vi.fn();
  dom.container.addEventListener("tqa:set-mascot", events);
  await mount();
  await act(async () => { dom.trigger.click(); toggle().click(); });
  const dialog = dom.shell.querySelector("[aria-labelledby='world-menu-title']")!;
  await act(async () => { dialog.querySelectorAll("button").find(button => button.textContent === "Tiếng Việt")!.click(); });
  expect(toggle().textContent).toBe("Mascot: Tắt");
  expect(toggle().getAttribute("aria-pressed")).toBe("false");
  await act(async () => { dialog.querySelectorAll("button").find(button => button.textContent.startsWith("×"))!.click(); dom.trigger.click(); });
  expect(toggle().getAttribute("aria-pressed")).toBe("false");
  expect(events).toHaveBeenCalledOnce();
  await act(async () => { remove!(); });
  remove = undefined;
  expect(dom.shell.querySelectorAll("dialog")).toHaveLength(0);
  await mount();
  expect(toggle().getAttribute("aria-pressed")).toBe("true");
});
