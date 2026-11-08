import { messages } from "@/i18n/messages";
import type { WorldCopy } from "./WorldEntry";
import { replaceWorldLocale, type WorldLocale } from "./worldLocale";
import { mountWorldContent } from "./WorldContent";
import { worldMenuMessages } from "@/i18n/world-menu";
import { escapeAction, pauseWorld, returnToPath, setWorldMotion, setWorldQuality, trapFocus } from "./worldMenuControls";
import { journalTitle } from "@/features/journal/model";
import { mountWorldJournal } from "./journal/WorldJournal";
import { mountWorldTeleport } from "./teleport/WorldTeleport";

export function mountWorldMenu(container: HTMLElement, locale: string, trigger: HTMLButtonElement, leaveWorld: () => void, onLocale: (locale: WorldLocale, copy: WorldCopy, labels: { sound: string; actions: string }) => void) {
  const removeJournal = mountWorldJournal(container, locale);
  const removeTeleport = mountWorldTeleport(container, locale);
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

  function group(label: () => string) {
    const section = document.createElement("div");
    section.className = "world-menu-group";
    const heading = document.createElement("h3");
    translations.push(() => { heading.textContent = label(); });
    section.append(heading);
    dialog.append(section);
    return section;
  }
  let destination = group(() => language === "vi" ? "Hành trình" : "Journey");

  function button(label: () => string, action: () => void) {
    const element = document.createElement("button");
    element.type = "button";
    translations.push(() => {
      element.textContent = label();
    });
    element.addEventListener("click", action);
    destination.append(element);
    return element;
  }

  button(() => journalTitle(language), () => {
    close();
    removeJournal.toggle();
  });
  button(() => copy.returnToPath, () => {
    returnToPath(container);
    close();
  });
  destination = group(() => language === "vi" ? "Cài đặt" : "Settings");
  const qualities = document.createElement("fieldset");
  qualities.className = "world-menu-choices";
  const qualityText = document.createElement("legend");
  translations.push(() => { qualityText.textContent = copy.quality; });
  qualities.append(qualityText);
  const radios: HTMLInputElement[] = [];
  for (const quality of ["low", "balanced", "high"] as const) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "world-menu-quality";
    radio.value = quality;
    const text = document.createElement("span");
    translations.push(() => { text.textContent = copy[quality]; });
    radio.addEventListener("change", () => {
      if (radio.checked) setWorldQuality(container, quality);
    });
    radios.push(radio);
    label.append(radio, text);
    qualities.append(label);
  }
  destination.append(qualities);
  function syncQuality() {
    const value = container.getAttribute("data-world-quality");
    const quality = value === "low" || value === "high" ? value : "balanced";
    for (const radio of radios) radio.checked = radio.value === quality;
  }
  syncQuality();
  container.addEventListener("tqa:world-state", syncQuality);

  const soundButton = container.parentElement?.querySelector<HTMLButtonElement>('button[aria-describedby="sound-reason"]');
  function soundLabel() {
    return `${copy.sound}: ${soundButton?.getAttribute("aria-pressed") === "true" ? copy.on : copy.off}`;
  }
  const soundToggle = button(soundLabel, () => {
    // The HUD owns audio and user activation, including failed/pending enables.
    soundButton?.click();
    syncSound();
  });
  function syncSound() {
    soundToggle.textContent = soundLabel();
    soundToggle.setAttribute("aria-pressed", String(soundButton?.getAttribute("aria-pressed") === "true"));
    soundToggle.disabled = !soundButton || soundButton.disabled;
  }
  translations.push(syncSound);
  const soundObserver = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(syncSound);
  if (soundButton) soundObserver?.observe(soundButton, { attributes: true, attributeFilter: ["aria-pressed", "disabled"] });

  let reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const motionLabel = () => `${copy.motion}: ${reducedMotion ? copy.on : copy.off}`;
  const motionToggle = button(motionLabel, () => {
    reducedMotion = !reducedMotion;
    syncMotion();
    setWorldMotion(container, reducedMotion);
  });
  function syncMotion() {
    host.setAttribute("data-reduced-motion", String(reducedMotion));
    motionToggle.textContent = motionLabel();
    motionToggle.setAttribute("aria-pressed", String(reducedMotion));
  }
  translations.push(syncMotion);

  let mascotEnabled = container.getAttribute("data-world-mascot") !== "off";
  const mascotLabel = () => `Mascot: ${mascotEnabled ? copy.on : copy.off}`;
  const mascotToggle = button(mascotLabel, () => {
    mascotEnabled = !mascotEnabled;
    syncMascot();
    container.dispatchEvent(new CustomEvent("tqa:set-mascot", {
      bubbles: false,
      detail: { enabled: mascotEnabled },
    }));
  });
  function syncMascot() {
    mascotToggle.textContent = mascotLabel();
    mascotToggle.setAttribute("aria-pressed", String(mascotEnabled));
  }
  translations.push(syncMascot);

  const languages = document.createElement("fieldset");
  const legend = document.createElement("legend");
  translations.push(() => {
    legend.textContent = copy.language;
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
      removeJournal.setLocale(next);
      removeTeleport.setLocale(next);
    });
    translations.push(() => {
      choice.setAttribute("aria-pressed", String(language === next));
    });
    languages.append(choice);
  }
  languages.className = "world-menu-choices";
  destination.append(languages);

  const keys = document.createElement("details");
  destination = group(() => language === "vi" ? "Khác" : "Other");
  destination.className = "world-menu-footer";
  const summary = document.createElement("summary");
  translations.push(() => {
    summary.textContent = copy.keys;
  });
  keys.append(summary);
  for (const key of ["move", "camera", "zoom", "interact", "cruise", "journal", "escape"] as const) {
    const line = document.createElement("p");
    translations.push(() => {
      line.textContent = copy[key];
    });
    keys.append(line);
  }
  destination.append(keys);
  const quick = document.createElement("a");
  translations.push(() => {
    quick.href = `/${language}/quick/`;
    quick.textContent = copy.quick;
  });
  destination.append(quick);
  button(() => copy.leave, leaveWorld);
  button(() => `× ${copy.close}`, close);
  for (const translate of translations) translate();

  function open(source: HTMLElement) {
    if (document.querySelector("dialog[open]")) return;
    opener = source;
    syncQuality();
    syncSound();
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
    const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href], summary"));
    const tabbable = items.filter(item => item.tagName !== "INPUT" || (item as HTMLInputElement).checked);
    const next = trapFocus(tabbable, document.activeElement as HTMLElement | null, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  function onEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    // B2-043b: during the opening cinematic Escape belongs to the world (Skip), not the menu.
    if (container.dataset?.worldIntro === "playing") return;
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
    removeJournal();
    removeTeleport();
    removeContent();
    soundObserver?.disconnect();
    document.removeEventListener("keydown", onEscape, true);
    container.removeEventListener("tqa:world-state", syncQuality);
    trigger.removeEventListener("click", onMenu);
    host.remove();
  };
}
