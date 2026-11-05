import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWorldHud } from "@/components/portfolio/hud/WorldHud";
import { installJournalDOM, type TestElement } from "./journal-dom";

describe("lazy world HUD", () => {
  let dom: ReturnType<typeof installJournalDOM>;
  let dispose: ReturnType<typeof mountWorldHud> | undefined;
  let changed: () => void;
  let disconnect: ReturnType<typeof vi.fn>;
  let media: EventTarget & { matches: boolean };

  beforeEach(() => {
    vi.useFakeTimers();
    dom = installJournalDOM(false);
    media = Object.assign(new EventTarget(), { matches: false });
    dom.window.matchMedia = () => media;
    disconnect = vi.fn();
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: () => void) { changed = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function mount(locale = "en") {
    dispose = mountWorldHud(dom.container as unknown as HTMLElement, locale, dom.trigger as unknown as HTMLButtonElement);
  }
  const hint = () => dom.shell.querySelector("[data-hud-keys]")!;
  const card = () => dom.shell.querySelector("[data-hud-zone]")!;
  const visible = (node: TestElement) => node.getAttribute("hidden") === null;
  function intro() {
    dom.container.setAttribute("data-world-intro", "done");
    changed();
  }
  function zone(zoneId: unknown) {
    dom.container.dispatchEvent(new CustomEvent("tqa:zone-enter", { detail: { zoneId } }));
  }

  it("waits for the intro attribute, shows once for 10 s, then fades for 600 ms without taking focus", () => {
    dom.container.setAttribute("data-world-intro", "playing");
    mount();
    expect(visible(hint())).toBe(false);
    vi.advanceTimersByTime(15_000);
    expect(visible(hint())).toBe(false);
    intro();
    expect(visible(hint())).toBe(true);
    expect(hint().getAttribute("aria-live")).toBe("polite");
    expect(hint().textContent).toBe("WASD move · ←→ or drag to rotate · E interact · J journal · Esc menu");
    expect(dom.document.activeElement).toBe(dom.container);
    vi.advanceTimersByTime(9_999);
    expect(hint().getAttribute("data-fading")).toBeNull();
    vi.advanceTimersByTime(1);
    expect(hint().getAttribute("data-fading")).toBe("");
    vi.advanceTimersByTime(599);
    expect(visible(hint())).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible(hint())).toBe(false);
    changed();
    dom.container.dispatchEvent(new CustomEvent("tqa:intro"));
    expect(visible(hint())).toBe(false);
  });

  it("handles an already completed intro and hides immediately at the deadline with reduced motion", () => {
    media.matches = true;
    dom.container.setAttribute("data-world-intro", "done");
    mount("vi");
    expect(hint().textContent).toBe("WASD đi · ←→ hoặc kéo để xoay · E tương tác · J sổ · Esc menu");
    vi.advanceTimersByTime(9_999);
    expect(visible(hint())).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible(hint())).toBe(false);
    expect(hint().getAttribute("data-fading")).toBeNull();
    zone("roots");
    vi.advanceTimersByTime(3_000);
    expect(visible(card())).toBe(false);
    expect(card().getAttribute("data-fading")).toBeNull();
  });

  it.each([
    ["first-light", "First Light", "About me", "Giới thiệu"],
    ["roots", "Roots", "Skills", "Kỹ năng"],
    ["workshop", "Workshop", "Selected projects", "Dự án tiêu biểu"],
    ["milestones", "Milestones", "Certificates & learning", "Chứng chỉ & học tập"],
    ["old-trail", "Old Trail", "Journey", "Hành trình"],
    ["horizon", "Horizon", "Future direction", "Định hướng"],
    ["quiet-shore", "Quiet Shore", "Hobbies & personality", "Sở thích"],
    ["last-postcard", "Last Postcard", "Contact & CV", "Liên hệ & CV"],
  ])("shows %s with both labels and keeps its original expiry on setLocale", (id, name, en, translated) => {
    mount();
    zone(id);
    expect(card().children.map(node => node.textContent)).toEqual([name, en]);
    expect(card().getAttribute("aria-live")).toBe("polite");
    vi.advanceTimersByTime(2_000);
    dispose!.setLocale("vi");
    expect(card().children.map(node => node.textContent)).toEqual([name, translated]);
    vi.advanceTimersByTime(1_000);
    expect(card().getAttribute("data-fading")).toBe("");
    vi.advanceTimersByTime(399);
    expect(visible(card())).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible(card())).toBe(false);
  });

  it("throttles each zone for 20 s without extending the window on ignored events", () => {
    mount();
    zone("roots");
    vi.advanceTimersByTime(3_400);
    zone("roots");
    expect(visible(card())).toBe(false);
    zone("workshop");
    expect(card().textContent).toBe("WorkshopSelected projects");
    zone("roots");
    expect(card().textContent).toBe("WorkshopSelected projects");
    vi.advanceTimersByTime(16_599);
    zone("roots");
    expect(visible(card())).toBe(false);
    vi.advanceTimersByTime(1);
    zone("roots");
    expect(visible(card())).toBe(true);
    expect(card().textContent).toBe("RootsSkills");
  });

  it("ignores malformed or non-world events and updates hint and journal labels without restarting", () => {
    mount();
    for (const id of [null, {}, "unknown", "__proto__", "constructor"]) zone(id);
    expect(visible(card())).toBe(false);
    dom.shell.setAttribute("data-app-mode", "welcome");
    intro();
    zone("roots");
    expect(visible(hint())).toBe(false);
    expect(visible(card())).toBe(false);
    dom.shell.setAttribute("data-app-mode", "world");
    changed();
    vi.advanceTimersByTime(9_000);
    dispose!.setLocale("vi");
    expect(hint().textContent).toContain("WASD đi");
    expect(hint().getAttribute("aria-live")).toBe("off");
    expect(dom.shell.querySelector("[data-atlas-journal]")!.textContent).toBe("Sổ Atlas");
    vi.advanceTimersByTime(1_600);
    expect(visible(hint())).toBe(false);
  });

  it("finishes ongoing fades when system or in-memory motion preference changes", () => {
    mount();
    intro();
    vi.advanceTimersByTime(10_000);
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(visible(hint())).toBe(false);
    dom.container.dispatchEvent(new CustomEvent("tqa:set-motion", { detail: { reduced: false } }));
    zone("roots");
    vi.advanceTimersByTime(3_000);
    expect(card().getAttribute("data-fading")).toBe("");
    dom.container.dispatchEvent(new CustomEvent("tqa:set-motion", { detail: { reduced: true } }));
    expect(visible(card())).toBe(false);
  });

  it("disposes listeners, notices and timers, and resets visit history for re-entry", () => {
    mount();
    const toggle = vi.fn();
    dom.container.addEventListener("tqa:toggle-journal", toggle);
    const button = dom.shell.querySelector("[data-atlas-journal]")!;
    button.click();
    expect(toggle).toHaveBeenCalledOnce();
    intro();
    zone("roots");
    dispose!();
    dispose = undefined;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(dom.shell.querySelector("[data-atlas-journal]")).toBeNull();
    expect(dom.shell.querySelector("[data-hud-zone]")).toBeNull();
    button.click();
    zone("roots");
    expect(toggle).toHaveBeenCalledOnce();
    mount();
    zone("roots");
    expect(visible(card())).toBe(true);
  });
});

it("keeps all HUD code and copy behind the post-entry dynamic import, without storage or world imports", () => {
  const entry = readFileSync("src/components/portfolio/WorldEntry.tsx", "utf8");
  expect(entry).not.toMatch(/import\s+(?!\()[\s\S]*?from\s*["'][^"']*hud\//);
  expect(entry).toContain('await import("./hud/WorldHud")');
  expect(entry.indexOf('await import("./hud/WorldHud")')).toBeGreaterThan(entry.indexOf('setAppMode("world")'));
  expect(entry).not.toMatch(/Atlas Journal|Sổ Atlas|WASD move|tqa:zone-enter/);
  for (const file of readdirSync("src/components/portfolio/hud").filter(file => /\.ts$/.test(file))) {
    expect(readFileSync(`src/components/portfolio/hud/${file}`, "utf8"))
      .not.toMatch(/localStorage|sessionStorage|\bcookie\b|features\/world/);
  }
  const css = readFileSync("src/components/portfolio/hud/WorldHud.module.css", "utf8");
  expect(css).toContain("pointer-events: none");
  expect(css).toContain("prefers-reduced-motion: reduce");
});
