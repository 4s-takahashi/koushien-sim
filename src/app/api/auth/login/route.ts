/**
 * POST /api/auth/login — ログイン
 */

import { type NextRequest } from 'next/server';
import { verifyLogin, createSession, buildSessionCookie } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const { email = '', password = '' } = body;

    if (!email || !password) {
      return Response.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 });
    }

    const result = await verifyLogin(email, password);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 401 });
    }

    const token = await createSession(result.user);

    return new Response(
      JSON.stringify({ ok: true, displayName: result.user.displayName }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token),
        },
      },
    );
  } catch (err) {
    console.error('[login]', err);
    return Response.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
