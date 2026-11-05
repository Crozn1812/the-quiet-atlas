"use client";

import { lazy, Suspense, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ZONE_IDS, type ZoneId } from "@/features/interaction/targets";
import { TELEPORT_CANCEL_EVENT, TELEPORT_CHOOSE_EVENT, TELEPORT_TO_EVENT, type TeleportToDetail } from "@/features/navigation/events";
import { pauseWorld } from "../worldMenuControls";
import styles from "./teleport.module.css";

const TeleportChooser = lazy(() => import("./TeleportChooser"));
const modalSelector = "dialog[open], [role='dialog'][aria-modal='true']:not(dialog)";

/** Reserve the modal while its chunk loads, so other overlays cannot open above it. */
function PendingDialog({ locale, onClose }: { locale: "en" | "vi"; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={dialogRef} className={styles.chooser} role="dialog" aria-modal="true"
      aria-label={locale === "vi" ? "Đi tới…" : "Travel to…"} lang={locale} aria-busy="true"
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <button type="button" className={styles.close} onClick={onClose}>{locale === "vi" ? "Đóng" : "Close"}</button>
    </dialog>
  );
}

function WorldTeleport(props: {
  container: HTMLElement;
  locale: "en" | "vi";
  from: ZoneId;
  onChoose: (to: ZoneId) => void;
  onClose: () => void;
}) {
  return (
    <Suspense fallback={<PendingDialog locale={props.locale} onClose={props.onClose} />}>
      <TeleportChooser {...props} />
    </Suspense>
  );
}

/** Mounted by WorldMenu after Enter World; no session state survives disposal. */
export function mountWorldTeleport(container: HTMLElement, language: string) {
  const host = document.createElement("div");
  container.parentElement?.append(host);
  const root = createRoot(host);
  let locale: "en" | "vi" = language === "vi" ? "vi" : "en";
  let from: ZoneId | null = null;

  function finish(to?: ZoneId) {
    if (from === null || to === from) return;
    from = null;
    flushSync(() => root.render(null));
    pauseWorld(container, false, "overlay");
    if (container.isConnected) (container.querySelector<HTMLCanvasElement>("canvas") ?? container).focus();
    container.dispatchEvent(to === undefined
      ? new CustomEvent(TELEPORT_CANCEL_EVENT)
      : new CustomEvent<TeleportToDetail>(TELEPORT_TO_EVENT, { detail: { to } }));
  }

  function render() {
    if (from === null) return;
    flushSync(() => root.render(
      <WorldTeleport container={container} locale={locale} from={from!}
        onClose={() => finish()} onChoose={to => finish(to)} />,
    ));
  }

  function choose(event: Event) {
    const requested: unknown = (event as CustomEvent).detail?.from;
    if (!ZONE_IDS.some(zone => zone === requested)) return;
    if (from !== null || document.querySelector(modalSelector)) return;
    if (container.closest("[data-app-mode]")?.getAttribute("data-app-mode") !== "world") return;
    if (container.dataset?.worldIntro === "playing") return;
    from = requested as ZoneId;
    pauseWorld(container, true, "overlay");
    render();
  }

  function onKey(event: KeyboardEvent) {
    if (from === null || event.defaultPrevented || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      finish();
    } else if (event.key === "Tab" && !host.querySelector("ol")) {
      // The loading dialog has a single focusable control.
      event.preventDefault();
      host.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }

  container.addEventListener(TELEPORT_CHOOSE_EVENT, choose);
  document.addEventListener("keydown", onKey, true);
  return Object.assign(() => {
    container.removeEventListener(TELEPORT_CHOOSE_EVENT, choose);
    document.removeEventListener("keydown", onKey, true);
    finish();
    root.unmount();
    host.remove();
  }, {
    setLocale(next: "en" | "vi") {
      locale = next;
      render();
    },
  });
}
