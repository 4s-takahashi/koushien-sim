#!/usr/bin/env tsx
/**
 * scripts/migrate-redis-to-mysql.ts
 *
 * Redis に保存されているユーザー・セッション・セーブデータを
 * MySQL（Prisma）に移行するスクリプト。
 *
 * 実行前提:
 *   - REDIS_URL 環境変数が設定されていること
 *   - DATABASE_URL 環境変数が設定されていること
 *   - `npx prisma migrate deploy` を実行済みであること
 *
 * 実行方法:
 *   DATABASE_URL="mysql://..." REDIS_URL="redis://..." npx tsx scripts/migrate-redis-to-mysql.ts
 *
 * 冪等性:
 *   既存ユーザー・セッション・セーブは SKIP（上書きしない）。
 */

import 'dotenv/config';

// ────────────────────────────────────────────────────────────────
// 環境変数チェック
// ────────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!REDIS_URL) {
  console.error('[migrate] REDIS_URL が設定されていません。');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL が設定されていません。');
  process.exit(1);
}

import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const redis = new Redis(REDIS_URL);

// Prisma v7 は adapter 必須。DATABASE_URL をパースして MariaDB adapter を構築する。
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

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(parseDbUrl(DATABASE_URL)),
});

// ────────────────────────────────────────────────────────────────
// 型定義（Redis に保存されていた旧データ構造）
// ────────────────────────────────────────────────────────────────

interface OldUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

interface OldSessionRecord {
  userId: string;
  email: string;
  displayName: string;
  isGuest: boolean;
  expiresAt: string;
}

// ────────────────────────────────────────────────────────────────
// ヘルパー
// ────────────────────────────────────────────────────────────────

async function safeGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

// ────────────────────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────────────────────

async function migrate() {
  console.log('[migrate] Redis → MySQL 移行を開始します...');
  console.log(`[migrate] Redis: ${REDIS_URL}`);
  console.log(`[migrate] MySQL: ${DATABASE_URL!.replace(/:[^@]+@/, ':***@')}`);
  console.log('');

  let userCount = 0, userSkip = 0;
  let sessionCount = 0, sessionSkip = 0;
  let saveCount = 0, saveSkip = 0;

  // ──────────────────────────────────────
  // 1. ユーザー移行 (user:* キー)
  // ──────────────────────────────────────
  console.log('[migrate] === ユーザー移行 ===');
  const userKeys = await redis.keys('user:*');
  // user_id:* は逆引きキーなので除外
  const emailKeys = userKeys.filter(k => !k.startsWith('user_id:'));

  for (const key of emailKeys) {
    const user = await safeGet<OldUserRecord>(key);
    if (!user) continue;

    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      console.log(`  [SKIP] user: ${user.email} (既に存在)`);
      userSkip++;
      continue;
    }

    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        passwordHash: user.passwordHash,
        createdAt: new Date(user.createdAt),
      },
    });
    console.log(`  [OK]   user: ${user.email} (id: ${user.id})`);
    userCount++;
  }

  // ──────────────────────────────────────
  // 2. セッション移行 (session:* キー)
  // ──────────────────────────────────────
  console.log('');
  console.log('[migrate] === セッション移行 ===');
  const sessionKeys = await redis.keys('session:*');

  for (const key of sessionKeys) {
    const token = key.replace(/^session:/, '');
    const session = await safeGet<OldSessionRecord>(key);
    if (!session) continue;

    // ゲストセッションはスキップ（DBに保存しない方式に変更）
    if (session.isGuest) {
      console.log(`  [SKIP] session: ${token.slice(0, 12)}... (ゲスト)`);
      sessionSkip++;
      continue;
    }

    // 期限切れチェック
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      console.log(`  [SKIP] session: ${token.slice(0, 12)}... (期限切れ)`);
      sessionSkip++;
      continue;
    }

    // ユーザーが MySQL に存在するか確認
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      console.log(`  [SKIP] session: ${token.slice(0, 12)}... (対応ユーザーなし: ${session.userId})`);
      sessionSkip++;
      continue;
    }

    const existing = await prisma.session.findUnique({ where: { token } });
    if (existing) {
      console.log(`  [SKIP] session: ${token.slice(0, 12)}... (既に存在)`);
      sessionSkip++;
      continue;
    }

    await prisma.session.create({
      data: {
        token,
        userId: session.userId,
        expiresAt,
      },
    });
    console.log(`  [OK]   session: ${token.slice(0, 12)}... (user: ${session.email})`);
    sessionCount++;
  }

  // ──────────────────────────────────────
  // 3. セーブデータ移行 (save:* キー)
  // ──────────────────────────────────────
  console.log('');
  console.log('[migrate] === セーブデータ移行 ===');
  const saveKeys = await redis.keys('save:*');
  // save_meta:* は派生データなので除外
  const saveDataKeys = saveKeys.filter(k => !k.startsWith('save_meta:'));

  for (const key of saveDataKeys) {
    // save:{userId}:{slotId} 形式
    const parts = key.split(':');
    if (parts.length !== 3) continue;
    const [, userId, slotId] = parts;

    const data = await safeGet<unknown>(key);
    if (!data) continue;

    // ユーザーが MySQL に存在するか確認
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.log(`  [SKIP] save: ${userId}/${slotId} (対応ユーザーなし)`);
      saveSkip++;
      continue;
    }

    const existing = await prisma.saveData.findUnique({
      where: { userId_slot: { userId, slot: slotId } },
    });
    if (existing) {
      console.log(`  [SKIP] save: ${userId}/${slotId} (既に存在)`);
      saveSkip++;
      continue;
    }

    await prisma.saveData.create({
      data: {
        userId,
        slot: slotId,
        data: data as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
    console.log(`  [OK]   save: ${userId}/${slotId}`);
    saveCount++;
  }

  // ──────────────────────────────────────
  // サマリー
  // ──────────────────────────────────────
  console.log('');
  console.log('[migrate] === 完了 ===');
  console.log(`  ユーザー  : 移行 ${userCount} 件 / スキップ ${userSkip} 件`);
  console.log(`  セッション: 移行 ${sessionCount} 件 / スキップ ${sessionSkip} 件`);
  console.log(`  セーブ    : 移行 ${saveCount} 件 / スキップ ${saveSkip} 件`);
}

migrate()
  .catch((err) => {
    console.error('[migrate] エラーが発生しました:', err);
    process.exit(1);
  })
  .finally(async () => {
    await redis.quit();
    await prisma.$disconnect();
  });
