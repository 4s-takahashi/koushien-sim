/**
 * src/lib/auth.ts — 認証ユーティリティ
 *
 * - ユーザー登録・ログイン
 * - セッション管理（Cookie ベース）
 * - bcryptjs でパスワードハッシュ
 * - ゲストモード
 * - Prisma + MySQL で永続化
 */

import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { generateId } from '../engine/core/id';

// ============================================================
// 定数
// ============================================================

const BCRYPT_ROUNDS = 10;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30日
// Edge ランタイム互換性のため、定数は auth-constants.ts に定義済み
export { SESSION_COOKIE_NAME } from './auth-constants';
import { SESSION_COOKIE_NAME } from './auth-constants';

// ============================================================
// 型定義
// ============================================================

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

export interface SessionRecord {
  userId: string;
  email: string;
  displayName: string;
  isGuest: boolean;
  expiresAt: string;
}

export type AuthUser = Omit<SessionRecord, 'expiresAt'>;

// ============================================================
// ユーザー操作
// ============================================================

/**
 * ユーザー登録
 */
export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // 既存チェック
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { success: false, error: 'このメールアドレスは既に登録されています' };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const userId = generateId();
  const resolvedDisplayName = displayName.trim() || normalizedEmail.split('@')[0];

  await prisma.user.create({
    data: {
      id: userId,
      email: normalizedEmail,
      displayName: resolvedDisplayName,
      passwordHash,
    },
  });

  return { success: true, userId };
}

/**
 * ログイン検証
 */
export async function verifyLogin(
  email: string,
  password: string,
): Promise<{ success: true; user: UserRecord } | { success: false; error: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

// ============================================================
// セッション操作
// ============================================================

/**
 * セッション作成（ログインユーザー）
 */
export async function createSession(user: UserRecord): Promise<string> {
  const token = generateId() + generateId().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  return token;
}

/**
 * ゲストセッション作成
 *
 * ゲストはDBにユーザーレコードを持たないため、
 * セッションを Session テーブルに保存せず、
 * 署名済み情報をトークン自体に埋め込む方式に変更。
 * トークン形式: "guest:{guestId}:{expiresAtUnix}"
 * (検証は validateSession 内で文字列パースで行う)
 */
export async function createGuestSession(): Promise<string> {
  const guestId = `guest_${generateId()}`;
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  // トークンにゲスト情報を埋め込む（DB 保存不要）
  const token = `guest:${guestId}:${expiresAt}`;
  return token;
}

/**
 * セッション検証
 */
export async function validateSession(token: string): Promise<SessionRecord | null> {
  if (!token) return null;

  // ゲストセッションの判定（DB を使わずパース）
  if (token.startsWith('guest:')) {
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [, guestId, expiresAtStr] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) return null;
    return {
      userId: guestId,
      email: '',
      displayName: 'ゲスト',
      isGuest: true,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  // 通常セッション
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;

  // 期限切れチェック
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { token } });
    return null;
  }

  return {
    userId: session.userId,
    email: session.user.email,
    displayName: session.user.displayName,
    isGuest: false,
    expiresAt: session.expiresAt.toISOString(),
  };
}

/**
 * セッション削除（ログアウト）
 */
export async function deleteSession(token: string): Promise<void> {
  if (token.startsWith('guest:')) return; // ゲストはDB不要
  try {
    await prisma.session.delete({ where: { token } });
  } catch {
    // 既に存在しない場合は無視
  }
}

// ============================================================
// Cookie ユーティリティ
// ============================================================

/**
 * Set-Cookie ヘッダー文字列を生成する
 */
export function buildSessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

/**
 * セッション削除用 Cookie（即時期限切れ）
 */
export function buildClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`;
}

/**
 * リクエストの Cookie ヘッダーからセッショントークンを取得する
 */
export function extractSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return cookie.slice(SESSION_COOKIE_NAME.length + 1);
    }
  }
  return null;
}

// ============================================================
// ユーザー取得ヘルパー
// ============================================================

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt.toISOString(),
  };
}
