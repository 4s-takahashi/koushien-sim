/**
 * Phase 9 — 認証ユーティリティ テスト
 *
 * Prisma クライアントを vi.mock でモックして、DB 不要でテストする。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ────────────────────────────────────────────────────────────────
// Prisma クライアントのモック
// vi.mock はファイルのトップに巻き上げられるため、
// vi.hoisted() でモック変数を先に宣言する。
// ────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => {
  // インメモリストレージ
  const users = new Map<string, {
    id: string; email: string; displayName: string; passwordHash: string; createdAt: Date;
  }>();
  const sessions = new Map<string, {
    token: string; userId: string; expiresAt: Date; createdAt: Date;
  }>();

  return {
    _users: users,
    _sessions: sessions,
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return users.get(where.email) ?? null;
        if (where.id) {
          for (const u of users.values()) {
            if (u.id === where.id) return u;
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: { id: string; email: string; displayName: string; passwordHash: string } }) => {
        const record = { ...data, createdAt: new Date() };
        users.set(data.email, record);
        return record;
      }),
    },
    session: {
      findUnique: vi.fn(async ({ where, include }: { where: { token: string }; include?: { user?: boolean } }) => {
        const s = sessions.get(where.token);
        if (!s) return null;
        if (include?.user) {
          const u = [...users.values()].find(u => u.id === s.userId);
          if (!u) return null;
          return { ...s, user: u };
        }
        return s;
      }),
      create: vi.fn(async ({ data }: { data: { token: string; userId: string; expiresAt: Date } }) => {
        const record = { ...data, createdAt: new Date() };
        sessions.set(data.token, record);
        return record;
      }),
      delete: vi.fn(async ({ where }: { where: { token: string } }) => {
        sessions.delete(where.token);
      }),
    },
  };
});

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// prisma.ts の fail-fast チェックをスキップするため DATABASE_URL を設定
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';

import {
  registerUser,
  verifyLogin,
  createSession,
  validateSession,
  deleteSession,
  extractSessionToken,
  buildSessionCookie,
  buildClearCookie,
  SESSION_COOKIE_NAME,
} from '../../src/lib/auth';

describe('extractSessionToken', () => {
  it('正しい Cookie ヘッダーからトークンを抽出できる', () => {
    const token = extractSessionToken(`${SESSION_COOKIE_NAME}=mytoken123`);
    expect(token).toBe('mytoken123');
  });

  it('複数の Cookie がある場合も正しく抽出できる', () => {
    const token = extractSessionToken(`other=foo; ${SESSION_COOKIE_NAME}=abc123; another=bar`);
    expect(token).toBe('abc123');
  });

  it('Cookie が存在しない場合は null を返す', () => {
    expect(extractSessionToken(null)).toBeNull();
    expect(extractSessionToken('')).toBeNull();
  });

  it('該当 Cookie がない場合は null を返す', () => {
    expect(extractSessionToken('other=value; unrelated=data')).toBeNull();
  });
});

describe('buildSessionCookie', () => {
  it('HttpOnly, Path=/ を含む Cookie 文字列を生成する', () => {
    const cookie = buildSessionCookie('testtoken');
    expect(cookie).toContain('koushien_session=testtoken');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('カスタム maxAge を指定できる', () => {
    const cookie = buildSessionCookie('token', 3600);
    expect(cookie).toContain('Max-Age=3600');
  });
});

describe('buildClearCookie', () => {
  it('Max-Age=0 の Cookie を生成する', () => {
    const cookie = buildClearCookie();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain(SESSION_COOKIE_NAME);
  });
});

describe('registerUser / verifyLogin', () => {
  beforeEach(() => {
    mockPrisma._users.clear();
    mockPrisma._sessions.clear();
    // モック関数の実装をリセット（vi.fn() の呼び出し回数だけクリア）
    vi.clearAllMocks();
    // モック実装を再設定（clearAllMocks で実装は消えない）
  });

  it('新規ユーザーを登録できる', async () => {
    const result = await registerUser('test@example.com', 'password123', 'テストユーザー');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.userId).toBeTruthy();
    }
  });

  it('同じメールで2回登録するとエラーになる', async () => {
    await registerUser('dup@example.com', 'password123', 'User1');
    const result2 = await registerUser('dup@example.com', 'password456', 'User2');
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error).toContain('既に登録');
    }
  });

  it('メールは小文字に正規化される', async () => {
    await registerUser('Upper@Example.COM', 'password123', 'UpperUser');
    const result = await verifyLogin('upper@example.com', 'password123');
    expect(result.success).toBe(true);
  });

  it('正しいパスワードでログインできる', async () => {
    await registerUser('login@example.com', 'correctpass', 'ログインユーザー');
    const result = await verifyLogin('login@example.com', 'correctpass');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.user.email).toBe('login@example.com');
    }
  });

  it('間違ったパスワードではログインできない', async () => {
    await registerUser('fail@example.com', 'correctpass', 'User');
    const result = await verifyLogin('fail@example.com', 'wrongpass');
    expect(result.success).toBe(false);
  });

  it('存在しないユーザーはログインできない', async () => {
    const result = await verifyLogin('notexist@example.com', 'anypass');
    expect(result.success).toBe(false);
  });
});

describe('createSession / validateSession / deleteSession', () => {
  beforeEach(() => {
    mockPrisma._users.clear();
    mockPrisma._sessions.clear();
    vi.clearAllMocks();
  });

  it('セッションを作成・検証できる', async () => {
    const regResult = await registerUser('sess@example.com', 'password123', 'セッションUser');
    expect(regResult.success).toBe(true);
    const loginResult = await verifyLogin('sess@example.com', 'password123');
    expect(loginResult.success).toBe(true);
    if (!loginResult.success) return;

    const token = await createSession(loginResult.user);
    expect(token).toBeTruthy();

    const session = await validateSession(token);
    expect(session).not.toBeNull();
    expect(session?.email).toBe('sess@example.com');
    expect(session?.isGuest).toBe(false);
  });

  it('削除後はセッションが無効になる', async () => {
    const regResult = await registerUser('del@example.com', 'password123', 'DelUser');
    expect(regResult.success).toBe(true);
    const loginResult = await verifyLogin('del@example.com', 'password123');
    if (!loginResult.success) return;

    const token = await createSession(loginResult.user);
    await deleteSession(token);
    const session = await validateSession(token);
    expect(session).toBeNull();
  });

  it('存在しないトークンは null を返す', async () => {
    const session = await validateSession('nonexistent-token');
    expect(session).toBeNull();
  });

  it('空文字列トークンは null を返す', async () => {
    const session = await validateSession('');
    expect(session).toBeNull();
  });

  it('ゲストセッションを作成・検証できる', async () => {
    const { createGuestSession } = await import('../../src/lib/auth');
    const token = await createGuestSession();
    expect(token.startsWith('guest:')).toBe(true);

    const session = await validateSession(token);
    expect(session).not.toBeNull();
    expect(session?.isGuest).toBe(true);
    expect(session?.displayName).toBe('ゲスト');
  });
});
