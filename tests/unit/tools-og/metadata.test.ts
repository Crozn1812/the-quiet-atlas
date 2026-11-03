import { expect, it } from "vitest";
import { pageMetadata } from "@/app/seo";

it("gives each locale and page its own 1200 by 630 image", () => {
  const paths = ["", "quick/", "projects/example/"];
  const images = new Set();
  for (const locale of ["en", "vi"] as const) {
    for (const path of paths) {
      const image = pageMetadata(locale, path).openGraph?.images;
      expect(image).toEqual([{
        url: `/og/${locale}-${path ? path.slice(0, -1).replaceAll("/", "-") : "welcome"}.png`,
        width: 1200,
        height: 630,
      }]);
      images.add(JSON.stringify(image));
    }
  }
  expect(images.size).toBe(6);
});
