import nextConfig from "@scout/eslint-config/next";

export default [...nextConfig, { ignores: ["next-env.d.ts"] }];
