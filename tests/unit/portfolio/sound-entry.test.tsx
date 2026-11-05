import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorldEntry } from "@/components/portfolio/WorldEntry";
import { messages } from "@/i18n/messages";
import { installJournalDOM } from "./journal-dom";

const audio = vi.hoisted(() => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return {
    ready, release: () => release(), imports: 0,
    create: vi.fn(), enable: vi.fn(async () => true), disable: vi.fn(),
    connect: vi.fn(), dispose: vi.fn(), update: vi.fn(),
  };
});
vi.mock("@/components/portfolio/sound/ambience-bridge", async () => {
  audio.imports++;
  await audio.ready;
  return { createAmbienceBridge: audio.create };
});
vi.mock("@/components/portfolio/capabilities", () => ({
  createCapabilityReader: () => () => ({}), worldEligibility: () => "eligible",
}));
vi.mock("@/features/world", () => ({ mountWorld: vi.fn(async () => vi.fn()) }));
vi.mock("@/components/portfolio/WorldMenu", () => ({ mountWorldMenu: () => vi.fn() }));

let root: Root | undefined;
afterEach(async () => {
  audio.release();
  if (root) await act(async () => { root!.unmount(); });
  root = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function mount(locale: "en" | "vi" = "en") {
  const dom = installJournalDOM();
  const media = new EventTarget();
  dom.window.matchMedia = () => Object.assign(media, { matches: true });
  audio.create.mockImplementation(() => ({
    enable: audio.enable, disable: audio.disable, connect: audio.connect,
    dispose: audio.dispose, update: audio.update,
  }));
  root = createRoot(dom.shell as unknown as HTMLElement);
  await act(async () => {
    root!.render(<WorldEntry locale={locale} copy={messages[locale].world} email="test@example.test" backdrop={null}>Welcome</WorldEntry>);
  });
  const sound = dom.shell.querySelector("button[aria-pressed]")!;
  const world = dom.shell.querySelector("[role=region]")!;
  const button = (label: string) => dom.shell.querySelectorAll("button").find(node => node.textContent === label)!;
  return { ...dom, sound, world, button };
}

it("does not import on Welcome; cancelling a pending first click prevents late enable", async () => {
  const context = vi.fn();
  vi.stubGlobal("AudioContext", context);
  const dom = await mount();
  // installJournalDOM leaves the existing AudioContext stub intact.
  expect(audio.imports).toBe(0);
  expect(context).not.toHaveBeenCalled();
  expect(dom.sound.disabled).toBe(false);
  expect(dom.sound.getAttribute("aria-pressed")).toBe("false");
  await act(async () => { dom.sound.click(); });
  expect(audio.imports).toBe(1);
  expect(dom.sound.getAttribute("aria-pressed")).toBe("true");
  expect(audio.enable).not.toHaveBeenCalled();
  await act(async () => { dom.sound.click(); });
  expect(dom.sound.getAttribute("aria-pressed")).toBe("false");
  await act(async () => { audio.release(); await audio.ready; });
  expect(audio.create).not.toHaveBeenCalled();
  expect(audio.enable).not.toHaveBeenCalled();
  expect(context).not.toHaveBeenCalled();
});

it("enables from the click handler, toggles off, connects on entry and disposes on exit", async () => {
  const dom = await mount();
  await act(async () => { dom.sound.click(); });
  expect(audio.enable).toHaveBeenCalledOnce();
  expect(audio.connect).toHaveBeenLastCalledWith(null);
  expect(dom.sound.getAttribute("aria-pressed")).toBe("true");
  expect(dom.sound.getAttribute("title")).toBe(messages.en.world.soundOn);
  await act(async () => { dom.sound.click(); });
  expect(audio.disable).toHaveBeenCalledOnce();
  expect(dom.sound.getAttribute("aria-pressed")).toBe("false");
  await act(async () => {
    dom.sound.click();
    // Cached controller.enable is synchronous inside the click, before React effects.
    expect(audio.enable).toHaveBeenCalledTimes(2);
  });
  await act(async () => { dom.button("Enter World").click(); });
  expect(audio.connect).toHaveBeenLastCalledWith(dom.world);
  await act(async () => { dom.button("Exit world").click(); });
  expect(audio.dispose).toHaveBeenCalledOnce();
  expect(dom.sound.getAttribute("aria-pressed")).toBe("false");
});

it("disposes on world failure and unmount, and cannot enable after unmount", async () => {
  const dom = await mount();
  await act(async () => { dom.button("Enter World").click(); dom.sound.click(); });
  await act(async () => { dom.world.dispatchEvent(new CustomEvent("tqa:world-error")); });
  expect(audio.dispose).toHaveBeenCalledOnce();
  expect(dom.sound.getAttribute("aria-pressed")).toBe("false");
  await act(async () => { dom.sound.click(); });
  await act(async () => { root!.unmount(); });
  root = undefined;
  expect(audio.dispose).toHaveBeenCalledTimes(2);

  const pending = await mount();
  await act(async () => {
    pending.sound.click();
    root!.unmount();
  });
  root = undefined;
  expect(audio.create).toHaveBeenCalledTimes(2);
});

it("reverts pressed when audio is unavailable and supplies EN/VI descriptions and status labels", async () => {
  audio.enable.mockResolvedValueOnce(false);
  const dom = await mount("vi");
  expect(dom.sound.textContent).toBe("Âm thanh");
  await act(async () => { dom.sound.click(); });
  expect(dom.sound.getAttribute("aria-pressed")).toBe("false");
  expect(dom.sound.getAttribute("title")).toBe(messages.vi.world.soundOff);
  expect(messages.en.world.soundReason).toBe("Ambient forest, stream and sea sounds");
  expect(messages.vi.world.soundReason).toBe("Âm thanh rừng, suối, biển");
  for (const locale of ["en", "vi"] as const) {
    const copy = messages[locale];
    expect(copy.soundReason).toBe(copy.world.soundReason);
    expect(copy.world.soundOn).toBeTruthy();
    expect(copy.world.soundOff).toBeTruthy();
    expect(copy.world.soundOn).not.toBe(copy.world.soundOff);
  }
});
