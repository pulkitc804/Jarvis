import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder (a stray lockfile in $HOME was being
  // picked up otherwise).
  turbopack: { root: import.meta.dirname },
  // Load these in Node directly instead of bundling them with Turbopack.
  // node-ical pulls a Temporal polyfill that breaks under the bundler, and
  // imapflow is a server-only networking library.
  serverExternalPackages: ["node-ical", "imapflow"],
};

export default nextConfig;
