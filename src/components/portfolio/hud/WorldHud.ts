import styles from "./WorldHud.module.css";

type Locale = "en" | "vi";
const zones = {
  "first-light": ["First Light", "About me", "Giới thiệu"],
  roots: ["Roots", "Skills", "Kỹ năng"],
  workshop: ["Workshop", "Selected projects", "Dự án tiêu biểu"],
  milestones: ["Milestones", "Certificates & learning", "Chứng chỉ & học tập"],
  "old-trail": ["Old Trail", "Journey", "Hành trình"],
  horizon: ["Horizon", "Future direction", "Định hướng"],
  "quiet-shore": ["Quiet Shore", "Hobbies & personality", "Sở thích"],
  "last-postcard": ["Last Postcard", "Contact & CV", "Liên hệ & CV"],
} as const;
const keys = {
  en: "WASD move · ←→ or drag to rotate · E interact · J journal · Esc menu",
  vi: "WASD đi · ←→ hoặc kéo để xoay · E tương tác · J sổ · Esc menu",
};

/** Mounted only after Enter World; all timers and visit history belong to this session. */
export function mountWorldHud(container: HTMLElement, language: string, menu: HTMLButtonElement) {
  let locale: Locale = language === "vi" ? "vi" : "en";
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-atlas-journal", "");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({
    "aria-hidden": "true", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
  })) icon.setAttribute(name, value);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 3h14v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 3v18M10 7h7M10 11h5M2 7h4M2 17h4");
  icon.append(path);
  const label = document.createElement("span");
  button.append(icon, label);
  menu.parentElement?.insertBefore(button, menu);

  const host = document.createElement("div");
  host.className = styles.notices!;
  function notice(className: string) {
    const node = document.createElement("div");
    node.className = className;
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    node.setAttribute("hidden", "");
    host.append(node);
    return node;
  }
  const hint = notice(styles.keys!);
  hint.setAttribute("data-hud-keys", "");
  const card = notice(styles.zone!);
  card.setAttribute("data-hud-zone", "");
  const title = document.createElement("p");
  const subtitle = document.createElement("p");
  card.append(title, subtitle);
  container.parentElement?.append(host);

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motionOverride: boolean | undefined;
  const reduced = () => motionOverride ?? media.matches;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(callback: () => void, delay: number) {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
    return timer;
  }
  function transient(node: HTMLElement, duration: number) {
    let hold: ReturnType<typeof setTimeout> | undefined;
    let fade: ReturnType<typeof setTimeout> | undefined;
    function hide() {
      for (const timer of [hold, fade]) {
        clearTimeout(timer);
        if (timer !== undefined) timers.delete(timer);
      }
      node.setAttribute("hidden", "");
      node.removeAttribute("data-fading");
    }
    return {
      hide,
      finishFade() { if (node.getAttribute("data-fading") !== null) hide(); },
      show(milliseconds: number) {
        hide();
        node.removeAttribute("hidden");
        hold = later(() => {
          if (reduced()) hide();
          else {
            node.setAttribute("data-fading", "");
            fade = later(hide, duration);
          }
        }, milliseconds);
      },
    };
  }
  const hintLife = transient(hint, 600);
  const cardLife = transient(card, 400);
  let started = false;
  let activeZone: keyof typeof zones | undefined;
  const visits = new Map<keyof typeof zones, number>();
  const inWorld = () => container.closest("[data-app-mode]")?.getAttribute("data-app-mode") === "world";

  function setLocale(next: Locale) {
    locale = next;
    label.textContent = locale === "vi" ? "Sổ Atlas" : "Atlas Journal";
    button.title = label.textContent;
    // The onboarding live region announces once; translation never restarts its timer.
    if (started) {
      hint.setAttribute("aria-live", "off");
      hint.textContent = keys[locale];
    }
    if (activeZone) {
      title.textContent = zones[activeZone][0];
      subtitle.textContent = zones[activeZone][locale === "vi" ? 2 : 1];
    }
  }
  function introDone() {
    if (started || !inWorld() || container.getAttribute("data-world-intro") !== "done") return;
    started = true;
    hintLife.show(10_000);
    hint.textContent = keys[locale];
  }
  function enterZone(event: Event) {
    const id: unknown = (event as CustomEvent).detail?.zoneId;
    if (!inWorld() || typeof id !== "string" || !Object.hasOwn(zones, id)) return;
    const zoneId = id as keyof typeof zones;
    const now = performance.now();
    const last = visits.get(zoneId);
    if (last !== undefined && now - last < 20_000) return;
    visits.set(zoneId, now);
    activeZone = zoneId;
    cardLife.show(3_000);
    title.textContent = zones[zoneId][0];
    subtitle.textContent = zones[zoneId][locale === "vi" ? 2 : 1];
  }
  function toggleJournal() {
    if (inWorld()) container.dispatchEvent(new CustomEvent("tqa:toggle-journal"));
  }
  function syncMotion() {
    host.setAttribute("data-reduced-motion", String(reduced()));
    if (reduced()) { hintLife.finishFade(); cardLife.finishFade(); }
  }
  function setMotion(event: Event) {
    const value: unknown = (event as CustomEvent).detail?.reduced;
    if (typeof value !== "boolean") return;
    motionOverride = value;
    syncMotion();
  }
  // The event handles current world code; observing the attribute also honors the HUD contract alone.
  const observer = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(introDone);
  observer?.observe(container, { attributes: true, attributeFilter: ["data-world-intro"] });
  container.addEventListener("tqa:intro", introDone);
  container.addEventListener("tqa:zone-enter", enterZone);
  container.addEventListener("tqa:set-motion", setMotion);
  media.addEventListener?.("change", syncMotion);
  button.addEventListener("click", toggleJournal);
  setLocale(locale);
  syncMotion();
  introDone();
  return Object.assign(() => {
    observer?.disconnect();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    container.removeEventListener("tqa:intro", introDone);
    container.removeEventListener("tqa:zone-enter", enterZone);
    container.removeEventListener("tqa:set-motion", setMotion);
    media.removeEventListener?.("change", syncMotion);
    button.removeEventListener("click", toggleJournal);
    button.remove();
    host.remove();
  }, { setLocale });
}
