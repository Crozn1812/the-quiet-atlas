import { act } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mountWorldJournal } from "@/components/portfolio/journal/WorldJournal";
import { installJournalDOM } from "./journal-dom";

let dom: ReturnType<typeof installJournalDOM>;
let dispose: ReturnType<typeof mountWorldJournal> | undefined;

beforeAll(async () => { await import("@/components/portfolio/journal/AtlasJournal"); });
beforeEach(() => { dom = installJournalDOM(); });
afterEach(async () => {
  await act(async () => { dispose?.(); });
  dispose = undefined;
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => { dispose = mountWorldJournal(dom.container as unknown as HTMLElement, "en"); });
}
async function found(id: unknown) {
  await act(async () => { dom.container.dispatchEvent(new CustomEvent("tqa:secret-found", { bubbles: false, detail: { id, count: 1 } })); });
}
async function toggle() { await act(async () => { dispose!.toggle(); }); }
const journal = () => dom.document.querySelector("dialog[open]");
const pages = () => journal()!.querySelectorAll("div[aria-hidden='true']");

it("reveals blank pages on secret-found, deduplicates and never lists secret names", async () => {
  await mount(); await toggle();
  expect(pages()).toHaveLength(0);
  for (const id of [undefined, null, 1, "unknown", "__proto__"]) await found(id);
  expect(pages()).toHaveLength(0);
  await found("reflection");
  expect(pages()).toHaveLength(2);
  await found("reflection");
  expect(pages()).toHaveLength(2);
  await found("forgotten-sound");
  expect(pages()).toHaveLength(1);
  await found("unmarked-road");
  expect(pages()).toHaveLength(0);
  expect(journal()!.querySelectorAll("li")).toHaveLength(8);
  expect(journal()!.textContent).not.toMatch(/reflection|forgotten.sound|unmarked.road|unwritten.page/i);
});

it("preserves found secrets across locale changes and resets them on a new mount", async () => {
  await mount();
  await found("reflection");
  await toggle();
  const original = journal();
  await act(async () => { dispose!.setLocale("vi"); });
  expect(journal()).toBe(original);
  expect(journal()!.getAttribute("lang")).toBe("vi");
  expect(pages()).toHaveLength(2);
  await act(async () => { dispose!(); });
  dispose = undefined;
  await found("forgotten-sound");
  expect(journal()).toBeNull();
  await mount(); await toggle();
  expect(pages()).toHaveLength(0);
});

it("balances the secret listener on unmount and blocks journal during the ending", async () => {
  const add = vi.spyOn(dom.container, "addEventListener");
  const remove = vi.spyOn(dom.container, "removeEventListener");
  await mount();
  dom.container.setAttribute("data-world-ending", "playing");
  // The in-memory DOM exposes attributes; browser dataset reflects this attribute.
  Object.assign(dom.container, { dataset: { worldEnding: "playing" } });
  await toggle();
  expect(journal()).toBeNull();
  Object.assign(dom.container, { dataset: { worldEnding: "seen" } });
  await toggle();
  expect(journal()).not.toBeNull();
  const listener = add.mock.calls.find(([type]) => type === "tqa:secret-found")![1];
  await act(async () => { dispose!(); });
  dispose = undefined;
  expect(remove).toHaveBeenCalledWith("tqa:secret-found", listener);
});
