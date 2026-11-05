"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { JournalEntry } from "@/features/journal/model";
import styles from "./atlas-journal.module.css";

export interface AtlasJournalProps {
  entries: readonly JournalEntry[];
  blankPages: number;
  title: string;
  locale: "en" | "vi";
  onOpenZone: (zoneId: JournalEntry["zoneId"]) => void;
  onClose: () => void;
}

/** Mount only through a dynamic import in the world loaded after Enter World. */
export function AtlasJournal({ entries, blankPages, title, locale, onOpenZone, onClose }: AtlasJournalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const visited = locale === "vi" ? "đã ghé" : "visited";

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    timerRef.current = setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement;
    dialog.showModal();
    titleRef.current?.focus();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const editing = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
      if ([event.target, document.activeElement].some(target => target instanceof HTMLElement && target.closest(editing))) return;
      if (event.key === "Escape" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current!.querySelectorAll<HTMLButtonElement>("button"));
        const active = document.activeElement;
        const next = event.shiftKey
          ? (active === buttons[0] || !buttons.includes(active as HTMLButtonElement) ? buttons.at(-1) : undefined)
          : (active === buttons.at(-1) || !buttons.includes(active as HTMLButtonElement) ? buttons[0] : undefined);
        if (next) {
          event.preventDefault();
          next.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  return (
    <dialog ref={dialogRef} className={styles.journal} role="dialog" aria-modal="true"
      aria-labelledby={titleId} lang={locale} data-closing={closing}
      onCancel={event => { event.preventDefault(); close(); }}>
      <header className={styles.header}>
        <h2 ref={titleRef} id={titleId} tabIndex={-1} className={styles.title}>{title}</h2>
        <button type="button" className={styles.close} onClick={close}>
          {locale === "vi" ? "Đóng" : "Close"}
        </button>
      </header>
      <ol className={styles.entries}>
        {entries.map(entry => (
          <li key={entry.zoneId}>
            <button type="button" className={styles.entry}
              aria-label={entry.stamped ? `${entry.title}, ${visited}` : entry.title}
              onClick={() => { if (!closingRef.current) onOpenZone(entry.zoneId); }}>
              <span>{entry.title}</span>
              {entry.stamped && (
                <svg className={styles.stamp} viewBox="0 0 40 40" width="32" height="32"
                  aria-hidden="true" focusable="false" fill="none" stroke="#B5432F" strokeLinecap="round">
                  <path strokeWidth="1.7" d="M20 4C29 3 36 11 35 21C36 30 28 36 19 35C9 36 3 28 4 19C3 11 11 3 20 4Z" />
                  <path strokeWidth=".8" d="M10 10C17 5 27 7 31 15M32 22C30 31 20 34 12 29M8 25C5 21 7 15 8 14" />
                  <path strokeWidth="1.2" d="m13 21 5 5 10-12" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ol>
      {Array.from({ length: blankPages }, (_, index) => (
        <div key={index} className={styles.blankPage} aria-hidden="true" />
      ))}
    </dialog>
  );
}

export default AtlasJournal;
