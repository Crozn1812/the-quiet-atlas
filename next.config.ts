import type { NextConfig } from "next";

// ADR 0001: static export, không Next runtime.
// Q-09 (Duy, 2026-11-05): tên miền nhbduy.id.vn. canonical/sitemap/robots lấy từ SITE_URL (spec §11.3 mục 7);
// đây chỉ là giá trị mặc định của build, đặt SITE_URL khác (vd. *.cloudfront.net) để ghi đè, không cần sửa code.
const SITE_URL = process.env.SITE_URL || "https://nhbduy.id.vn";

const nextConfig: NextConfig = {
  env: { SITE_URL },
  experimental: { globalNotFound: true },
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
