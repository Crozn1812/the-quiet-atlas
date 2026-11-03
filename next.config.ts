import type { NextConfig } from "next";

// ADR 0001: static export, không Next runtime.
const nextConfig: NextConfig = {
  experimental: { globalNotFound: true },
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
