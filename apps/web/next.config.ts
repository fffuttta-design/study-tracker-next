import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@study-tracker/core",
    "@study-tracker/firebase",
    "@study-tracker/ui",
  ],
};

export default nextConfig;
