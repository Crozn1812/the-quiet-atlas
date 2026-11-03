import { mountWorldContent } from "./WorldContent";
import { worldMenuMessages } from "@/i18n/world-menu";
import { escapeAction, pauseWorld, returnToPath, setWorldQuality, trapFocus } from "./worldMenuControls";
import type { Quality } from "./worldMenuControls";

export function mountWorldMenu(container: HTMLElement, locale: string) {
  const removeContent = mountWorldContent(container, locale);
  const copy = worldMenuMessages[locale === "vi" ? "vi" : "en"];
  const host = document.createElement("div");
  host.className = "world-menu";
  const trigger = document.createElement("button");
  trigger.textContent = copy.menu;
  trigger.setAttribute("aria-haspopup", "dialog");
  const dialog = document.createElement("dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "world-menu-title");
  const title = document.createElement("h2");
  title.id = "world-menu-title";
  title.tabIndex = -1;
  title.textContent = copy.menu;
  dialog.append(title);
  let opener: HTMLElement = container;

  function close() {
    if (!dialog.open) return;
    dialog.close();
    pauseWorld(container, false);
    opener.focus();
  }

  function button(label: string, action: () => void) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.addEventListener("click", action);
    dialog.append(element);
    return element;
  }

  button(`× ${copy.close}`, close);
  const label = document.createElement("label");
  label.textContent = copy.quality;
  const select = document.createElement("select");
  for (const quality of ["low", "balanced", "high"] as const) {
    const option = document.createElement("option");
    option.value = quality;
    option.textContent = copy[quality];
    select.append(option);
  }
  label.append(select);
  dialog.append(label);
  function syncQuality() {
    const quality = container.getAttribute("data-world-quality");
    select.value = quality === "low" || quality === "high" ? quality : "balanced";
  }
  select.addEventListener("change", () => {
    setWorldQuality(container, select.value as Quality);
  });
  container.addEventListener("tqa:world-state", syncQuality);
  button(copy.returnToPath, () => {
    returnToPath(container);
    close();
  });
  const quick = document.createElement("a");
  quick.href = `/${locale}/quick/`;
  quick.textContent = copy.quick;
  dialog.append(quick);
  const keys = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = copy.keys;
  keys.append(summary);
  for (const text of [copy.move, copy.camera, copy.zoom, copy.escape]) {
    const line = document.createElement("p");
    line.textContent = text;
    keys.append(line);
  }
  dialog.append(keys);
  button(copy.close, close);

  function open(source: HTMLElement) {
    if (document.querySelector("dialog[open]")) return;
    opener = source;
    syncQuality();
    dialog.showModal();
    pauseWorld(container, true);
    title.focus();
  }
  trigger.addEventListener("click", () => open(trigger));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>("button, select, a[href], summary"));
    const next = trapFocus(items, document.activeElement as HTMLElement | null, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  function onEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    const target = event.target;
    const editing = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
    const activeDialog = document.querySelector("dialog[open], [role='dialog'][aria-modal='true']:not(dialog)");
    const action = escapeAction(container.closest("[data-app-mode]")?.getAttribute("data-app-mode") === "world", editing, Boolean(activeDialog));
    if (action === "ignore") return;
    // Other overlays own their close behavior; never open a menu above them.
    if (action === "close" && activeDialog !== dialog) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (action === "close") close();
    else open(container);
  }
  host.append(trigger, dialog);
  container.parentElement?.append(host);
  document.addEventListener("keydown", onEscape, true);
  return () => {
    close();
    removeContent();
    document.removeEventListener("keydown", onEscape, true);
    container.removeEventListener("tqa:world-state", syncQuality);
    host.remove();
  };
}
