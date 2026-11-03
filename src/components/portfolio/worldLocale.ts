export type WorldLocale = "en" | "vi";

export function replaceWorldLocale(locale: WorldLocale, history: Pick<History, "state" | "replaceState">, document: Pick<Document, "documentElement" | "title">) {
  history.replaceState(history.state, "", `/${locale}/`);
  document.documentElement.lang = locale;
  document.title = locale === "vi" ? "Chào mừng · The Quiet Atlas" : "Welcome · The Quiet Atlas";
}
