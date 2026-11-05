export type WorldLocale = "en" | "vi";

export const WORLD_COPY = {
  en: {
    skip: "Skip",
    signpost: "First Light signpost (placeholder)",
    desk: "The Workshop desk (placeholder)",
    canvas: "P01-E placeholder forest. WASD to walk, Shift to run, arrows or drag to orbit, plus/minus or wheel to zoom. E or click nearby signpost or desk to open content.",
    debug: ["DEV", "FPS", "frame", "draw calls", "triangles", "geometries", "textures"],
  },
  vi: {
    skip: "Bỏ qua",
    signpost: "Biển chỉ đường The First Light (tạm)",
    desk: "Bàn The Workshop (tạm)",
    canvas: "Rừng P01-E (tạm). WASD để đi bộ, Shift để chạy, phím mũi tên hoặc kéo để xoay camera, cộng/trừ hoặc con lăn để thu phóng. Nhấn E hoặc bấm biển chỉ đường hay bàn ở gần để mở nội dung.",
    debug: ["PHÁT TRIỂN", "FPS", "khung hình", "lượt vẽ", "tam giác", "hình học", "kết cấu"],
  },
} as const;

export function isWorldLocale(value: unknown): value is WorldLocale {
  return value === "en" || value === "vi";
}

export function interactionHint(locale: WorldLocale, zoneId: string): string {
  return "E — " + WORLD_COPY[locale][zoneId === "workshop" ? "desk" : "signpost"];
}
