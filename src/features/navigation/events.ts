import type { ZoneId } from "../interaction/targets";

/** Proposed ADR 0008 extension: world -> UI, container only, bubbles: false. */
export const TELEPORT_START_EVENT = "tqa:teleport-start";
export const TELEPORT_END_EVENT = "tqa:teleport-end";

export interface TeleportStartDetail {
  readonly from: ZoneId;
  readonly to: ZoneId;
}

export interface TeleportEndDetail {
  readonly to: ZoneId;
}

export type TeleportStartEvent = {
  readonly type: typeof TELEPORT_START_EVENT;
  readonly detail: TeleportStartDetail;
};

export type TeleportEndEvent = {
  readonly type: typeof TELEPORT_END_EVENT;
  readonly detail: TeleportEndDetail;
};

export type TeleportEvent = TeleportStartEvent | TeleportEndEvent;

/** B2-041 contract (Lead, 2026-11-05). World -> UI: the player pressed E at a teleport signpost. */
export const TELEPORT_CHOOSE_EVENT = "tqa:teleport-choose";
/** UI -> world: travel to the chosen zone (must differ from `from`; secrets are not zones). */
export const TELEPORT_TO_EVENT = "tqa:teleport-to";
/** UI -> world: the chooser closed without a choice. */
export const TELEPORT_CANCEL_EVENT = "tqa:teleport-cancel";

export interface TeleportChooseDetail {
  readonly from: ZoneId;
}

export interface TeleportToDetail {
  readonly to: ZoneId;
}
