import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorldEntry } from "@/components/portfolio/WorldEntry";
import { messages } from "@/i18n/messages";
import { installJournalDOM } from "./journal-dom";

const chunk = vi.hoisted(() => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { ready, release: () => release(), create: vi.fn(), enable: vi.fn() };
});
vi.mock("@/components/portfolio/sound/ambience-bridge", async () => {
  await chunk.ready;
  return { createAmbienceBridge: chunk.create };
});
vi.mock("@/components/portfolio/capabilities", () => ({
  createCapabilityReader: () => () => ({}), worldEligibility: () => "eligible",
}));

it("does not create or enable audio if the first lazy import finishes after unmount", async () => {
  const dom = installJournalDOM();
  const media = new EventTarget();
  dom.window.matchMedia = () => Object.assign(media, { matches: true });
  const root = createRoot(dom.shell as unknown as HTMLElement);
  chunk.create.mockReturnValue({ enable: chunk.enable });
  try {
    await act(async () => {
      root.render(<WorldEntry locale="en" copy={messages.en.world} email="test@example.test" backdrop={null}>Welcome</WorldEntry>);
    });
    await act(async () => { dom.shell.querySelector("button[aria-pressed]")!.click(); });
    expect(chunk.create).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
    await act(async () => { chunk.release(); await chunk.ready; });
    expect(chunk.create).not.toHaveBeenCalled();
    expect(chunk.enable).not.toHaveBeenCalled();
  } finally {
    chunk.release();
    await act(async () => { root.unmount(); });
    vi.unstubAllGlobals();
  }
});
