import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../portfolio.css";
export const metadata: Metadata={
  icons: {
    icon: {
      url: "/favicon.svg",
      type: "image/svg+xml",
    },
  },
  title: "The Quiet Atlas"
};
export default function RootLayout({ children }: {
  children: ReactNode;
}) {
  return <html lang="en">
    <body>{children}</body>
  </html>;
}
