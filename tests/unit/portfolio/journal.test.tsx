import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AtlasJournal, type AtlasJournalProps } from "@/components/portfolio/journal/AtlasJournal";
import { initialJournal, journalEntries, journalReducer, journalTitle, blankPages } from "@/features/journal/model";

const directory = new URL("../../../src/components/portfolio/journal/", import.meta.url);
const state = journalReducer(initialJournal(), { type: "visit", zoneId: "roots" });
const entries = journalEntries(state, "en");
const render = (props: Partial<AtlasJournalProps> = {}) => renderToStaticMarkup(
  <AtlasJournal entries={entries} blankPages={0} title="Atlas Journal" locale="en"
    onOpenZone={() => {}} onClose={() => {}} {...props} />,
);

describe("Atlas Journal", () => {
  it("renders eight zone buttons in selector order and one close button", () => {
    const html = render();
    const rows = [...html.matchAll(/<li><button\b[^>]*>([\s\S]*?)<\/button><\/li>/g)];
    expect(rows).toHaveLength(8);
    expect(rows.map(row => /<span>(.*?)<\/span>/.exec(row[1]!)?.[1]))
      .toEqual(entries.map(entry => entry.title));
    expect(html.match(/<button\b/g)).toHaveLength(9);
    expect(html).toMatch(/<button[^>]*>Close<\/button>/);
  });

  it("labels only visited rows and uses a hidden text-free vermilion stamp", () => {
    const html = render();
    const stamped = /<button[^>]*aria-label="The Roots, visited"[^>]*>(.*?)<\/button>/.exec(html)?.[1];
    expect(stamped).toContain('<svg');
    expect(stamped).toContain('aria-hidden="true"');
    expect(stamped).toContain('focusable="false"');
    expect(stamped).toContain('stroke="#B5432F"');
    expect(stamped).not.toMatch(/<text\b/);
    expect(html.match(/<svg\b/g)).toHaveLength(1);
    expect(html.match(/, visited"/g)).toHaveLength(1);
    expect(render({ entries: journalEntries(initialJournal(), "en") })).not.toContain('<svg');
  });

  it("names the modal from its focusable heading", () => {
    const html = render();
    const headingId = /<h2[^>]*id="([^"]+)"[^>]*tabindex="-1"/.exec(html)?.[1];
    expect(headingId).toBeTruthy();
    expect(html).toContain(`aria-labelledby="${headingId}"`);
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).toContain('lang="en"');
  });

  it("renders the requested number of empty, hidden paper pages after all rows", () => {
    for (const count of [0, 1, 2, 3]) {
      const html = render({ blankPages: count });
      const pages = [...html.matchAll(/<div[^>]*aria-hidden="true"><\/div>/g)];
      expect(pages).toHaveLength(count);
      for (const page of pages) expect(page.index).toBeGreaterThan(html.indexOf('</ol>'));
    }
  });

  it("keeps secrets and location data out while selectors supply blank pages", () => {
    const secretState = journalReducer(state, { type: "findSecret", id: "reflection" });
    const html = render({ entries: journalEntries(secretState, "en"), blankPages: blankPages(secretState) });
    expect(html.match(/<div[^>]*aria-hidden="true"><\/div>/g)).toHaveLength(2);
    expect(html).not.toMatch(/reflection|forgotten.sound|unmarked.road|unwritten.page|coordinates|latitude|longitude|minimap/i);
    expect(html).not.toMatch(/data-(?:x|y|z|position)|\b[xyz]=/);
  });

  it("renders Vietnamese title, close label and visited announcement", () => {
    const html = render({ locale: "vi", title: journalTitle("vi") });
    expect(html).toContain('lang="vi"');
    expect(html).toContain('Sổ Atlas');
    expect(html).toMatch(/<button[^>]*>Đóng<\/button>/);
    expect(html).toContain('aria-label="The Roots, đã ghé"');
    expect(html).not.toContain(', visited');
  });

  it("has no world import or persistent storage in its component files", () => {
    for (const file of readdirSync(directory)) {
      const source = readFileSync(new URL(file, directory), "utf8");
      expect(source, file).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*features\/world/);
      expect(source, file).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    }
  });
});
