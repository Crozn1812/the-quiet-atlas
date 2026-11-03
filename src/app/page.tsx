import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  alternates: { canonical: "/en/" },
};

// Trang vào `/`: nhẹ, chạy khi tắt JS, không tự chuyển locale (spec §5).
export default function RootEntryPage() {
  return (
    <main>
      <h1>The Quiet Atlas</h1>
      <nav aria-label="Language">
        <ul>
          <li>
            <Link href="/en/">English</Link>
          </li>
          <li>
            <Link href="/vi/" hrefLang="vi">
              Tiếng Việt
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
