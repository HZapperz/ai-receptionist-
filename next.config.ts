import type { NextConfig } from "next";

// The browser calls /agents/<route> on its own origin; this forwards it to the
// agents service, so there is no CORS setup and dev -> demo is one env var.
const nextConfig: NextConfig = {
  async rewrites() {
    const target = process.env.AGENTS_URL || "http://localhost:8000";
    return [{ source: "/agents/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
