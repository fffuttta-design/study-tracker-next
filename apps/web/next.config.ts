import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: {
    // モノレポ内の @tiptap/core 重複パッケージによる型不一致を無視
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@futa/editor",
    "@study-tracker/core",
    "@study-tracker/firebase",
    "@study-tracker/ui",
  ],
  webpack(config, { dev }) {
    // 共有パッケージ @futa/editor はリポジトリの外（Utility/FutaEditor）にある。
    // webpack はシンボリックリンクを実体パスへ解決するので、その中の
    // import '@tiptap/core' などが自力では見つけられない。
    // 自分の node_modules を解決パスの先頭に足して拾わせる。
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.join(__dirname, "node_modules"),
      path.join(__dirname, "../../node_modules"),
      ...(config.resolve.modules || ["node_modules"]),
    ];
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
