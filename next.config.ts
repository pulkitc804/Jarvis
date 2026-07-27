import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder (a stray lockfile in $HOME was being
  // picked up otherwise).
  turbopack: { root: import.meta.dirname },
  // Self-contained server output so the Electron desktop app can bundle it.
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  // node-ical is a server-external package; force its (dynamically-required)
  // dep tree into the standalone bundle so the packaged app's /api/meetings works.
  outputFileTracingIncludes: {
    "/api/meetings": [
      "./node_modules/node-ical/**",
      "./node_modules/rrule-temporal/**",
      "./node_modules/temporal-polyfill/**",
    ],
  },
  // Load these in Node directly instead of bundling them with Turbopack.
  // node-ical pulls a Temporal polyfill that breaks under the bundler, and
  // imapflow is a server-only networking library.
  serverExternalPackages: ["node-ical", "imapflow", "mailparser", "nodemailer"],
};

export default nextConfig;
