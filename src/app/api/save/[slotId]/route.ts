/**
 * GET    /api/save/:slotId — セーブデータ取得
 * POST   /api/save/:slotId — セーブデータ保存
 * DELETE /api/save/:slotId — セーブデータ削除
 */

import { type NextRequest } from 'next/server';
import { validateSession, extractSessionToken } from '../../../../lib/auth';
import {
  cloudSave,
  cloudLoad,
  cloudDelete,
  CLOUD_SAVE_SLOTS,
  type CloudSlotId,
  type CloudSaveEntry,
} from '../../../../lib/cloud-save';

function isValidSlotId(id: string): id is CloudSlotId {
  return (CLOUD_SAVE_SLOTS as readonly string[]).includes(id);
}

// ----------------------------------------------------------------
// GET — ロード
// ----------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slotId: string }> },
) {
  const token = extractSessionToken(request.headers.get('cookie'));
  const session = token ? await validateSession(token) : null;
  if (!session || session.isGuest) {
    return Response.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const { slotId } = await params;
  if (!isValidSlotId(slotId)) {
    return Response.json({ error: '無効なスロットIDです' }, { status: 400 });
  }

  const entry = await cloudLoad(session.userId, slotId);
  if (!entry) {
    return Response.json({ entry: null }, { status: 200 });
  }
  return Response.json({ entry });
}

// ----------------------------------------------------------------
// POST — セーブ
// ----------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slotId: string }> },
) {
  const token = extractSessionToken(request.headers.get('cookie'));
  const session = token ? await validateSession(token) : null;
  if (!session || session.isGuest) {
    return Response.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const { slotId } = await params;
  if (!isValidSlotId(slotId)) {
    return Response.json({ error: '無効なスロットIDです' }, { status: 400 });
  }

  let body: CloudSaveEntry;
  try {
    body = await request.json() as CloudSaveEntry;
  } catch {
    return Response.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }

  // stateJson の最大サイズチェック（5MB）
  if (body.stateJson && body.stateJson.length > 5 * 1024 * 1024) {
    return Response.json({ error: 'セーブデータが大きすぎます（上限: 5MB）' }, { status: 413 });
  }

  await cloudSave(session.userId, slotId, { ...body, slotId });
  return Response.json({ ok: true });
}

// ----------------------------------------------------------------
// DELETE — 削除
// ----------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slotId: string }> },
) {
  const token = extractSessionToken(request.headers.get('cookie'));
  const session = token ? await validateSession(token) : null;
  if (!session || session.isGuest) {
    return Response.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const { slotId } = await params;
  if (!isValidSlotId(slotId)) {
    return Response.json({ error: '無効なスロットIDです' }, { status: 400 });
  }

  await cloudDelete(session.userId, slotId);
  return Response.json({ ok: true });
}
