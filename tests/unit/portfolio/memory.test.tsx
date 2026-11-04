import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilmFrame } from "@/components/portfolio/memory/FilmFrame";
import { MagazinePage } from "@/components/portfolio/memory/MagazinePage";

const directory = new URL("../../../src/components/portfolio/memory/", import.meta.url);

describe("memory server templates", () => {
  it("renders the supplied date, caption and content with hidden decorative layers", () => {
    const html = renderToStaticMarkup(
      <FilmFrame date="'26 11 04" caption="Một chiều ở Đà Lạt">
        <svg role="img" aria-label="Đồi thông" />
      </FilmFrame>,
    );
    expect(html).toContain("&#x27;26 11 04");
    expect(html).toMatch(/<figcaption[^>]*>Một chiều ở Đà Lạt<\/figcaption>/);
    expect(html).toContain('aria-label="Đồi thông"');
    expect(html.match(/<span[^>]*aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('data-variant="color"');
    expect(html).not.toMatch(/<script\b/);
  });

  it("supports mono, an arbitrary date string and an omitted caption", () => {
    const html = renderToStaticMarkup(
      <FilmFrame date="Tháng mười một" variant="mono">Ký ức</FilmFrame>,
    );
    expect(html).toContain('data-variant="mono"');
    expect(html).toContain("Tháng mười một");
    expect(html).not.toContain("figcaption");
  });

  it("renders one h2, Vietnamese copy, body and optional accessible art", () => {
    const props = {
      kicker: "Ký ức / 01", title: "Những ngày nhiều gió", lead: "Một khoảng lặng giữa rừng.",
      children: createElement("p", null, "Đường về qua đồi thông."),
    };
    for (const art of [undefined, createElement("svg", { role: "img", "aria-label": "Rừng thông" })]) {
      const html = renderToStaticMarkup(createElement(MagazinePage, { ...props, art }));
      expect(html.match(/<h2\b/g)).toHaveLength(1);
      for (const text of [props.kicker, props.title, props.lead, "Đường về qua đồi thông."]) {
        expect(html).toContain(text);
      }
      expect(html.includes('aria-label="Rừng thông"')).toBe(art !== undefined);
      expect(html).not.toMatch(/<script\b/);
    }
  });

  it("keeps the entire component directory free of client directives", () => {
    for (const file of readdirSync(directory, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const source = readFileSync(`${file.parentPath}/${file.name}`, "utf8");
      expect(source, file.name).not.toMatch(/["']use client["']/);
    }
  });

  it("uses a self-contained SVG noise data URI no larger than 1024 bytes", () => {
    const css = readFileSync(new URL("film-frame.module.css", directory), "utf8");
    const uris = [...css.matchAll(/url\("(data:image\/svg\+xml,[^"]+)"\)/g)];
    expect(uris).toHaveLength(1);
    for (const [, uri] of uris) {
      expect(Buffer.byteLength(uri!, "utf8")).toBeLessThanOrEqual(1024);
      expect(decodeURIComponent(uri!)).toContain("feTurbulence");
    }
  });
});
