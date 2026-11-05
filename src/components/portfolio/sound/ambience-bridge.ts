import { createAmbience, type Ambience } from "@/features/audio/ambience";
import type { AmbienceMix } from "@/features/audio/mix";

export type AmbienceBridge = ReturnType<typeof createAmbienceBridge>;

function isMix(value: unknown): value is AmbienceMix {
  return typeof value === "object" && value !== null &&
    ["stream", "wind", "birds", "sea"].every(key => {
      const level = (value as Record<string, unknown>)[key];
      return typeof level === "number" && Number.isFinite(level) && level >= 0 && level <= 1;
    });
}

/**
 * The B2-080 position controller accepts AmbienceInputs, not the shell's mix.
 * Reuse its synthesizer directly so the four event levels reach it unchanged.
 * Construction/import is silent; only enable owns an AudioContext.
 */
export function createAmbienceBridge() {
  let target: EventTarget | null = null;
  let active: { context: AudioContext; ambience: Ambience } | undefined;
  let pending: Promise<boolean> | undefined;
  let latest: AmbienceMix | undefined;
  let disposed = false;

  function release(session: NonNullable<typeof active>) {
    session.ambience.dispose();
    if (session.context.state !== "closed") void session.context.close().catch(() => undefined);
  }

  function update(mix: AmbienceMix) {
    if (!target || !active || disposed) return;
    latest = { ...mix };
    if (!pending && active.context.state === "running") active.ambience.setMix(latest);
  }

  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (isMix(detail)) controller.update(detail);
  };

  const controller = {
    connect(next: EventTarget | null) {
      if (disposed || next === target) return;
      target?.removeEventListener("tqa:ambience", listener);
      target = next;
      latest = undefined;
      active?.ambience.mute();
      target?.addEventListener("tqa:ambience", listener);
    },
    enable(): Promise<boolean> {
      if (disposed || typeof AudioContext === "undefined") return Promise.resolve(false);
      if (pending) return pending;
      if (active?.context.state === "running") return Promise.resolve(true);
      let session: NonNullable<typeof active>;
      let resumed: Promise<void>;
      try {
        if (active) session = active;
        else {
          const context = new AudioContext();
          session = { context, ambience: createAmbience(context) };
        }
        active = session;
        // Construct and resume synchronously when called by the Sound handler.
        resumed = session.context.resume();
      } catch {
        controller.disable();
        return Promise.resolve(false);
      }
      const enabling = resumed.then(() => {
        if (active !== session) return false;
        if (session.context.state !== "running") {
          controller.disable();
          return false;
        }
        if (latest) session.ambience.setMix(latest);
        return true;
      }).catch(() => {
        if (active === session) controller.disable();
        return false;
      }).finally(() => {
        if (pending === enabling) pending = undefined;
      });
      pending = enabling;
      return enabling;
    },
    disable() {
      const session = active;
      active = undefined;
      pending = undefined;
      latest = undefined;
      if (session) release(session);
    },
    update,
    dispose() {
      controller.connect(null);
      controller.disable();
      disposed = true;
    },
  };
  return controller;
}
