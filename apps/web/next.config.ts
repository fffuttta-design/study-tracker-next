import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // モノレポ内の @tiptap/core 重複パッケージによる型不一致を無視
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@study-tracker/core",
    "@study-tracker/firebase",
    "@study-tracker/ui",
  ],
  webpack(config, { dev }) {
    if (dev) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        chunkIds: 'deterministic',
      };
    }
    return config;
  },
};

export default nextConfig;
