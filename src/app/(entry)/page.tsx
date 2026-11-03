import Link from "next/link";
import { pageMetadata } from "@/app/seo";
import type { Metadata } from "next";
export const metadata: Metadata = pageMetadata("en");
// Trang vào `/`: nhẹ, chạy khi tắt JS, không tự chuyển locale (spec §5).
export default function RootEntryPage() {
  return (<main>
    <h1>The Quiet Atlas</h1>
    <nav aria-label="Language">
      <ul>
        <li>
          <Link
            prefetch={false}
            href="/en/"
          >
            English
          </Link>
        </li>
        <li>
          <Link
            prefetch={false}
            href="/vi/"
            hrefLang="vi"
          >
            Tiếng Việt
          </Link>
        </li>
      </ul>
    </nav>
  </main>);
}
