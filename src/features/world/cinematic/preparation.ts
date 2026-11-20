import type { WebGLRenderer } from "three";

export const INTRO_PREPARE_LIMIT_MS = 8_000;
const loads = new WeakMap<WebGLRenderer, { pending: number; changed: number }>();

/** Only High's cinematic preparation opts into upgrades before control handoff. */
export function introAssetsAllowed(viewport: HTMLElement | null): boolean {
  return viewport?.dataset?.worldIntroAssets === "true";
}

/** Renderer ownership isolates concurrent worlds; failures retain existing fallback assets. */
export function trackIntroAsset<T>(renderer: WebGLRenderer, ready: Promise<T>): void {
  let load = loads.get(renderer);
  if (!load) { load = { pending: 0, changed: performance.now() }; loads.set(renderer, load); }
  const current = load;
  current.pending++;
  current.changed = performance.now();
  const settle = () => { current.pending--; current.changed = performance.now(); };
  void ready.then(settle, settle);
}

export function introAssetsReady(renderer: WebGLRenderer, now: number): boolean {
  const load = loads.get(renderer);
  return !load || (load.pending === 0 && now - load.changed >= 250);
}

/** No timer ownership: RAF drives the deadline, and Skip/unmount need no cancellation. */
export function createIntroPreparation(start: number) {
  let quietSince: number | undefined;
  return {
    ready(now: number, dressingReady: boolean, assetsReady: boolean): boolean {
      if (now - start >= INTRO_PREPARE_LIMIT_MS) return true;
      if (!dressingReady || !assetsReady) { quietSince = undefined; return false; }
      quietSince ??= now;
      return now - quietSince >= 250;
    },
  };
}
