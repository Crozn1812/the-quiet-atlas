import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountWorldMenu } from "@/components/portfolio/WorldMenu";
import { installJournalDOM, type TestElement } from "./journal-dom";

let dom: ReturnType<typeof installJournalDOM>;
let remove: (() => void) | undefined;
let observers: MenuMutationObserver[];

// The shared memory DOM has no mutation delivery. Model the observer's async
// attribute notifications so React-style delayed HUD updates are covered too.
class MenuMutationObserver {
  target?: TestElement;
  attributeFilter?: string[];
  pending = false;
  constructor(public callback: () => void) { observers.push(this); }
  observe(target: TestElement, options: MutationObserverInit) {
    this.target = target;
    this.attributeFilter = options.attributeFilter;
  }
  disconnect = vi.fn(() => { this.target = undefined; });
}

beforeEach(() => {
  dom = installJournalDOM(false);
  observers = [];
  vi.stubGlobal("history", { state: null, replaceState: vi.fn() });
  vi.stubGlobal("MutationObserver", MenuMutationObserver);
});

afterEach(async () => {
  await act(async () => { remove?.(); });
  remove = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(locale = "en") {
  await act(async () => {
    remove = mountWorldMenu(dom.container as unknown as HTMLElement, locale,
      dom.trigger as unknown as HTMLButtonElement, vi.fn(), vi.fn());
  });
}
const menu = () => dom.shell.querySelector('[aria-labelledby="world-menu-title"]')!;
const button = (label: string) => menu().querySelectorAll("button").find(node => node.textContent === label)!;
async function click(node: TestElement) { await act(async () => { node.click(); }); }

function installSound(enabled = false) {
  const description = dom.document.createElement("span");
  description.setAttribute("id", "sound-reason");
  description.textContent = "Ambient sounds";
  const hud = dom.document.createElement("button");
  hud.setAttribute("aria-describedby", "sound-reason");
  hud.setAttribute("aria-pressed", String(enabled));
  dom.shell.append(description, hud);
  const setAttribute = hud.setAttribute.bind(hud);
  vi.spyOn(hud, "setAttribute").mockImplementation((name, value) => {
    setAttribute(name, value);
    for (const observer of observers) {
      if (observer.target !== hud || !observer.attributeFilter?.includes(name) || observer.pending) continue;
      observer.pending = true;
      queueMicrotask(() => {
        observer.pending = false;
        if (observer.target) observer.callback();
      });
    }
  });
  const onClick = vi.fn(() => {
    // Like React, the HUD may commit aria-pressed after the click returns.
    const next = hud.getAttribute("aria-pressed") !== "true";
    queueMicrotask(() => hud.setAttribute("aria-pressed", String(next)));
  });
  hud.addEventListener("click", onClick);
  return { hud, onClick };
}

it.each(["en", "vi"])("renders all ten menu items in the specified order in %s", async locale => {
  installSound();
  await mount(locale);
  const groups = menu().children.slice(1);
  expect(groups.map(node => node.tagName)).toEqual(["DIV", "DIV", "DIV"]);
  expect(groups.map(node => node.querySelector("h3")!.textContent)).toEqual(locale === "vi" ? ["Hành trình", "Cài đặt", "Khác"] : ["Journey", "Settings", "Other"]);
  const items = groups.flatMap(node => node.children.filter(child => child.tagName !== "H3"));
  expect(items.map(node => node.tagName)).toEqual([
    "BUTTON", "BUTTON", "FIELDSET", "BUTTON", "BUTTON", "FIELDSET", "DETAILS", "A", "BUTTON", "BUTTON",
  ]);
  const labels = items.map(node => {
    if (node.tagName === "LABEL") return node.querySelector("span")!.textContent;
    if (node.tagName === "FIELDSET") return node.querySelector("legend")!.textContent;
    if (node.tagName === "DETAILS") return node.querySelector("summary")!.textContent;
    return node.textContent;
  });
  expect(labels).toEqual(locale === "vi" ? [
    "Sổ Atlas", "Quay về đường", "Chất lượng", "Âm thanh: Tắt", "Giảm chuyển động: Tắt",
    "Ngôn ngữ", "Bảng phím", "Mở Quick Portfolio", "Rời world", "× Đóng",
  ] : [
    "Atlas Journal", "Return to path", "Quality", "Sound: Off", "Reduced motion: Off",
    "Language", "Keyboard controls", "Open Quick Portfolio", "Exit world", "× Close",
  ]);
});

it.each([false, true])("defaults reduced motion to matchMedia=%s and dispatches boolean container-only events", async reduced => {
  const matchMedia = vi.fn(() => ({ matches: reduced }));
  dom.window.matchMedia = matchMedia;
  const received: CustomEvent[] = [];
  const parent = vi.fn();
  dom.container.addEventListener("tqa:set-motion", event => received.push(event as CustomEvent));
  dom.shell.addEventListener("tqa:set-motion", parent);
  await mount();
  expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  expect(received).toHaveLength(0);
  const motion = button(`Reduced motion: ${reduced ? "On" : "Off"}`);
  expect(motion.getAttribute("aria-pressed")).toBe(String(reduced));
  await click(motion);
  expect(motion.getAttribute("aria-pressed")).toBe(String(!reduced));
  expect(motion.textContent).toBe(`Reduced motion: ${reduced ? "Off" : "On"}`);
  await click(motion);
  expect(received.map(event => [event.detail, event.bubbles])).toEqual([
    [{ reduced: !reduced }, false], [{ reduced }, false],
  ]);
  expect(parent).not.toHaveBeenCalled();
});

it("keeps motion in memory across opens and language changes, then resets on a fresh mount", async () => {
  await mount();
  await click(dom.trigger);
  await click(button("Reduced motion: Off"));
  await click(button("× Close"));
  await click(dom.trigger);
  await click(button("Tiếng Việt"));
  expect(button("Giảm chuyển động: Bật").getAttribute("aria-pressed")).toBe("true");
  await act(async () => { remove!(); });
  remove = undefined;
  await mount("vi");
  expect(button("Giảm chuyển động: Tắt").getAttribute("aria-pressed")).toBe("false");
});

it.each([false, true])("uses the HUD sound state (%s), forwards clicks and observes changes in both directions", async enabled => {
  const { hud, onClick } = installSound(enabled);
  const context = vi.fn();
  vi.stubGlobal("AudioContext", context);
  await mount();
  const sound = button(`Sound: ${enabled ? "On" : "Off"}`);
  expect(sound.disabled).toBe(false);
  expect(sound.getAttribute("aria-pressed")).toBe(String(enabled));
  await click(sound);
  expect(onClick).toHaveBeenCalledOnce();
  expect(hud.getAttribute("aria-pressed")).toBe(String(!enabled));
  expect(sound.getAttribute("aria-pressed")).toBe(String(!enabled));
  expect(sound.textContent).toBe(`Sound: ${enabled ? "Off" : "On"}`);
  await click(hud);
  expect(sound.getAttribute("aria-pressed")).toBe(String(enabled));
  await act(async () => { hud.setAttribute("aria-pressed", "false"); });
  expect(sound.getAttribute("aria-pressed")).toBe("false");
  expect(sound.textContent).toBe("Sound: Off");
  await click(button("Tiếng Việt"));
  expect(sound.textContent).toBe("Âm thanh: Tắt");
  await click(sound);
  expect(sound.textContent).toBe("Âm thanh: Bật");
  expect(hud.getAttribute("aria-pressed")).toBe("true");
  expect(context).not.toHaveBeenCalled();
  const observer = observers.find(item => item.target === hud)!;
  await act(async () => { remove!(); });
  remove = undefined;
  expect(observer.disconnect).toHaveBeenCalledOnce();
  await act(async () => { hud.setAttribute("aria-pressed", "false"); });
  expect(sound.getAttribute("aria-pressed")).toBe("true");
  await click(dom.trigger);
  expect(dom.shell.querySelectorAll("dialog")).toHaveLength(0);
});

it("disables sound if the HUD control is absent or disabled", async () => {
  await mount();
  expect(button("Sound: Off").disabled).toBe(true);
  await act(async () => { remove!(); });
  remove = undefined;
  const { hud, onClick } = installSound();
  hud.disabled = true;
  await mount();
  expect(button("Sound: Off").disabled).toBe(true);
  expect(onClick).not.toHaveBeenCalled();
});

it("updates the Quick link and the complete keyboard/mouse guide when locale changes", async () => {
  await mount();
  const quick = menu().querySelector("a")! as TestElement & { href: string };
  const lines = () => menu().querySelector("details")!.querySelectorAll("p").map(line => line.textContent);
  expect(quick.href).toBe("/en/quick/");
  expect(lines()).toEqual([
    "WASD: Move · Shift: Run", "← → / mouse drag: Rotate camera", "+ / − / scroll: Zoom",
    "E: Interact / get on or off the bike", "C: Toggle Auto Cruise", "J: Atlas Journal", "Esc: Close UI / open menu",
  ]);
  await click(button("Tiếng Việt"));
  expect(quick.href).toBe("/vi/quick/");
  expect(lines()).toEqual([
    "WASD: Di chuyển · Shift: Chạy", "← → / kéo chuột: Xoay camera", "+ / − / cuộn: Thu phóng",
    "E: Tương tác / lên, xuống xe", "C: Bật/tắt Auto Cruise", "J: Sổ Atlas", "Esc: Đóng UI / mở menu",
  ]);
  await click(button("English"));
  expect(quick.href).toBe("/en/quick/");
});

it.each(["en", "vi"])("ADR 0016: switches page language from %s while keeping the world English", async pageLocale => {
  const onLocale = vi.fn();
  const worldLocale = vi.fn();
  dom.container.addEventListener("tqa:set-locale", worldLocale);
  await act(async () => {
    remove = mountWorldMenu(dom.container as unknown as HTMLElement, "en",
      dom.trigger as unknown as HTMLButtonElement, vi.fn(), onLocale, true, pageLocale);
  });
  await click(dom.trigger);
  const quick = menu().querySelector("a")! as TestElement & { href: string };
  expect(button(pageLocale === "vi" ? "Tiếng Việt" : "English").getAttribute("aria-pressed")).toBe("true");
  expect(quick.href).toBe(`/${pageLocale}/quick/`);
  for (const next of pageLocale === "en" ? ["vi", "en"] : ["en", "vi"]) {
    await click(button(next === "vi" ? "Tiếng Việt" : "English"));
    expect(history.replaceState).toHaveBeenLastCalledWith(null, "", `/${next}/`);
    expect((dom.document.documentElement as TestElement & { lang: string }).lang).toBe(next);
    expect(button(next === "vi" ? "Tiếng Việt" : "English").getAttribute("aria-pressed")).toBe("true");
    expect(quick.href).toBe(`/${next}/quick/`);
    expect(quick.textContent).toBe("Open Quick Portfolio");
    expect(button("Atlas Journal")).toBeDefined();
    expect(button("× Close")).toBeDefined();
    expect(menu().open).toBe(true);
    expect(onLocale).toHaveBeenLastCalledWith(next, expect.objectContaining({ leave: "Exit world" }), { sound: "Sound", actions: "World actions" });
  }
  expect(worldLocale).not.toHaveBeenCalled();
});

it("traps Tab and Shift+Tab with the new controls and restores focus on Escape", async () => {
  installSound();
  const pauses = vi.fn();
  dom.container.addEventListener("tqa:pause", pauses);
  await mount();
  await click(dom.trigger);
  const dialog = menu();
  const first = button("Atlas Journal");
  const last = button("× Close");
  function tab(backwards = false) {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key: "Tab", shiftKey: backwards });
    dialog.dispatchEvent(event);
    return event;
  }
  expect(dom.document.activeElement.tagName).toBe("H2");
  expect(tab().defaultPrevented).toBe(true);
  expect(dom.document.activeElement).toBe(first);
  expect(tab(true).defaultPrevented).toBe(true);
  expect(dom.document.activeElement).toBe(last);
  expect(tab().defaultPrevented).toBe(true);
  expect(dom.document.activeElement).toBe(first);
  dialog.querySelectorAll("input")[1]!.focus();
  expect(tab().defaultPrevented).toBe(false);
  expect(tab(true).defaultPrevented).toBe(false);
  button("Reduced motion: Off").focus();
  const escape = new Event("keydown", { cancelable: true });
  Object.assign(escape, { key: "Escape" });
  Object.defineProperty(escape, "target", { value: dom.document.activeElement });
  dom.document.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(dialog.open).toBe(false);
  expect(dom.document.activeElement).toBe(dom.trigger);
  expect(pauses.mock.calls.map(([event]) => event.detail.paused)).toEqual([true, false]);
});

it("synchronizes quality radios and dispatches the chosen quality without remounting", async () => {
  dom.container.setAttribute("data-world-quality", "high");
  const received: string[] = [];
  dom.container.addEventListener("tqa:set-quality", event => received.push((event as CustomEvent).detail.quality));
  await mount();
  await click(dom.trigger);
  const radios = menu().querySelectorAll("input") as (TestElement & { checked: boolean; value: string; type: string; name: string })[];
  expect(radios.map(radio => [radio.type, radio.name, radio.value, radio.checked])).toEqual([
    ["radio", "world-menu-quality", "low", false],
    ["radio", "world-menu-quality", "balanced", false],
    ["radio", "world-menu-quality", "high", true],
  ]);
  radios[0]!.checked = true;
  radios[0]!.dispatchEvent(new Event("change"));
  expect(received).toEqual(["low"]);
  dom.container.setAttribute("data-world-quality", "balanced");
  dom.container.dispatchEvent(new Event("tqa:world-state"));
  expect(radios.map(radio => radio.checked)).toEqual([false, true, false]);
  await click(button("Tiếng Việt"));
  expect(radios.map(radio => radio.parentElement!.textContent)).toEqual(["Thấp", "Cân bằng", "Cao"]);
});
