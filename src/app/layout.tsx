import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "The Quiet Atlas",
};

// TODO(L1): `lang` theo locale cho /vi/ — xem ADR 0001, mục "Việc còn mở".
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
