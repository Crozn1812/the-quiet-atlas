"use client";

/* Static CV navigation avoids prefetching the client router. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createCapabilityReader, worldEligibility } from "./capabilities";
import { listenWorldError } from "./worldError";

export type WorldCopy = {
  unavailable: string;
  editorial: string;
  webgl2: string;
  pointer: string;
  width: string;
  loading: string;
  error: string;
  retry: string;
  leave: string;
  scene: string;
  soundReason: string;
};

export function WorldEntry({ locale: initialLocale, copy: initialCopy, email, children, backdrop }: {
  locale: string;
  copy: WorldCopy;
  email: string;
  children: ReactNode;
  backdrop: ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [copy, setCopy] = useState(initialCopy);
  const currentLocale = useRef(initialLocale);
  const [announcement, setAnnouncement] = useState("");
  const hud = {
    sound: locale === "vi" ? "Âm thanh" : "Sound",
    actions: locale === "vi" ? "Thao tác world" : "World actions",
  };
  const [eligibility, setEligibility] = useState<ReturnType<typeof worldEligibility>>();
  const [appMode, setAppMode] = useState<"welcome" | "loading" | "world" | "recoverableError">("welcome");
  const [retried, setRetried] = useState(false);
  // Bumped on every failure: a synchronous failure batches "loading" → "recoverableError", so appMode alone may not change.
  const [failures, setFailures] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const teardown = useRef<(() => void) | undefined>(undefined);
  const generation = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    return listenWorldError(target, {
      generation,
      teardown,
      recover: () => setAppMode("recoverableError"),
    });
  }, []);

  useEffect(() => {
    // Restore focus after React reveals the button on exit or recovery.
    if (appMode === "recoverableError" || appMode === "welcome") enter.current?.focus();
  }, [appMode, failures]);

  useEffect(() => {
    const lifecycle = generation;
    const read = createCapabilityReader();
    function update() {
      setEligibility(worldEligibility(read()));
    }
    update();
    const pointer = window.matchMedia("(pointer: fine)");
    window.addEventListener("resize", update);
    pointer.addEventListener("change", update);
    return () => {
      lifecycle.current++;
      teardown.current?.();
      window.removeEventListener("resize", update);
      pointer.removeEventListener("change", update);
    };
  }, []);

  function leaveWorld() {
    generation.current++;
    teardown.current?.();
    teardown.current = undefined;
    if (currentLocale.current !== initialLocale) {
      // End the session and render the server Welcome in the selected locale (Q21).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.assign(`/${currentLocale.current}/`);
      return;
    }
    setAppMode("welcome");
  }

  async function onEnterWorld() {
    if (busy.current || teardown.current || (appMode === "recoverableError" && retried)) return;
    if (appMode === "recoverableError") setRetried(true);
    busy.current = true;
    const current = ++generation.current;
    setAppMode("loading");
    try {
      if (worldEligibility(createCapabilityReader()()) !== "eligible") throw new Error();
      const { mountWorld } = await import("@/features/world");
      if (current !== generation.current || !container.current) return;
      const unmount = await mountWorld(container.current, {
        collision: "rapier",
        locale: currentLocale.current === "vi" ? "vi" : "en",
      });
      if (current !== generation.current) {
        unmount();
        return;
      }
      teardown.current = unmount;
      setAppMode("world");
      container.current.focus();
      const { mountWorldMenu } = await import("./WorldMenu");
      if (current !== generation.current || !container.current) return;
      const removeMenu = mountWorldMenu(container.current, locale, menu.current!, leaveWorld, (next, nextCopy) => {
        currentLocale.current = next;
        setLocale(next);
        setCopy(nextCopy);
        setAnnouncement(next === "vi" ? "Ngôn ngữ: Tiếng Việt" : "Language: English");
      });
      teardown.current = () => {
        removeMenu();
        unmount();
      };
    } catch {
      if (current === generation.current) {
        teardown.current?.();
        teardown.current = undefined;
        setAppMode("recoverableError");
        setFailures(count => count + 1);
      }
    } finally {
      busy.current = false;
    }
  }

  const fallback = eligibility && eligibility !== "eligible" && appMode === "welcome";
  return (
    <div
      className="world-entry"
      data-app-mode={fallback ? "editorial" : appMode}
    >
      <span
        className="visually-hidden"
        aria-live="polite"
      >
        {announcement}
      </span>
      {backdrop}
      <div
        ref={container}
        tabIndex={-1}
        role="region"
        aria-label={copy.scene}
        hidden={appMode !== "loading" && appMode !== "world"}
        className="world-viewport"
      />

      <div className="corner-panel">
        <div
          id="content"
          tabIndex={-1}
          className="welcome-card"
          hidden={appMode === "world"}
        >
          {children}
          <nav aria-label="World">
            <button
              ref={enter}
              hidden={Boolean(fallback)}
              disabled={!eligibility || appMode === "loading"}
              aria-disabled={appMode === "recoverableError" && retried}
              aria-describedby="world-reason"
              onClick={onEnterWorld}
            >
              Enter World
            </button>
            {fallback && <a href={`/${locale}/quick/`}>{copy.editorial}</a>}
          </nav>
          <p id="world-reason" aria-live="polite">
            {!eligibility ? copy.unavailable : appMode === "loading" ? copy.loading : appMode === "recoverableError" ? copy.error : fallback ? copy[eligibility] : ""}
          </p>
          {appMode === "recoverableError" && !retried && <button onClick={onEnterWorld}>{copy.retry}</button>}
        </div>
        <nav
          className="world-hud"
          aria-label={hud.actions}
          data-compact={appMode === "world"}
        >
          <span
            id="sound-reason"
            className="visually-hidden"
          >
            {copy.soundReason}
          </span>
          <a href={`/${locale}/quick/`}>
            <HudIcon kind="quick" />
            <span>Quick Portfolio</span>
          </a>
          <a href="/cv/">
            <HudIcon kind="cv" />
            <span>CV</span>
          </a>
          <a href={`mailto:${email}`}>
            <HudIcon kind="email" />
            <span>{appMode === "world" ? "Email" : email}</span>
          </a>
          <button
            disabled
            aria-describedby="sound-reason"
          >
            <HudIcon kind="sound" />
            <span>{hud.sound}</span>
          </button>
          <button
            ref={menu}
            hidden={appMode !== "world"}
            aria-haspopup="dialog"
          >
            <HudIcon kind="menu" />
            <span>Menu</span>
          </button>
          <button
            hidden={appMode !== "world"}
            onClick={leaveWorld}
          >
            <HudIcon kind="exit" />
            <span>{copy.leave}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function HudIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    quick: "M3 3h7v18H3zM14 3h7v18h-7z",
    cv: "M5 2h10l4 4v16H5zM8 10h8M8 14h8M8 18h5",
    email: "M2 4h20v16H2zM2 4l10 9L22 4",
    sound: "M3 9h4l5-5v16l-5-5H3zM16 8l5 8M21 8l-5 8",
    menu: "M3 6h18M3 12h18M3 18h18",
    exit: "M10 3H3v18h7M8 12h13M16 7l5 5-5 5",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
