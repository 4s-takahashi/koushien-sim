/**
 * middleware.ts — 認証ミドルウェア
 *
 * ルートの保護:
 * - /login, /register, /api/auth/* → 未ログインでもアクセス可
 * - /api/save/* → ログイン必須（401）
 * - / (タイトル画面), /play/* → 未ログインなら /login にリダイレクト
 * - /new-game → 未ログインなら /login にリダイレクト
 *
 * ゲストモードはセッションCookieで管理するため、
 * Cookieが存在する（isGuest=trueを含む）→ ゲストとしてアクセス可
 */

import { type NextRequest, NextResponse } from 'next/server';
// Edge ランタイムで動作するため auth.ts (ioredis/bcrypt 依存) は import しない。
// 定数のみの auth-constants.ts を使う。
import { SESSION_COOKIE_NAME } from './src/lib/auth-constants';

// セッション検証はEdge-compatibleに Cookie の存在のみチェックする
// （Edgeランタイムから KV/bcrypt が使えないため、API Routes で実検証）
function hasSession(request: NextRequest): boolean {
  return !!request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

// 認証不要のパス
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth/',
  '/_next/',
  '/favicon.ico',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// API保護パス（401を返すべきパス）
function isProtectedApi(pathname: string): boolean {
  return pathname.startsWith('/api/save');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的ファイルはスキップ
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // 認証不要パス
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const authenticated = hasSession(request);

  // APIの保護（401）
  if (isProtectedApi(pathname)) {
    if (!authenticated) {
      return Response.json({ error: 'ログインが必要です' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ページの保護（/login リダイレクト）
  if (!authenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 以下を除くすべてのルートにマッチ:
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
