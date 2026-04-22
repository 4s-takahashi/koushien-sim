import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Use a build-specific tsconfig that excludes test files and
    // pre-existing broken engine/match stubs (not used in production paths)
    tsconfigPath: 'tsconfig.build.json',
  },
  // @prisma/client と prisma は Next.js のデフォルト serverExternalPackages リストに
  // 含まれているが、明示的に追記して意図を明確にする。
  // ioredis 依存は削除済み。
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // Turbopack 設定
  turbopack: {},
};

export default nextConfig;
