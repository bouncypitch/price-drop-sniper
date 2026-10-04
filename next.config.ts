import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only SDKs with optional/dynamic deps: load from node_modules instead of bundling.
  serverExternalPackages: ["agentmail", "@onkernel/sdk", "playwright-core", "@mastra/core", "exa-js", "@neondatabase/serverless"],
  output: "standalone",
  devIndicators: false,
};

export default nextConfig;
