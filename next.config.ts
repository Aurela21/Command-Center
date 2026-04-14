import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow large video uploads through middleware without truncation
    middlewareClientMaxBodySize: 500 * 1024 * 1024, // 500 MB
  },
};

export default nextConfig;
