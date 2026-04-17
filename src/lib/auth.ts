/**
 * src/lib/auth.ts — 認証ユーティリティ
 *
 * - ユーザー登録・ログイン
 * - セッション管理（Cookie ベース）
 * - bcryptjs でパスワードハッシュ
 * - ゲストモード
 */

import bcrypt from 'bcryptjs';
import { db } from './kv';
import { generateId } from '../engine/core/id';

// ============================================================
// 定数
// ============================================================

const BCRYPT_ROUNDS = 10;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30日
export const SESSION_COOKIE_NAME = 'koushien_session';

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
// KV キー
// ============================================================

const kvKey = {
  user: (email: string) => `user:${email.toLowerCase()}`,
  userId: (userId: string) => `user_id:${userId}`,
  session: (token: string) => `session:${token}`,
};

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
  const existing = await db.get<UserRecord>(kvKey.user(normalizedEmail));
  if (existing) {
    return { success: false, error: 'このメールアドレスは既に登録されています' };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const userId = generateId();
  const user: UserRecord = {
    id: userId,
    email: normalizedEmail,
    displayName: displayName.trim() || normalizedEmail.split('@')[0],
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  await db.set(kvKey.user(normalizedEmail), user);
  await db.set(kvKey.userId(userId), normalizedEmail);

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
  const user = await db.get<UserRecord>(kvKey.user(normalizedEmail));
  if (!user) {
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }

  return { success: true, user };
}

// ============================================================
// セッション操作
// ============================================================

/**
 * セッション作成（ログインユーザー）
 */
export async function createSession(user: UserRecord): Promise<string> {
  const token = generateId() + generateId().replace(/-/g, '');
  const session: SessionRecord = {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    isGuest: false,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  await db.set(kvKey.session(token), session, { ex: SESSION_TTL_SECONDS });
  return token;
}

/**
 * ゲストセッション作成
 */
export async function createGuestSession(): Promise<string> {
  const guestId = `guest:${generateId()}`;
  const token = generateId() + generateId().replace(/-/g, '');
  const session: SessionRecord = {
    userId: guestId,
    email: '',
    displayName: 'ゲスト',
    isGuest: true,
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  await db.set(kvKey.session(token), session, { ex: SESSION_TTL_SECONDS });
  return token;
}

/**
 * セッション検証
 */
export async function validateSession(token: string): Promise<SessionRecord | null> {
  if (!token) return null;
  const session = await db.get<SessionRecord>(kvKey.session(token));
  if (!session) return null;

  // 期限切れチェック
  if (new Date(session.expiresAt) < new Date()) {
    await db.del(kvKey.session(token));
    return null;
  }

  return session;
}

/**
 * セッション削除（ログアウト）
 */
export async function deleteSession(token: string): Promise<void> {
  await db.del(kvKey.session(token));
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
  const email = await db.get<string>(kvKey.userId(userId));
  if (!email) return null;
  return db.get<UserRecord>(kvKey.user(email));
}
