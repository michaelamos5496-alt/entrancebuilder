import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The app never needs to reveal what it runs on
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const list = securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, production: process.env.NODE_ENV === "production" });
    return [{ source: "/:path*", headers: list }];
  },
};

export default nextConfig;
