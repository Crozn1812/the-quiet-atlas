import { interactionHint, type WorldLocale } from "../world/copy";
import { isInputTarget, type KeyEventLike } from "./input";
import type { Position } from "../../state/session";
import { TELEPORT_CHOOSE_EVENT } from "../navigation/events";

export const INTERACTION_RADIUS = 2.5;
export const ZONE_IDS = ["first-light", "roots", "workshop", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"] as const;
export type ZoneId = typeof ZONE_IDS[number];
export interface InteractionTarget {
  id: string;
  kind?: "content" | "teleport" | "vehicle" | "secret";
  zoneId: ZoneId;
  position: Position;
}

export function pickTarget<T extends InteractionTarget>(
  player: Position,
  targets: readonly T[],
  radius: number,
  lineOfSight: (target: T) => boolean = () => true,
): T | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  let chosen: T | null = null;
  let nearest = radius * radius;
  for (const target of targets) {
    const distance = (player.x - target.position.x) ** 2
      + (player.y - target.position.y) ** 2
      + (player.z - target.position.z) ** 2;
    if (distance > nearest || !Number.isFinite(distance) || !lineOfSight(target)) continue;
    if (distance === nearest && chosen && target.id >= chosen.id) continue;
    nearest = distance;
    chosen = target;
  }
  return chosen;
}

export function createInteraction(options: {
  container: HTMLElement;
  targets: readonly InteractionTarget[];
  player: () => Position;
  enabled: () => boolean;
  lineOfSight?: (target: InteractionTarget) => boolean;
  locale?: () => WorldLocale;
  visit: (zoneId: ZoneId) => void;
  chooseTeleport?: (from: ZoneId) => boolean;
  ride?: () => boolean;
  discover?: (id: string) => boolean;
  hint?: () => string | undefined;
}) {
  const { container } = options;
  const hint = document.createElement("p");
  hint.setAttribute("aria-live", "polite");
  hint.setAttribute("aria-atomic", "true");
  container.appendChild(hint);
  function select(targets = options.targets) {
    return options.enabled()
      ? pickTarget(options.player(), targets, INTERACTION_RADIUS, options.lineOfSight)
      : null;
  }
  function update() {
    const target = select();
    if (target) container.dataset.worldHint = target.zoneId;
    else delete container.dataset.worldHint;
    const text = options.hint?.() ?? (target ? interactionHint(options.locale?.() ?? "en", target.zoneId, target.kind) : "");
    if (hint.textContent !== text) hint.textContent = text;
  }
  function open(target: InteractionTarget | null) {
    if (!target) return false;
    if (target.kind === "secret") return options.discover?.(target.id) ?? false;
    if (target.kind === "vehicle") return options.ride?.() ?? false;
    if (target.kind === "teleport") {
      if (options.chooseTeleport?.(target.zoneId) === false) return false;
      container.dispatchEvent(new CustomEvent(TELEPORT_CHOOSE_EVENT, {
        bubbles: false,
        detail: { from: target.zoneId },
      }));
      return true;
    }
    container.dispatchEvent(new CustomEvent("tqa:open-content", {
      bubbles: false,
      detail: { zoneId: target.zoneId },
    }));
    return true;
  }
  function keydown(event: KeyEventLike & { repeat?: boolean }) {
    if (event.code !== "KeyE" || event.repeat || isInputTarget(event.target) || isInputTarget(document.activeElement)) return false;
    return open(select());
  }
  function click(id: string) {
    return open(select(options.targets.filter(target => target.id === id)));
  }
  function closed(event: Event) {
    const zoneId = (event as CustomEvent).detail?.zoneId;
    if (ZONE_IDS.includes(zoneId)) options.visit(zoneId);
  }
  container.addEventListener("tqa:content-closed", closed);
  return {
    update,
    keydown,
    click,
    dispose() {
      container.removeEventListener("tqa:content-closed", closed);
      delete container.dataset.worldHint;
      hint.remove();
    },
  };
}
