/**
 * POST /api/auth/logout — ログアウト
 */

import { type NextRequest } from 'next/server';
import { deleteSession, extractSessionToken, buildClearCookie, SESSION_COOKIE_NAME } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie');
  const token = extractSessionToken(cookieHeader);

  if (token) {
    await deleteSession(token);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildClearCookie(),
    },
  });
}
