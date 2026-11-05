"use client";

import { lazy, Suspense, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { blankPages, initialJournal, journalEntries, journalReducer, journalTitle, type SecretId } from "@/features/journal/model";
import { pauseWorld } from "../worldMenuControls";

const AtlasJournal = lazy(() => import("./AtlasJournal"));
const toggleEvent = "tqa:toggle-journal";
const modalSelector = "dialog[open], [role='dialog'][aria-modal='true']:not(dialog)";
const editingSelector = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

function isEditing(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(editingSelector));
}

function WorldJournal({ container, locale }: { container: HTMLElement; locale: "en" | "vi" }) {
  const [journal, dispatch] = useReducer(journalReducer, undefined, initialJournal);
  const current = useRef(journal);

  useLayoutEffect(() => {
    current.current = journal;
  }, [journal]);

  useLayoutEffect(() => {
    if (!journal.open) return;
    pauseWorld(container, true, "journal");
    return () => pauseWorld(container, false, "journal");
  }, [container, journal.open]);

  useEffect(() => {
    function toggle() {
      if (container.closest("[data-app-mode]")?.getAttribute("data-app-mode") !== "world") return;
      // Lead: the opening cinematic keeps the keyboard; the journal opens after Skip/end (B2-043b).
      if (container.dataset?.worldIntro === "playing" || container.dataset?.worldEnding === "playing") return;
      if (!current.current.open && document.querySelector(modalSelector)) return;
      dispatch({ type: "toggle" });
    }

    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditing(event.target) || isEditing(document.activeElement)) return;
      // The mounted dialog owns its animated close and focus restoration. While
      // its chunk is loading, the shell still allows J/Escape to cancel opening.
      if (document.querySelector(modalSelector)) return;
      if (event.key.toLowerCase() !== "j" && !(current.current.open && event.key === "Escape")) return;
      if (container.closest("[data-app-mode]")?.getAttribute("data-app-mode") !== "world") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle();
    }

    function visit(event: Event) {
      const zoneId: unknown = (event as CustomEvent).detail?.zoneId;
      const entry = journalEntries(current.current, "en").find(row => row.zoneId === zoneId);
      if (!entry) return;
      dispatch({ type: "visit", zoneId: entry.zoneId });
    }

    function findSecret(event: Event) {
      const id: unknown = (event as CustomEvent).detail?.id;
      if (typeof id !== "string" || !["reflection", "forgotten-sound", "unmarked-road", "unwritten-page"].includes(id)) return;
      dispatch({ type: "findSecret", id: id as SecretId });
    }

    container.addEventListener(toggleEvent, toggle);
    container.addEventListener("tqa:secret-found", findSecret);
    container.addEventListener("tqa:open-content", visit);
    document.addEventListener("keydown", onKey, true);
    return () => {
      container.removeEventListener(toggleEvent, toggle);
      container.removeEventListener("tqa:secret-found", findSecret);
      container.removeEventListener("tqa:open-content", visit);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [container]);

  return journal.open ? (
    <Suspense fallback={null}>
      <AtlasJournal
        entries={journalEntries(journal, locale)}
        blankPages={blankPages(journal)}
        title={journalTitle(locale)}
        locale={locale}
        onClose={() => dispatch({ type: "close" })}
        onOpenZone={zoneId => {
          flushSync(() => dispatch({ type: "close" }));
          container.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId } }));
        }}
      />
    </Suspense>
  ) : null;
}

/** Called only by the menu module loaded after Enter World. Each mount is a fresh session. */
export function mountWorldJournal(container: HTMLElement, language: string) {
  const host = document.createElement("div");
  container.parentElement?.append(host);
  const root = createRoot(host);
  function setLocale(locale: "en" | "vi") {
    flushSync(() => root.render(<WorldJournal container={container} locale={locale} />));
  }
  setLocale(language === "vi" ? "vi" : "en");
  return Object.assign(() => {
    root.unmount();
    host.remove();
  }, {
    setLocale,
    toggle: () => container.dispatchEvent(new CustomEvent(toggleEvent)),
  });
}
