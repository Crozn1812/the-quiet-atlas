"use client";

import { useEffect, useRef, useState } from "react";
import { readCapabilities, worldEligibility } from "./capabilities";

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

export function WorldEntry({ locale, copy }: { locale: string; copy: WorldCopy }) {
  const [eligibility, setEligibility] = useState<ReturnType<typeof worldEligibility>>();
  const [appMode, setAppMode] = useState<"welcome" | "loading" | "world" | "recoverableError">("welcome");
  const [retried, setRetried] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const teardown = useRef<(() => void) | undefined>(undefined);
  const generation = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (appMode === "recoverableError") enter.current?.focus();
  }, [appMode]);

  useEffect(() => {
    const lifecycle = generation;
    const webgl2 = readCapabilities().webgl2;
    function update() {
      setEligibility(worldEligibility({
        webgl2,
        finePointer: window.matchMedia("(pointer: fine)").matches,
        width: window.innerWidth,
      }));
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
    setAppMode("welcome");
    enter.current?.focus();
  }

  async function onEnterWorld() {
    if (busy.current || teardown.current || (appMode === "recoverableError" && retried)) return;
    if (appMode === "recoverableError") setRetried(true);
    busy.current = true;
    const current = ++generation.current;
    setAppMode("loading");
    try {
      if (worldEligibility(readCapabilities()) !== "eligible") throw new Error("World unavailable");
      const { mountWorld } = await import("@/features/world");
      if (current !== generation.current || !container.current) return;
      const unmount = await mountWorld(container.current, { collision: "rapier" });
      if (current !== generation.current) {
        unmount();
        return;
      }
      teardown.current = unmount;
      setAppMode("world");
      container.current.focus();
      const { mountWorldMenu } = await import("./WorldMenu");
      if (current !== generation.current || !container.current) return;
      const removeMenu = mountWorldMenu(container.current, locale);
      teardown.current = () => {
        removeMenu();
        unmount();
      };
    } catch {
      if (current === generation.current) {
        teardown.current?.();
        teardown.current = undefined;
        setAppMode("recoverableError");
        enter.current?.focus();
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
        <a href={`/${locale}/quick/`}>Quick Portfolio</a>
        <button disabled aria-describedby="sound-reason">Sound</button>
      </nav>
      <p id="world-reason" aria-live="polite">
        {!eligibility ? copy.unavailable : appMode === "loading" ? copy.loading : appMode === "recoverableError" ? copy.error : fallback ? copy[eligibility] : ""}
      </p>
      <p id="sound-reason">{copy.soundReason}</p>
      {appMode === "recoverableError" && !retried && <button onClick={onEnterWorld}>{copy.retry}</button>}
      {appMode === "world" && <button onClick={leaveWorld}>{copy.leave}</button>}
      <div
        ref={container}
        tabIndex={-1}
        role="region"
        aria-label={copy.scene}
        hidden={appMode !== "loading" && appMode !== "world"}
        style={{ height: "60vh", minHeight: "20rem" }}
      />
    </div>
  );
}
