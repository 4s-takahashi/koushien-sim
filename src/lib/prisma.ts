/**
 * src/lib/prisma.ts — Prisma クライアント シングルトン
 *
 * Prisma v7 では Driver Adapter が必須。
 * MySQL / MariaDB には @prisma/adapter-mariadb を使用する。
 *
 * 本番環境で DATABASE_URL が未設定の場合は起動時に throw して
 * プロセスを落とす（fail-fast）。
 *
 * Next.js 開発時は HMR でモジュールが再読み込みされるたびに
 * PrismaClient が増殖しないよう globalThis にキャッシュする。
 */

import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// ────────────────────────────────────────────────────────────────
// Fail-fast: 本番で DATABASE_URL が未設定ならプロセスを停止
// ────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;

if (process.env.NODE_ENV === 'production' && !DATABASE_URL) {
  throw new Error(
    '[prisma] DATABASE_URL が設定されていません。' +
      '.env に DATABASE_URL を追加してから起動してください。',
  );
}

// ────────────────────────────────────────────────────────────────
// DATABASE_URL を MariaDB 接続オプションにパース
// 書式: mysql://user:password@host:port/database
// ────────────────────────────────────────────────────────────────
function parseDbUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function createPrismaClient(): PrismaClient {
  if (!DATABASE_URL) {
    // 開発環境など DATABASE_URL 未設定の場合（接続試行しない）
    // ダミー接続でクライアントを作成（実際に接続されるまではエラーにならない）
    const adapter = new PrismaMariaDb({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'koushien_sim',
    });
    return new PrismaClient({ adapter });
  }

  const opts = parseDbUrl(DATABASE_URL);
  const adapter = new PrismaMariaDb(opts);
  return new PrismaClient({ adapter });
}

// ────────────────────────────────────────────────────────────────
// シングルトン（開発時 HMR 対策）
// ────────────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
