import nextConfig from "@integration-scout/eslint-config/next";

export default [...nextConfig, { ignores: ["next-env.d.ts"] }];
