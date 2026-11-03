import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { content } from "@/content";
import { ZoneContent } from "@/components/portfolio/ZoneContent";
import { GET } from "@/app/[locale]/world-content.json/route";
import { CaseStudy } from "@/components/portfolio/CaseStudy";
import EntryLayout from "@/app/(entry)/layout";
import LocaleLayout from "@/app/[locale]/layout";
import GlobalNotFound from "@/app/global-not-found";
import { Portfolio } from "@/components/portfolio/Portfolio";
import Privacy from "@/app/[locale]/privacy/page";
import Entry from "@/app/(entry)/page";
import NotFound from "@/app/not-found";

it("puts the localized skip link first in every HTML layout", async () => {
  const layouts = [
    EntryLayout({ children: "child" }),
    createElement(GlobalNotFound),
    ...await Promise.all((["en", "vi"] as const).map(locale => LocaleLayout({ children: "child", params: Promise.resolve({ locale }) }))),
  ];
  for (const layout of layouts) {
    const html = renderToStaticMarkup(layout);
    expect(html).toMatch(/<body><a class="skip-link" href="#content">/);
    expect(html).toContain(html.includes('lang="vi"') ? "Bỏ qua đến nội dung" : "Skip to content");
  }
});

it("provides focusable skip targets, using the information card on Welcome", async () => {
  const pages: ReactElement[] = [createElement(Entry), createElement(NotFound), createElement(GlobalNotFound)];
  for (const locale of ["en", "vi"] as const) {
    pages.push(createElement(Portfolio, { locale }), createElement(Portfolio, { locale, quick: true }));
    pages.push(await Privacy({ params: Promise.resolve({ locale }) }));
  }
  for (const project of content.projects) pages.push(createElement(CaseStudy, { project }));
  for (const page of pages) {
    const html = renderToStaticMarkup(page);
    expect(html).toMatch(/<(?:main|div) id="content"[^>]*tabindex="-1"/);
    if (html.includes('class="welcome-shell"')) {
      expect(html).toContain('<div id="content" tabindex="-1" class="welcome-card">');
    }
  }
});

it("uses public profile/projects and marks all other zones under construction", async () => {
  for (const locale of ["en", "vi"] as const) {
    const response = await GET(new Request("https://example.com"), { params: Promise.resolve({ locale }) });
    const data = await response.json();
    const profile = renderToStaticMarkup(createElement(ZoneContent, { locale, data, zoneId: "first-light" }));
    const p = content.profiles.find(p => p.locale === locale)!;
    expect(profile).toContain(p.name);
    expect(profile).toContain(p.role.replaceAll("&", "&amp;"));
    expect(profile).toContain(p.introduction);
    const workshop = renderToStaticMarkup(createElement(ZoneContent, { locale, data, zoneId: "workshop" }));
    expect(workshop.match(/<article/g)).toHaveLength(4);
    for (const project of content.projects.filter(p => p.locale === locale)) {
      expect(workshop).toContain(`/${locale}/projects/${project.slug}/`);
      const embedded = renderToStaticMarkup(createElement(CaseStudy, { project, embedded: true }));
      expect(embedded).not.toContain("<main");
      expect(embedded).toContain(project.title);
    }
    for (const zoneId of ["roots", "milestones", "old-trail", "horizon", "quiet-shore", "last-postcard"]) {
      const html = renderToStaticMarkup(createElement(ZoneContent, { locale, data, zoneId }));
      expect(html).toContain(locale === "vi" ? "Đang xây dựng" : "Under construction");
      expect(html).toContain(`/${locale}/quick/`);
    }
  }
});

it("opens once, focuses the title, resumes before content-closed, and removes listeners", async () => {
  const render = vi.fn();
  const unmount = vi.fn();
  vi.doMock("react-dom/client", () => ({ createRoot: () => ({ render, unmount }) }));
  const { mountWorldContent } = await import("@/components/portfolio/WorldContent");
  class Element extends EventTarget {
    open = false;
    parentElement?: Element;
    children: Element[] = [];
    focus = vi.fn();
    setAttribute() {}
    append(child: Element) { this.children.push(child); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    remove() {}
    querySelector() { return title; }
  }
  const title = new Element();
  const doc = new Element();
  const parent = new Element();
  const container = new Element();
  container.parentElement = parent;
  Object.assign(doc, {
    createElement: () => new Element(),
    querySelector: () => parent.children.find(child => child.open) ?? null,
  });
  vi.stubGlobal("document", doc);
  let rejectFetch: (error: Error) => void = () => {};
  vi.stubGlobal("fetch", () => new Promise((_resolve, reject) => {
    rejectFetch = reject;
  }));
  try {
    const events: unknown[] = [];
    for (const name of ["tqa:pause", "tqa:content-closed"]) {
      container.addEventListener(name, event => events.push([event.type, (event as CustomEvent).detail, event.bubbles]));
    }
    const dispose = mountWorldContent(container as unknown as HTMLElement, "en");
    const request = (zoneId: string) => container.dispatchEvent(new CustomEvent("tqa:open-content", { detail: { zoneId } }));
    request("invalid");
    expect(render).not.toHaveBeenCalled();
    request("workshop");
    request("first-light");
    expect(render).toHaveBeenCalledTimes(1);
    expect(title.focus).toHaveBeenCalledOnce();
    rejectFetch(new Error("Offline"));
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    const failed = renderToStaticMarkup(render.mock.lastCall![0]);
    expect(failed).toContain("Could not load content.");
    expect(failed).toContain('href="/en/quick/"');
    const escape = new Event("keydown", { cancelable: true });
    Object.assign(escape, { key: "Escape" });
    doc.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(container.focus).toHaveBeenCalledOnce();
    expect(events).toEqual([
      ["tqa:pause", { reason: "overlay", paused: true }, false],
      ["tqa:pause", { reason: "overlay", paused: false }, false],
      ["tqa:content-closed", { zoneId: "workshop" }, false],
    ]);
    request("first-light");
    parent.children[0]!.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(events.at(-1)).toEqual(["tqa:content-closed", { zoneId: "first-light" }, false]);
    dispose();
    request("roots");
    expect(render).toHaveBeenCalledTimes(3);
    expect(unmount).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
    vi.doUnmock("react-dom/client");
  }
});


it("caches serialized content by locale and allows retry after a failed fetch", async () => {
  const { loadWorldContent } = await import("@/components/portfolio/WorldContent");
  const data = { profile: {}, projects: [] };
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => data })
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => data });
  vi.stubGlobal("fetch", fetch);
  try {
    const first = loadWorldContent("vi");
    expect(loadWorldContent("vi")).toBe(first);
    expect(await first).toEqual(data);
    expect(loadWorldContent("vi")).toBe(first);
    expect(fetch).toHaveBeenCalledWith("/vi/world-content.json");
    await expect(loadWorldContent("retry")).rejects.toThrow("Content request failed");
    expect(await loadWorldContent("retry")).toEqual(data);
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllGlobals();
  }
});
