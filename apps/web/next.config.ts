import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@scriora/shared"],
  agentRules: false,
  async rewrites() {
    return [
      {
        source: "/scriora-api/:path*",
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
