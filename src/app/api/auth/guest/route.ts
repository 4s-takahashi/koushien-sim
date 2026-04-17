/**
 * POST /api/auth/guest — ゲストセッション作成
 */

import { createGuestSession, buildSessionCookie } from '../../../../lib/auth';

export async function POST() {
  try {
    const token = await createGuestSession();
    return new Response(
      JSON.stringify({ ok: true, displayName: 'ゲスト' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token),
        },
      },
    );
  } catch (err) {
    console.error('[guest]', err);
    return Response.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
