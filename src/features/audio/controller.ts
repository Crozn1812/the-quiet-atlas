import { createAmbience, type Ambience } from "./ambience";
import { ambienceMixAt, type AmbienceInputs } from "./mix";

export interface AudioController {
  /** Call directly from an explicit Sound click/key handler; false means unavailable. */
  enable(): Promise<boolean>;
  /** Silences immediately, releases nodes, and closes the owned context. */
  disable(): Promise<void>;
  /** Retains the latest inputs in memory, applies at most once per 250 ms. */
  update(inputs: AmbienceInputs): void;
}

/** Sound is off until enable. Importing / constructing this controller is SSR-safe. */
export function createAudioController(): AudioController {
  let active: { context: AudioContext; ambience: Ambience } | undefined;
  let enabling: Promise<boolean> | undefined;
  let latest: AmbienceInputs | undefined;
  let lastUpdate = -Infinity;

  async function release(session: NonNullable<typeof active>) {
    session.ambience.dispose();
    if (session.context.state !== "closed") await session.context.close();
  }

  function update(inputs: AmbienceInputs) {
    latest = { ...inputs };
    if (!active || enabling || active.context.state !== "running") return;
    const now = active.context.currentTime;
    if (now - lastUpdate < 0.25) return;
    active.ambience.setMix(ambienceMixAt(latest));
    lastUpdate = now;
  }

  return {
    enable() {
      if (enabling) return enabling;
      if (active?.context.state === "running") return Promise.resolve(true);
      if (typeof AudioContext === "undefined") return Promise.resolve(false);
      let session: NonNullable<typeof active>;
      let resumed: Promise<void>;
      try {
        if (active) {
          session = active;
        } else {
          const context = new AudioContext();
          session = { context, ambience: createAmbience(context) };
          active = session;
        }
        // Both construction and resume occur synchronously in the gesture call stack.
        resumed = session.context.resume();
      } catch {
        const failed = active;
        active = undefined;
        if (failed) void release(failed).catch(() => undefined);
        return Promise.resolve(false);
      }
      const pending = resumed.then(async () => {
        if (active !== session) return false;
        if (session.context.state !== "running") {
          active = undefined;
          await release(session);
          return false;
        }
        if (latest) session.ambience.setMix(ambienceMixAt(latest));
        lastUpdate = session.context.currentTime;
        return true;
      }).catch(async () => {
        if (active === session) {
          active = undefined;
          await release(session).catch(() => undefined);
        }
        return false;
      }).finally(() => {
        if (enabling === pending) enabling = undefined;
      });
      enabling = pending;
      return pending;
    },
    async disable() {
      const session = active;
      active = undefined;
      enabling = undefined;
      lastUpdate = -Infinity;
      if (session) await release(session);
    },
    update,
  };
}
