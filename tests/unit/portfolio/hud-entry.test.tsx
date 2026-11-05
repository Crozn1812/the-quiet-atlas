import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorldEntry } from "@/components/portfolio/WorldEntry";
import { messages } from "@/i18n/messages";
import { installJournalDOM } from "./journal-dom";

const session = vi.hoisted(() => ({
  onLocale: undefined as undefined | ((locale: "en" | "vi", copy: typeof messages.en.world) => void),
  unmount: vi.fn(),
}));
vi.mock("@/components/portfolio/capabilities", () => ({
  createCapabilityReader: () => () => ({}), worldEligibility: () => "eligible",
}));
vi.mock("@/features/world", () => ({ mountWorld: async () => session.unmount }));
vi.mock("@/components/portfolio/WorldMenu", () => ({
  mountWorldMenu: (_container: unknown, _locale: unknown, _menu: unknown, _leave: unknown, onLocale: typeof session.onLocale) => {
    session.onLocale = onLocale;
    return vi.fn();
  },
}));

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  root = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("adds the icon only in world, targets that container, follows setLocale and removes on exit/recovery", async () => {
  const dom = installJournalDOM();
  dom.window.matchMedia = () => Object.assign(new EventTarget(), { matches: true });
  root = createRoot(dom.shell as unknown as HTMLElement);
  await act(async () => {
    root!.render(<WorldEntry locale="en" copy={messages.en.world} email="test@example.test" backdrop={null}>Welcome</WorldEntry>);
  });
  const icon = () => dom.shell.querySelector("[data-atlas-journal]");
  const button = (text: string) => dom.shell.querySelectorAll("button").find(node => node.textContent === text)!;
  const world = dom.shell.querySelector("[role=region]")!;
  const toggle = vi.fn();
  world.addEventListener("tqa:toggle-journal", toggle);
  expect(icon()).toBeNull();
  await act(async () => { button("Enter World").click(); });
  expect(icon()!.textContent).toBe("Atlas Journal");
  expect(icon()!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  await act(async () => { icon()!.click(); });
  expect(toggle).toHaveBeenCalledOnce();
  await act(async () => { session.onLocale!("vi", messages.vi.world); });
  expect(icon()!.textContent).toBe("Sổ Atlas");
  await act(async () => { session.onLocale!("en", messages.en.world); });
  await act(async () => { button("Exit world").click(); });
  expect(icon()).toBeNull();
  expect(dom.shell.querySelector("[data-hud-keys]")).toBeNull();
  await act(async () => { button("Enter World").click(); });
  expect(icon()).not.toBeNull();
  await act(async () => { world.dispatchEvent(new CustomEvent("tqa:world-error")); });
  expect(icon()).toBeNull();
  expect(session.unmount).toHaveBeenCalledTimes(2);
});
