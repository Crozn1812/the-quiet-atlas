import { readFileSync, readdirSync } from "node:fs";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWorldJournal } from "@/components/portfolio/journal/WorldJournal";
import { mountWorldMenu } from "@/components/portfolio/WorldMenu";
import { installJournalDOM, type TestElement } from "./journal-dom";

describe("world journal session", () => {
  let dom: ReturnType<typeof installJournalDOM>;
  let dispose: ReturnType<typeof mountWorldJournal> | undefined;
  let removeMenu: (() => void) | undefined;
  let pauses: { reason: string; paused: boolean }[];

  beforeAll(async () => { await import("@/components/portfolio/journal/AtlasJournal"); });

  beforeEach(() => {
    dom = installJournalDOM();
    vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
    pauses = [];
    dom.container.addEventListener("tqa:pause", event => pauses.push((event as CustomEvent).detail));
  });
  afterEach(async () => {
    await act(async () => { removeMenu?.(); dispose?.(); });
    removeMenu = undefined;
    dispose = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // CI (Node 24, 2-core runner): resolving the lazy AtlasJournal chunk can take a macrotask, which act() alone
  // does not wait for. Each interaction therefore also yields one event-loop turn inside act (run #41955505444).
  // Fake-timer tests drive time themselves.
  const settle = () => vi.isFakeTimers() ? Promise.resolve() : act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  async function mount() {
    await act(async () => { dispose = mountWorldJournal(dom.container as unknown as HTMLElement, "en"); });
    await settle();
  }
  async function key(key: string, options: Record<string, unknown> = {}) {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, ...options });
    Object.defineProperty(event, "target", { value: dom.document.activeElement });
    await act(async () => { dom.document.dispatchEvent(event); });
    await settle();
    return event;
  }
  async function click(button: TestElement) { await act(async () => { button.click(); }); await settle(); }
  function journal() { return dom.document.querySelector("dialog[open]"); }
  function button(label: string) {
    const found = dom.shell.querySelectorAll("button").find(node => node.textContent === label);
    expect(found, label).toBeDefined();
    return found!;
  }
  async function visit(zoneId: string) {
    await act(async () => {
      dom.container.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId } }));
    });
  }

  it("stamps the zone from open-content, ignores unknown zones and exposes eight rows", async () => {
    await mount();
    await visit("roots");
    await visit("secret");
    await key("j");
    expect(journal()!.querySelectorAll("li")).toHaveLength(8);
    expect(journal()!.querySelectorAll("svg")).toHaveLength(1);
    expect(button("The Roots").getAttribute("aria-label")).toBe("The Roots, visited");
    expect(button("The Workshop").getAttribute("aria-label")).toBe("The Workshop");
    expect(journal()!.textContent).not.toContain("secret");
  });

  it("opens with J, closes with J/Escape, balances journal pauses and restores focus", async () => {
    await mount();
    expect((await key("j")).defaultPrevented).toBe(true);
    expect(journal()).not.toBeNull();
    expect(dom.document.activeElement.tagName).toBe("H2");
    await key("J");
    expect(journal()).toBeNull();
    expect(dom.document.activeElement).toBe(dom.container);
    await key("j");
    await key("Escape");
    expect(journal()).toBeNull();
    expect(pauses).toEqual([true, false, true, false].map(paused => ({ reason: "journal", paused })));
  });

  it("ignores editing, modifier/composition/repeat keys, other overlays and non-world modes", async () => {
    await mount();
    for (const tag of ["input", "textarea", "select", "div"]) {
      const input = dom.document.createElement(tag);
      if (tag === "div") input.setAttribute("contenteditable", "true");
      dom.shell.append(input);
      input.focus();
      await key("j");
      expect(journal()).toBeNull();
      input.remove();
    }
    dom.container.focus();
    for (const option of ["ctrlKey", "metaKey", "altKey", "repeat", "isComposing"]) await key("j", { [option]: true });
    for (const tag of ["dialog", "div"]) {
      const overlay = dom.document.createElement(tag);
      if (tag === "dialog") overlay.showModal();
      else { overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); }
      dom.shell.append(overlay);
      await key("j");
      expect(dom.shell.querySelectorAll("ol")).toHaveLength(0);
      overlay.remove();
    }
    for (const mode of ["welcome", "loading", "recoverableError"]) {
      dom.shell.setAttribute("data-app-mode", mode);
      await key("j");
    }
    expect(pauses).toEqual([]);
  });

  it("closes before the selected row opens the existing content overlay", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ projects: [] }) }));
    await act(async () => {
      removeMenu = mountWorldMenu(dom.container as unknown as HTMLElement, "en", dom.trigger as unknown as HTMLButtonElement, vi.fn(), vi.fn());
    });
    await key("j");
    const requests: unknown[] = [];
    dom.container.addEventListener("tqa:open-content", event => {
      requests.push((event as CustomEvent).detail);
      expect(dom.shell.querySelectorAll("ol")).toHaveLength(0);
    });
    await click(button("The Workshop"));
    expect(requests).toEqual([{ zoneId: "workshop" }]);
    expect(journal()!.querySelector("#world-content-title")!.textContent).toBe("The Workshop");
    expect(dom.document.activeElement.getAttribute("id")).toBe("world-content-title");
    expect(pauses).toEqual([
      { reason: "journal", paused: true },
      { reason: "journal", paused: false },
      { reason: "overlay", paused: true },
    ]);
    await key("Escape");
    expect(journal()).toBeNull();
    await key("j");
    expect(button("The Workshop").getAttribute("aria-label")).toBe("The Workshop, visited");
  });

  it("opens from the localized menu, prevents stacking, and keeps labels live", async () => {
    await act(async () => {
      removeMenu = mountWorldMenu(dom.container as unknown as HTMLElement, "vi", dom.trigger as unknown as HTMLButtonElement, vi.fn(), vi.fn());
    });
    await click(dom.trigger);
    await key("j");
    expect(dom.shell.querySelectorAll("ol")).toHaveLength(0);
    await click(button("Sổ Atlas"));
    expect(journal()!.getAttribute("lang")).toBe("vi");
    expect(journal()!.querySelector("h2")!.textContent).toBe("Sổ Atlas");
    expect(pauses.slice(0, 3)).toEqual([
      { reason: "overlay", paused: true }, { reason: "overlay", paused: false }, { reason: "journal", paused: true },
    ]);
    await key("Escape");
    await click(dom.trigger);
    await click(button("English"));
    expect(button("Atlas Journal")).toBeDefined();
    await click(button("Atlas Journal"));
    expect(journal()!.getAttribute("lang")).toBe("en");
  });

  it("updates title and visited announcements without remounting an open journal", async () => {
    await mount();
    await visit("roots");
    await key("j");
    const original = journal();
    await act(async () => { dispose!.setLocale("vi"); });
    expect(journal()).toBe(original);
    expect(journal()!.querySelector("h2")!.textContent).toBe("Sổ Atlas");
    expect(button("The Roots").getAttribute("aria-label")).toBe("The Roots, đã ghé");
    expect(button("Đóng")).toBeDefined();
    expect(pauses).toEqual([{ reason: "journal", paused: true }]);
  });

  it("cleans up open pauses/listeners and starts empty after unmount and mount", async () => {
    await mount();
    await visit("roots");
    await key("j");
    await act(async () => { dispose!(); });
    dispose = undefined;
    await key("j");
    expect(journal()).toBeNull();
    expect(pauses).toEqual([{ reason: "journal", paused: true }, { reason: "journal", paused: false }]);
    await mount();
    await key("j");
    expect(journal()!.querySelectorAll("svg")).toHaveLength(0);
  });

  it("traps focus and retains pause through the animated close", async () => {
    dom.window.matchMedia = () => ({ matches: false });
    await mount();
    await key("j");
    await key("Tab");
    expect(dom.document.activeElement).toBe(button("Close"));
    await key("Tab", { shiftKey: true });
    expect(dom.document.activeElement).toBe(button("The Last Postcard"));
    vi.useFakeTimers();
    await key("Escape");
    expect(journal()).not.toBeNull();
    expect(pauses).toEqual([{ reason: "journal", paused: true }]);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(journal()).toBeNull();
    expect(pauses.at(-1)).toEqual({ reason: "journal", paused: false });
  });
});

it("keeps storage calls out of journal wiring and preserves the initial import boundary", () => {
  const entry = readFileSync("src/components/portfolio/WorldEntry.tsx", "utf8");
  expect(entry).not.toMatch(/import\s+(?!\()[\s\S]*?from\s*["'][^"']*(?:AtlasJournal|WorldJournal|WorldMenu|journal\/)/);
  expect(entry).toContain('await import("./WorldMenu")');
  for (const file of [
    "src/components/portfolio/WorldEntry.tsx", "src/components/portfolio/WorldMenu.ts", "src/components/portfolio/WorldContent.tsx", "src/components/portfolio/worldMenuControls.ts",
    ...readdirSync("src/components/portfolio/journal").filter(file => /\.tsx?$/.test(file)).map(file => `src/components/portfolio/journal/${file}`),
  ]) {
    expect(readFileSync(file, "utf8"), file).not.toMatch(/localStorage|sessionStorage|\bcookie\b|indexedDB/);
  }
  expect(readFileSync("src/components/portfolio/journal/WorldJournal.tsx", "utf8")).toContain('import("./AtlasJournal")');
});
