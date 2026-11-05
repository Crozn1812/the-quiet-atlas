import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorldEntry } from "@/components/portfolio/WorldEntry";
import { messages } from "@/i18n/messages";
import { installJournalDOM } from "./journal-dom";

const chunk = vi.hoisted(() => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { ready, release: () => release(), imports: 0, mount: vi.fn(), remove: vi.fn(), unmount: vi.fn() };
});
vi.mock("@/components/portfolio/hud/WorldHud", async () => {
  chunk.imports++;
  await chunk.ready;
  return { mountWorldHud: chunk.mount };
});
vi.mock("@/components/portfolio/capabilities", () => ({
  createCapabilityReader: () => () => ({}), worldEligibility: () => "eligible",
}));
vi.mock("@/features/world", () => ({ mountWorld: async () => chunk.unmount }));
vi.mock("@/components/portfolio/WorldMenu", () => ({ mountWorldMenu: () => vi.fn() }));

it("does not import on Welcome or mount a late HUD after exit, and cleans up the next session", async () => {
  const dom = installJournalDOM();
  dom.window.matchMedia = () => Object.assign(new EventTarget(), { matches: true });
  const root = createRoot(dom.shell as unknown as HTMLElement);
  chunk.mount.mockReturnValue(Object.assign(chunk.remove, { setLocale: vi.fn() }));
  const button = (text: string) => dom.shell.querySelectorAll("button").find(node => node.textContent === text)!;
  try {
    await act(async () => {
      root.render(<WorldEntry locale="en" copy={messages.en.world} email="test@example.test" backdrop={null}>Welcome</WorldEntry>);
    });
    expect(chunk.imports).toBe(0);
    await act(async () => { button("Enter World").click(); });
    await vi.waitFor(() => expect(chunk.imports).toBe(1));
    expect(chunk.mount).not.toHaveBeenCalled();
    await act(async () => { button("Exit world").click(); });
    expect(chunk.unmount).toHaveBeenCalledOnce();
    await act(async () => { chunk.release(); await chunk.ready; });
    expect(chunk.mount).not.toHaveBeenCalled();
    await act(async () => { button("Enter World").click(); });
    expect(chunk.mount).toHaveBeenCalledOnce();
    await act(async () => { root.unmount(); });
    expect(chunk.remove).toHaveBeenCalledOnce();
    expect(chunk.unmount).toHaveBeenCalledTimes(2);
  } finally {
    chunk.release();
    await act(async () => { root.unmount(); });
    vi.unstubAllGlobals();
  }
});
