/**
 * GET /api/save — クラウドセーブ一覧取得
 */

import { type NextRequest } from 'next/server';
import { validateSession, extractSessionToken } from '../../../lib/auth';
import { listCloudSavesMeta } from '../../../lib/cloud-save';

export async function GET(request: NextRequest) {
  const token = extractSessionToken(request.headers.get('cookie'));
  const session = token ? await validateSession(token) : null;

  if (!session || session.isGuest) {
    return Response.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const metas = await listCloudSavesMeta(session.userId);
  return Response.json({ saves: metas });
}
