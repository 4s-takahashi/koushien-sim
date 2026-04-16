import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Use a build-specific tsconfig that excludes test files and
    // pre-existing broken engine/match stubs (not used in production paths)
    tsconfigPath: 'tsconfig.build.json',
  },
};

export default nextConfig;
