import { VEHICLE_LABELS } from "../vehicle/labels";

export type WorldLocale = "en" | "vi";

export const WORLD_COPY = {
  en: {
    skip: "Skip",
    teleportHint: "E — Travel…",
    secretHint: "E — Pause",
    vehicleUnsafe: "No safe place to stop",
    signpost: "First Light signpost",
    desk: "The Workshop desk",
    canvas: "A riverside journey through eight places. WASD to walk, Shift to run, ←→ or drag to orbit, +/− or wheel to zoom, E to interact, J for journal, Esc for menu. Click a nearby object to open its story.",
    debug: ["DEV", "FPS", "frame", "draw calls", "triangles", "geometries", "textures"],
  },
  vi: {
    skip: "Bỏ qua",
    teleportHint: "E — Đi tới…",
    secretHint: "E — Dừng",
    vehicleUnsafe: "Chưa có chỗ dừng an toàn",
    signpost: "Biển chỉ đường The First Light",
    desk: "Bàn The Workshop",
    canvas: "Hành trình qua tám khu bên dòng sông. WASD để đi bộ, Shift để chạy, ←→ hoặc kéo để xoay, +/− hoặc cuộn để thu phóng, E để tương tác, J mở sổ, Esc mở menu. Bấm vật thể ở gần để mở câu chuyện.",
    debug: ["PHÁT TRIỂN", "FPS", "khung hình", "lượt vẽ", "tam giác", "hình học", "kết cấu"],
  },
} as const;

export function isWorldLocale(value: unknown): value is WorldLocale {
  return value === "en" || value === "vi";
}

export function interactionHint(locale: WorldLocale, zoneId: string, kind?: "content" | "teleport" | "vehicle" | "secret", label?: string): string {
  if (kind === "secret") return WORLD_COPY[locale].secretHint;
  if (kind === "vehicle") return VEHICLE_LABELS[locale].ride;
  if (kind === "teleport") return WORLD_COPY[locale].teleportHint;
  return "E — " + (label ?? WORLD_COPY[locale][zoneId === "workshop" ? "desk" : "signpost"]);
}
