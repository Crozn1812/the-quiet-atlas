// Plain <a>: this boundary is part of every route's RSC tree, and next/link would add its client chunk
// (and module instantiation on the hydration long task) to every page, including Welcome (L1-012).
/* eslint-disable @next/next/no-html-link-for-pages */
export default function NotFound() {
  return <main
      id="content"
      tabIndex={-1}
    >
    <h1>Page not found</h1>
    <a href="/en/">
      Back to the portfolio
    </a>
  </main>;
}
