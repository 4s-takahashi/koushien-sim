import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Use a build-specific tsconfig that excludes test files and
    // pre-existing broken engine/match stubs (not used in production paths)
    tsconfigPath: 'tsconfig.build.json',
  },
  // ioredis は Node.js 専用（net/tls/dns 使用）のため、
  // クライアントバンドル対象から外す（サーバー側では require で読み込む）。
  // Next.js 16 の Turbopack でも serverExternalPackages は有効。
  serverExternalPackages: ['ioredis'],
  // Turbopack 側でも ioredis の Node.js コアモジュール依存を許容
  turbopack: {},
};

export default nextConfig;
