import type { MetadataRoute } from "next";
import { publicPaths, siteUrl } from "./seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths().map(p => ({ url: new URL(p, siteUrl).href }));
}
