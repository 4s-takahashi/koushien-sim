/**
 * POST /api/auth/register — 新規ユーザー登録
 */

import { type NextRequest } from 'next/server';
import { registerUser, createSession, buildSessionCookie } from '../../../../lib/auth';

// バリデーション
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'パスワードは8文字以上で入力してください';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      email?: string;
      password?: string;
      displayName?: string;
    };

    const { email = '', password = '', displayName = '' } = body;

    // バリデーション
    if (!email || !validateEmail(email)) {
      return Response.json({ error: 'メールアドレスの形式が正しくありません' }, { status: 400 });
    }
    const pwError = validatePassword(password);
    if (pwError) {
      return Response.json({ error: pwError }, { status: 400 });
    }

    // 登録
    const result = await registerUser(email, password, displayName);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 409 });
    }

    // セッション作成（仮のUserRecord）
    const userRecord = {
      id: result.userId,
      email: email.toLowerCase().trim(),
      displayName: displayName.trim() || email.split('@')[0],
      passwordHash: '',
      createdAt: new Date().toISOString(),
    };
    const token = await createSession(userRecord);

    return new Response(
      JSON.stringify({ ok: true, displayName: userRecord.displayName }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token),
        },
      },
    );
  } catch (err) {
    console.error('[register]', err);
    return Response.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
