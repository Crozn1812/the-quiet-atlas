import "./portfolio.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found · The Quiet Atlas",
};

export default function GlobalNotFound() {
  return (<html lang="en">
    <body>
      <main>
        <h1>Page not found</h1>
        <Link href="/en/">Back to the portfolio</Link>
      </main>
    </body>
  </html>);
}
