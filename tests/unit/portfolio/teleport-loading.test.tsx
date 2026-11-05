import { act } from "react";
import { expect, it, vi } from "vitest";
import { mountWorldMenu } from "@/components/portfolio/WorldMenu";
import { installJournalDOM } from "./journal-dom";

const chunk = vi.hoisted(() => {
  let resolve!: () => void;
  const ready = new Promise<void>(release => { resolve = release; });
  return { ready, release: () => resolve() };
});
vi.mock("@/components/portfolio/teleport/TeleportChooser", async () => {
  await chunk.ready;
  return vi.importActual("@/components/portfolio/teleport/TeleportChooser");
});

it("reserves a modal during lazy loading, traps focus and cancels without reopening on resolution", async () => {
  const dom = installJournalDOM();
  let removeMenu: (() => void) | undefined;
  const pauses: unknown[] = [];
  let cancellations = 0;
  dom.container.addEventListener("tqa:pause", event => pauses.push((event as CustomEvent).detail));
  dom.container.addEventListener("tqa:teleport-cancel", () => { cancellations++; });
  async function key(key: string) {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key });
    await act(async () => { dom.document.dispatchEvent(event); });
    return event;
  }
  try {
    await act(async () => {
      removeMenu = mountWorldMenu(dom.container as unknown as HTMLElement, "vi", dom.trigger as unknown as HTMLButtonElement, vi.fn(), vi.fn());
      dom.container.dispatchEvent(new CustomEvent("tqa:teleport-choose", { detail: { from: "roots" } }));
    });
    const pending = dom.document.querySelector("dialog[open]")!;
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(pending.getAttribute("aria-label")).toBe("Đi tới…");
    expect(dom.document.activeElement.textContent).toBe("Đóng");
    expect((await key("Tab")).defaultPrevented).toBe(true);
    await key("j");
    await act(async () => { dom.trigger.click(); });
    expect(dom.shell.querySelectorAll("dialog[open]")).toHaveLength(1);
    await key("Escape");
    expect(dom.document.querySelector("dialog[open]")).toBeNull();
    expect(dom.document.activeElement).toBe(dom.container);
    expect(cancellations).toBe(1);
    expect(pauses).toEqual([{ reason: "overlay", paused: true }, { reason: "overlay", paused: false }]);
    await act(async () => { chunk.release(); await chunk.ready; });
    expect(dom.document.querySelector("dialog[open]")).toBeNull();
    await act(async () => {
      dom.container.dispatchEvent(new CustomEvent("tqa:teleport-choose", { detail: { from: "roots" } }));
    });
    expect(dom.document.querySelector("dialog[open]")!.querySelectorAll("li")).toHaveLength(8);
  } finally {
    chunk.release();
    await act(async () => { removeMenu?.(); });
    vi.unstubAllGlobals();
  }
});
