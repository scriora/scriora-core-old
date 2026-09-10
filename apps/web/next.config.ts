import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@scriora/shared"],
  agentRules: false,
};

export default nextConfig;
