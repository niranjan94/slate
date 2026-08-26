import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Browsers and favicon scrapers ask for /favicon.ico by convention and cache
  // whatever they find there, so point it at the generated icon rather than
  // committing a second copy of the mark as an .ico.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon/32" }];
  },
};

export default nextConfig;
