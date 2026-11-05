"use client";

import { useEffect, useId, useRef } from "react";
import { initialJournal, journalEntries } from "@/features/journal/model";
import type { ZoneId } from "@/features/interaction/targets";
import { trapFocus } from "../worldMenuControls";
import styles from "./teleport.module.css";

const zones = journalEntries(initialJournal(), "en");

export interface TeleportChooserProps {
  from: ZoneId;
  locale: "en" | "vi";
  container: HTMLElement;
  onChoose: (to: ZoneId) => void;
  onClose: () => void;
}

/** Loaded only when a world signpost requests a destination. */
export function TeleportChooser({ from, locale, container, onChoose, onClose }: TeleportChooserProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    const next = zones[(zones.findIndex(zone => zone.zoneId === from) + 1) % zones.length]!;
    dialog.querySelector<HTMLButtonElement>(`[data-zone="${next.zoneId}"]`)?.focus();
    return () => {
      dialog.close();
      if (container.isConnected) (container.querySelector<HTMLCanvasElement>("canvas") ?? container).focus();
    };
  }, [container, from]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const next = trapFocus(buttons, document.activeElement as HTMLButtonElement | null, event.shiftKey);
        if (next) {
          event.preventDefault();
          next.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className={styles.chooser} role="dialog" aria-modal="true"
      aria-labelledby={titleId} lang={locale}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>{locale === "vi" ? "Đi tới…" : "Travel to…"}</h2>
        <button type="button" className={styles.close} onClick={onClose}>{locale === "vi" ? "Đóng" : "Close"}</button>
      </header>
      <ol className={styles.zones}>
        {zones.map(zone => (
          <li key={zone.zoneId}>
            <button type="button" className={styles.zone} data-zone={zone.zoneId}
              disabled={zone.zoneId === from} onClick={() => onChoose(zone.zoneId)}>
              {zone.title}{zone.zoneId === from && (locale === "vi" ? " (đang ở đây)" : " (you are here)")}
            </button>
          </li>
        ))}
      </ol>
    </dialog>
  );
}

export default TeleportChooser;
