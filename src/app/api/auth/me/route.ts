/**
 * GET /api/auth/me — 現在のユーザー情報
 */

import { type NextRequest } from 'next/server';
import { validateSession, extractSessionToken } from '../../../../lib/auth';

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie');
  const token = extractSessionToken(cookieHeader);

  if (!token) {
    return Response.json({ user: null }, { status: 200 });
  }

  const session = await validateSession(token);
  if (!session) {
    return Response.json({ user: null }, { status: 200 });
  }

  return Response.json({
    user: {
      userId: session.userId,
      email: session.email,
      displayName: session.displayName,
      isGuest: session.isGuest,
    },
  });
}
