import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@integration-scout/ui", "@integration-scout/types"],
  typedRoutes: true,
  devIndicators: false,
  webpack(config) {
    // @integration-scout/ui and @integration-scout/types use NodeNext-style
    // relative imports (e.g. "./cn.js" resolving to "./cn.ts"). Webpack
    // doesn't do that resolution for transpiled workspace packages by
    // default, so teach it the same .js -> .ts/.tsx alias TypeScript uses.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
