import type { Quality } from "../../src/features/world/terrain";
import type { PresetId } from "./presets";
import { SHOT_IDS, VIDEO_SECONDS, type ShotId } from "./shots";

export interface FrameOptions {
  preset: PresetId;
  shot: ShotId;
  quality: Quality;
  t: number;
  clean: boolean;
}

/** Read-only input: never writes selection or playback state back to the URL. */
export function parseQuery(search: string): FrameOptions {
  const query = new URLSearchParams(search);
  const preset = query.get("preset");
  const shot = query.get("shot");
  const quality = query.get("quality");
  const rawTime = query.get("t") ?? "0";
  const time = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawTime) ? Number(rawTime) : 0;
  return {
    preset: preset === "A" || preset === "B" || preset === "C" ? preset : "A",
    shot: SHOT_IDS.find(id => id === shot) ?? "forest-dawn",
    quality: quality === "Low" || quality === "Balanced" || quality === "High" ? quality : "High",
    t: Number.isFinite(time) ? Math.min(VIDEO_SECONDS, time) : 0,
    clean: query.get("clean") === "1",
  };
}
