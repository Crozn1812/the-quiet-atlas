import Link from "next/link";
import "./portfolio.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  icons: {
    icon: {
      url: "/favicon.svg",
      type: "image/svg+xml",
    },
  },
  title: "Page not found · The Quiet Atlas",
};

export default function GlobalNotFound() {
  return (<html lang="en">
    <body>
      <main>
        <h1>Page not found</h1>
        <Link
          prefetch={false}
          href="/en/"
        >
          Back to the portfolio
        </Link>
      </main>
    </body>
  </html>);
}
