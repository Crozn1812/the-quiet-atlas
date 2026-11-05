import { messages } from "@/i18n/messages";
import type { WorldCopy } from "./WorldEntry";
import { replaceWorldLocale, type WorldLocale } from "./worldLocale";
import { mountWorldContent } from "./WorldContent";
import { worldMenuMessages } from "@/i18n/world-menu";
import { escapeAction, pauseWorld, returnToPath, setWorldQuality, trapFocus } from "./worldMenuControls";
import type { Quality } from "./worldMenuControls";

export function mountWorldMenu(container: HTMLElement, locale: string, trigger: HTMLButtonElement, leaveWorld: () => void, onLocale: (locale: WorldLocale, copy: WorldCopy, labels: { sound: string; actions: string }) => void) {
  const removeContent = mountWorldContent(container, locale);
  let language: WorldLocale = locale === "vi" ? "vi" : "en";
  let copy = worldMenuMessages[language];
  const translations: (() => void)[] = [];
  const host = document.createElement("div");
  host.className = "world-menu";
  const dialog = document.createElement("dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "world-menu-title");
  const title = document.createElement("h2");
  title.id = "world-menu-title";
  title.tabIndex = -1;
  translations.push(() => {
    title.textContent = copy.menu;
  });
  dialog.append(title);
  let opener: HTMLElement = container;

  function close() {
    if (!dialog.open) return;
    dialog.close();
    pauseWorld(container, false);
    opener.focus();
  }

  function button(label: () => string, action: () => void) {
    const element = document.createElement("button");
    element.type = "button";
    translations.push(() => {
      element.textContent = label();
    });
    element.addEventListener("click", action);
    dialog.append(element);
    return element;
  }

  button(() => `× ${copy.close}`, close);
  const label = document.createElement("label");
  const qualityText = document.createElement("span");
  translations.push(() => {
    qualityText.textContent = copy.quality;
  });
  label.append(qualityText);
  const select = document.createElement("select");
  for (const quality of ["low", "balanced", "high"] as const) {
    const option = document.createElement("option");
    option.value = quality;
    translations.push(() => {
      option.textContent = copy[quality];
    });
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
  button(() => copy.returnToPath, () => {
    returnToPath(container);
    close();
  });
  const quick = document.createElement("a");
  translations.push(() => {
    quick.href = `/${language}/quick/`;
    quick.textContent = copy.quick;
  });
  dialog.append(quick);
  const keys = document.createElement("details");
  const summary = document.createElement("summary");
  translations.push(() => {
    summary.textContent = copy.keys;
  });
  keys.append(summary);
  for (const key of ["move", "camera", "zoom", "escape"] as const) {
    const line = document.createElement("p");
    translations.push(() => {
      line.textContent = copy[key];
    });
    keys.append(line);
  }
  dialog.append(keys);
  button(() => copy.leave, leaveWorld);
  button(() => copy.close, close);

  const languages = document.createElement("fieldset");
  const legend = document.createElement("legend");
  translations.push(() => {
    legend.textContent = language === "vi" ? "Ngôn ngữ" : "Language";
  });
  languages.append(legend);
  for (const next of ["en", "vi"] as const) {
    const choice = button(() => next === "vi" ? "Tiếng Việt" : "English", () => {
      if (next === language) return;
      language = next;
      copy = worldMenuMessages[next];
      replaceWorldLocale(next, history, document);
      container.dispatchEvent(new CustomEvent("tqa:set-locale", {
        detail: { locale: next },
      }));
      for (const translate of translations) translate();
      onLocale(next, messages[next].world, {
        sound: next === "vi" ? "Âm thanh" : "Sound",
        actions: next === "vi" ? "Thao tác world" : "World actions",
      });
      removeContent.setLocale(next);
    });
    translations.push(() => {
      choice.setAttribute("aria-pressed", String(language === next));
    });
    languages.append(choice);
  }
  dialog.append(languages);
  for (const translate of translations) translate();

  function open(source: HTMLElement) {
    if (document.querySelector("dialog[open]")) return;
    opener = source;
    syncQuality();
    dialog.showModal();
    pauseWorld(container, true);
    title.focus();
  }
  const onMenu = () => open(trigger);
  trigger.addEventListener("click", onMenu);
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
    // B2-043b: during the opening cinematic Escape belongs to the world (Skip), not the menu.
    if (container.dataset.worldIntro === "playing") return;
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
  host.append(dialog);
  container.parentElement?.append(host);
  document.addEventListener("keydown", onEscape, true);
  return () => {
    close();
    removeContent();
    document.removeEventListener("keydown", onEscape, true);
    container.removeEventListener("tqa:world-state", syncQuality);
    trigger.removeEventListener("click", onMenu);
    host.remove();
  };
}
