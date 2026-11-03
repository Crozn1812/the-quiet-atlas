export function SkipLink({ locale = "en" }: { locale?: string }) {
  return (
    <a
      className="skip-link"
      href="#content"
    >
      {locale === "vi" ? "Bỏ qua đến nội dung" : "Skip to content"}
    </a>
  );
}
