/** Keep complete supplied sentences; unfinished draft sentences never become public copy. */
export function published(value?: string): string {
  if (!value) return "";
  if (!/\bTBD\b/i.test(value)) return value;
  return value.split(/(?<=[.!?])\s+/u)
    .filter(sentence => !/\bTBD\b/i.test(sentence)).join(" ").trim();
}

/** URLs are indivisible: never turn a partly specified address into a link. */
export function publishedUrl(value?: string): string {
  return value && !/\bTBD\b/i.test(value) ? value : "";
}
