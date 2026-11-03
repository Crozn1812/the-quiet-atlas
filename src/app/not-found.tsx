import Link from "next/link";
export default function NotFound() {
  return <main>
    <h1>Page not found</h1>
    <Link href="/en/">Back to the portfolio</Link>
  </main>;
}
