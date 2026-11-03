import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../portfolio.css";
export const metadata: Metadata = { title: "The Quiet Atlas" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
