import { readFileSync, readdirSync } from "node:fs";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TeleportChooser } from "@/components/portfolio/teleport/TeleportChooser";
import { mountWorldTeleport } from "@/components/portfolio/teleport/WorldTeleport";
import { mountWorldMenu } from "@/components/portfolio/WorldMenu";
import { initialJournal, journalEntries } from "@/features/journal/model";
import { installJournalDOM, type TestElement } from "./journal-dom";

describe("world teleport chooser", () => {
  let dom: ReturnType<typeof installJournalDOM>;
  let dispose: ReturnType<typeof mountWorldTeleport> | undefined;
  let removeMenu: (() => void) | undefined;
  let pauses: { reason: string; paused: boolean }[];
  let destinations: { to: string }[];
  let cancellations: number;
  let canvas: TestElement;

  beforeAll(async () => {
    await import("@/components/portfolio/teleport/TeleportChooser");
    await import("@/components/portfolio/journal/AtlasJournal");
  });
  beforeEach(() => {
    dom = installJournalDOM();
    // Reflect the native disabled attribute in the shared minimal DOM.
    const createElement = dom.document.createElement.bind(dom.document);
    dom.document.createElement = tag => {
      const element = createElement(tag);
      Object.defineProperty(element, "disabled", {
        get: () => element.attributes.has("disabled"),
        set: value => { if (value) element.setAttribute("disabled", ""); else element.removeAttribute("disabled"); },
      });
      return element;
    };
    canvas = dom.document.createElement("canvas");
    canvas.tabIndex = 0;
    dom.container.append(canvas);
    canvas.focus();
    vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ projects: [] }) }));
    pauses = [];
    destinations = [];
    cancellations = 0;
    dom.container.addEventListener("tqa:pause", event => pauses.push((event as CustomEvent).detail));
    dom.container.addEventListener("tqa:teleport-to", event => {
      expect(dialog()).toBeNull();
      expect(pauses.at(-1)).toEqual({ reason: "overlay", paused: false });
      expect(dom.document.activeElement).toBe(canvas);
      expect(event.bubbles).toBe(false);
      destinations.push((event as CustomEvent).detail);
    });
    dom.container.addEventListener("tqa:teleport-cancel", event => {
      expect(dialog()).toBeNull();
      expect(event.bubbles).toBe(false);
      cancellations++;
    });
  });
  afterEach(async () => {
    await act(async () => { removeMenu?.(); dispose?.(); });
    removeMenu = undefined;
    dispose = undefined;
    vi.unstubAllGlobals();
  });

  async function mount(locale = "en") {
    await act(async () => { dispose = mountWorldTeleport(dom.container as unknown as HTMLElement, locale); });
  }
  async function choose(from: unknown = "roots") {
    await act(async () => { dom.container.dispatchEvent(new CustomEvent("tqa:teleport-choose", { detail: { from } })); });
  }
  async function key(key: string, shiftKey = false) {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, shiftKey });
    Object.defineProperty(event, "target", { value: dom.document.activeElement });
    await act(async () => { dom.document.dispatchEvent(event); });
    return event;
  }
  async function click(element: TestElement) { await act(async () => { element.click(); }); }
  function dialog() { return dom.document.querySelector("dialog[open]"); }
  function button(label: string) {
    const found = dom.shell.querySelectorAll("button").find(element => element.textContent === label);
    expect(found, label).toBeDefined();
    return found!;
  }

  it("opens eight zone buttons, disables the current zone and focuses the next zone", async () => {
    await mount();
    await choose();
    expect(dialog()!.querySelectorAll("li")).toHaveLength(8);
    expect(dialog()!.querySelectorAll("button")).toHaveLength(9);
    expect(button("The Roots (you are here)").disabled).toBe(true);
    expect(dialog()!.querySelectorAll("button").filter(element => element.disabled)).toHaveLength(1);
    expect(dom.document.activeElement).toBe(button("The Workshop"));
    expect(pauses).toEqual([{ reason: "overlay", paused: true }]);
    await choose("horizon");
    expect(button("The Roots (you are here)").disabled).toBe(true);
    expect(pauses).toHaveLength(1);
  });

  it("closes and resumes before dispatching the chosen destination, without cancel", async () => {
    await mount();
    await choose();
    await click(button("The Horizon"));
    expect(destinations).toEqual([{ to: "horizon" }]);
    expect(cancellations).toBe(0);
    expect(pauses).toEqual([true, false].map(paused => ({ reason: "overlay", paused })));
  });

  it("cancels with Escape, Close and native cancel, restoring canvas focus each time", async () => {
    await mount();
    await choose();
    expect((await key("Escape")).defaultPrevented).toBe(true);
    expect(dom.document.activeElement).toBe(canvas);
    await choose();
    await click(button("Close"));
    expect(dom.document.activeElement).toBe(canvas);
    await choose();
    const event = new Event("cancel", { cancelable: true });
    await act(async () => { dialog()!.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(dom.document.activeElement).toBe(canvas);
    expect(cancellations).toBe(3);
    expect(destinations).toEqual([]);
    expect(pauses.map(pause => pause.paused)).toEqual([true, false, true, false, true, false]);
  });

  it("wraps the initial focus and traps Tab/Shift+Tab without focusing the disabled zone", async () => {
    await mount();
    await choose("last-postcard");
    expect(dom.document.activeElement).toBe(button("The First Light"));
    button("Close").focus();
    expect((await key("Tab", true)).defaultPrevented).toBe(true);
    expect(dom.document.activeElement).toBe(button("The Quiet Shore"));
    await key("Tab");
    expect(dom.document.activeElement).toBe(button("Close"));
    canvas.focus();
    await key("Tab", true);
    expect(dom.document.activeElement).toBe(button("The Quiet Shore"));
  });

  it("updates Vietnamese and English labels in place without changing focus or pause", async () => {
    await mount("vi");
    await choose();
    const original = dialog();
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Đi tới…");
    expect(button("The Roots (đang ở đây)").disabled).toBe(true);
    expect(button("Đóng")).toBeDefined();
    expect(dialog()!.getAttribute("lang")).toBe("vi");
    await act(async () => { dispose!.setLocale("en"); });
    expect(dialog()).toBe(original);
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Travel to…");
    expect(button("The Roots (you are here)").disabled).toBe(true);
    expect(button("Close")).toBeDefined();
    expect(dom.document.activeElement).toBe(button("The Workshop"));
    expect(pauses).toEqual([{ reason: "overlay", paused: true }]);
  });

  it("ignores choose while another native or ARIA dialog is open", async () => {
    await mount();
    for (const tag of ["dialog", "div"]) {
      const overlay = dom.document.createElement(tag);
      if (tag === "dialog") overlay.showModal();
      else { overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); }
      dom.shell.append(overlay);
      await choose();
      expect(dom.shell.querySelectorAll("ol")).toHaveLength(0);
      overlay.remove();
    }
    expect(pauses).toEqual([]);
    expect(cancellations).toBe(0);
  });

  it("ignores unknown zones, non-world modes and the opening cinematic", async () => {
    await mount();
    for (const from of [null, "reflection", "unknown", 1, {}]) await choose(from);
    await act(async () => { dom.container.dispatchEvent(new CustomEvent("tqa:teleport-choose")); });
    for (const mode of ["welcome", "loading", "recoverableError"]) {
      dom.shell.setAttribute("data-app-mode", mode);
      await choose();
    }
    dom.shell.setAttribute("data-app-mode", "world");
    Object.assign(dom.container, { dataset: { worldIntro: "playing" } });
    await choose();
    expect(dialog()).toBeNull();
    expect(pauses).toEqual([]);
  });

  it("unmounts with a balanced pause and cancel, removes listeners and starts a fresh session", async () => {
    await mount();
    await choose();
    await act(async () => { dispose!(); });
    dispose = undefined;
    await choose();
    expect(dialog()).toBeNull();
    expect(cancellations).toBe(1);
    expect(pauses.map(pause => pause.paused)).toEqual([true, false]);
    expect(dom.document.activeElement).toBe(canvas);
    await mount("vi");
    await choose("workshop");
    expect(button("The Workshop (đang ở đây)").disabled).toBe(true);
  });

  it("mounts with the menu, follows its locale, blocks stacking and disposes with it", async () => {
    await act(async () => {
      removeMenu = mountWorldMenu(dom.container as unknown as HTMLElement, "vi", dom.trigger as unknown as HTMLButtonElement, vi.fn(), vi.fn());
    });
    await click(dom.trigger);
    await choose();
    expect(dom.shell.querySelectorAll("ol")).toHaveLength(0);
    await click(button("English"));
    await key("Escape");
    await choose();
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Travel to…");
    await click(dom.trigger);
    await key("j");
    expect(dom.shell.querySelectorAll("dialog[open]")).toHaveLength(1);
    await key("Escape");
    expect(dialog()).toBeNull();
    await key("j");
    await choose();
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Atlas Journal");
    await key("Escape");
    await choose();
    await act(async () => { removeMenu!(); });
    removeMenu = undefined;
    await choose();
    expect(dialog()).toBeNull();
    expect(cancellations).toBe(2);
  });
});

it("uses only the eight English Journal names and excludes secrets and location data", () => {
  const html = renderToStaticMarkup(<TeleportChooser from="roots" locale="vi" container={{} as HTMLElement} onChoose={() => {}} onClose={() => {}} />);
  for (const zone of journalEntries(initialJournal(), "en")) expect(html).toContain(zone.title);
  expect(html).toContain('aria-labelledby=');
  expect(html).not.toMatch(/reflection|forgotten.sound|unmarked.road|unwritten.page|coordinates|latitude|longitude|minimap|data-(?:x|y|z|position)=/i);
});

it("keeps the chooser lazy and teleport behind Enter World, with no persistence or world imports", () => {
  const entry = readFileSync("src/components/portfolio/WorldEntry.tsx", "utf8");
  expect(entry).toContain('await import("./WorldMenu")');
  expect(entry).not.toMatch(/import\s+(?!\()[\s\S]*?from\s*["'][^"']*(?:WorldTeleport|TeleportChooser|teleport\/|WorldMenu)/);
  const shell = readFileSync("src/components/portfolio/teleport/WorldTeleport.tsx", "utf8");
  expect(shell).toContain('lazy(() => import("./TeleportChooser"))');
  expect(shell).not.toMatch(/import\s+(?!\()[^;]*from\s*["']\.\/TeleportChooser["']/);
  for (const file of readdirSync("src/components/portfolio/teleport")) {
    const source = readFileSync(`src/components/portfolio/teleport/${file}`, "utf8");
    expect(source, file).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*features\/world/);
    expect(source, file).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB|history\.|location\./);
  }
  const css = readFileSync("src/components/portfolio/teleport/teleport.module.css", "utf8");
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).toContain("animation: none");
});
