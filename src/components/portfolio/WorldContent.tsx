import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { WorldContentData } from "./worldContentData";
import { OverlayProject, ZoneContent } from "./ZoneContent";

const cache = new Map<string, Promise<WorldContentData>>();

export function loadWorldContent(locale: string) {
  let pending = cache.get(locale);
  if (!pending) {
    pending = fetch("/" + locale + "/world-content.json").then(response => {
      if (!response.ok) {
        throw new Error("Content request failed");
      }
      return response.json() as Promise<WorldContentData>;
    });
    cache.set(locale, pending);
    void pending.catch(() => cache.delete(locale));
  }
  return pending;
}
import { pauseWorld, trapFocus } from "./worldMenuControls";

export const zoneNames = {
  "first-light": "The First Light",
  roots: "The Roots",
  workshop: "The Workshop",
  milestones: "The Milestones",
  "old-trail": "The Old Trail",
  horizon: "The Horizon",
  "quiet-shore": "The Quiet Shore",
  "last-postcard": "The Last Postcard",
};

export function closeContent(target: EventTarget, zoneId: string) {
  pauseWorld(target, false);
  target.dispatchEvent(new CustomEvent("tqa:content-closed", { detail: { zoneId } }));
}

export function mountWorldContent(container: HTMLElement, language: string) {
  let locale: "en" | "vi" = language === "vi" ? "vi" : "en";
  const dialog = document.createElement("dialog");
  dialog.className = "world-content";
  dialog.setAttribute("aria-labelledby", "world-content-title");
  const host = document.createElement("div");
  dialog.append(host);
  container.parentElement?.append(dialog);
  const root = createRoot(host);
  let request = 0;
  let selectedSlug: string | undefined;
  let data: WorldContentData | undefined;
  let failed = false;
  let disposed = false;
  let zoneId: keyof typeof zoneNames | undefined;

  function close() {
    if (!zoneId) return;
    const closed = zoneId;
    zoneId = undefined;
    dialog.close();
    closeContent(container, closed);
    container.focus();
  }

  function render(slug?: string) {
    if (!zoneId) return;
    selectedSlug = slug;
    const project = data?.projects.find(p => p.slug === slug);
    const href = project ? `/${locale}/projects/${project.slug}/` : undefined;
    flushSync(() => root.render(
      <>
        <button
          type="button"
          onClick={close}
        >
          × {locale === "vi" ? "Đóng" : "Close"}
        </button>
        <h2
          id="world-content-title"
          tabIndex={-1}
        >
          {zoneNames[zoneId!]}
        </h2>
        {project ? (
          <>
            <button
              type="button"
              onClick={() => render()}
            >
              {locale === "vi" ? "Danh sách dự án" : "All projects"}
            </button>
            <button
              type="button"
              onClick={async (event) => {
                const button = event.currentTarget;
                try {
                  await navigator.clipboard.writeText(new URL(href!, location.origin).href);
                  button.textContent = locale === "vi" ? "Đã chép" : "Copied";
                } catch {
                  button.textContent = locale === "vi" ? "Không thể chép liên kết" : "Could not copy link";
                }
              }}
            >
              {locale === "vi" ? "Chép liên kết dự án" : "Copy project link"}
            </button>
            <a
              href={href}
              target="_blank"
              rel="noopener"
            >
              {locale === "vi" ? "Đọc bản đầy đủ" : "Read full version"}
            </a>
            <OverlayProject
              project={project}
              locale={locale}
            />
          </>
        ) : data ? (
          <ZoneContent
            locale={locale}
            zoneId={zoneId!}
            data={data}
          />
        ) : (
          <>
            <p>{failed ? (locale === "vi" ? "Không thể tải nội dung." : "Could not load content.") : (locale === "vi" ? "Đang tải…" : "Loading…")}</p>
            <a
              href={"/" + locale + "/quick/"}
            >
              Quick Portfolio
            </a>
          </>
        )}
      </>
    ));
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>("#world-content-title")?.focus();
  }

  function open(event: Event) {
    const requested: unknown = (event as CustomEvent).detail?.zoneId;
    if (typeof requested !== "string" || !Object.hasOwn(zoneNames, requested)) return;
    if (zoneId || document.querySelector("dialog[open]")) return;
    zoneId = requested as keyof typeof zoneNames;
    pauseWorld(container, true);
    dialog.showModal();
    render();
    if (!data) refresh();
  }

  function refresh() {
    const current = ++request;
    void loadWorldContent(locale).then(result => {
      if (disposed || current !== request) return;
      data = result;
      failed = false;
      render(selectedSlug);
    }).catch(() => {
      if (disposed || current !== request) return;
      failed = true;
      render(selectedSlug);
    });
  }

  function setLocale(next: "en" | "vi") {
    if (next === locale) return;
    locale = next;
    data = undefined;
    failed = false;
    render(selectedSlug);
    refresh();
  }

  function onKey(event: KeyboardEvent) {
    if (!zoneId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === "Tab") {
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"));
      const next = trapFocus(items, document.activeElement as HTMLElement | null, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      next.focus();
    }
  }

  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", event => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || anchor.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const project = data?.projects.find(p => anchor.getAttribute("href") === `/${locale}/projects/${p.slug}/`);
    if (!project) return;
    event.preventDefault();
    render(project.slug);
  });
  document.addEventListener("keydown", onKey, true);
  container.addEventListener("tqa:open-content", open);
  return Object.assign(() => {
    disposed = true;
    close();
    container.removeEventListener("tqa:open-content", open);
    document.removeEventListener("keydown", onKey, true);
    root.unmount();
    dialog.remove();
  }, { setLocale });
}
