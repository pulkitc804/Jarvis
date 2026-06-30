import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these in Node directly instead of bundling them with Turbopack.
  // node-ical pulls a Temporal polyfill that breaks under the bundler, and
  // imapflow is a server-only networking library.
  serverExternalPackages: ["node-ical", "imapflow"],
};

export default nextConfig;
