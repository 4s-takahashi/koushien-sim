'use client';

/**
 * SaveLoadPanel — セーブ/ロードパネル UI (Phase 9)
 *
 * タブ構成:
 * - ローカル: 既存の localStorage セーブ
 * - ☁️ クラウド: API 経由のクラウドセーブ（ログインユーザーのみ）
 */

import { useState, useEffect, useCallback } from 'react';
import { useWorldStore } from '../../../stores/world-store';
import { WORLD_SAVE_SLOTS } from '../../../engine/save/world-save-manager';
import type { WorldSaveSlotId, WorldSaveSlotMeta } from '../../../engine/save/world-save-manager';
import type { CloudSaveSlotMeta } from '../../../lib/cloud-save';
import { CLOUD_SAVE_SLOTS } from '../../../lib/cloud-save';
import type { CloudSlotId } from '../../../lib/cloud-save';
import styles from './SaveLoadPanel.module.css';

// ============================================================
// 定数
// ============================================================

const MANUAL_SLOTS: { id: WorldSaveSlotId; label: string }[] = [
  { id: WORLD_SAVE_SLOTS.SLOT_1, label: 'スロット 1' },
  { id: WORLD_SAVE_SLOTS.SLOT_2, label: 'スロット 2' },
  { id: WORLD_SAVE_SLOTS.SLOT_3, label: 'スロット 3' },
];

const AUTO_SLOTS: { id: WorldSaveSlotId; label: string }[] = [
  { id: WORLD_SAVE_SLOTS.AUTO_YEAR,       label: '年度終了前 自動保護' },
  { id: WORLD_SAVE_SLOTS.AUTO_MONTHLY,    label: '月次 自動セーブ' },
  { id: WORLD_SAVE_SLOTS.PRE_TOURNAMENT,  label: '大会前 自動セーブ' },
];

const CLOUD_SLOT_LABELS: Record<CloudSlotId, string> = {
  cloud_1: 'クラウドスロット 1',
  cloud_2: 'クラウドスロット 2',
  cloud_3: 'クラウドスロット 3',
};

// ============================================================
// 日時フォーマット
// ============================================================

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} `
       + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} `
       + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatGameDate(d: { year: number; month: number; day: number }): string {
  return `Year ${d.year} ${d.month}月${d.day}日`;
}

const SEASON_PHASE_LABELS: Record<string, string> = {
  spring_practice: '春季練習',
  summer_tournament: '夏大会',
  koshien: '甲子園',
  post_summer: '夏以降',
  autumn_tournament: '秋大会',
  off_season: 'オフ',
  pre_season: '始動期',
};

// ============================================================
// ローカルスロットカード
// ============================================================

interface SlotCardProps {
  slotId: WorldSaveSlotId;
  label: string;
  meta: WorldSaveSlotMeta | null;
  mode: 'save' | 'load';
  isReadOnly?: boolean;
  onSave?: (slotId: WorldSaveSlotId) => void;
  onLoad?: (slotId: WorldSaveSlotId) => void;
  onDelete?: (slotId: WorldSaveSlotId) => void;
}

function SlotCard({ slotId, label, meta, mode, isReadOnly, onSave, onLoad, onDelete }: SlotCardProps) {
  return (
    <div className={styles.slotCard}>
      <div className={styles.slotIcon}>
        {meta ? '💾' : '📂'}
      </div>
      <div className={styles.slotInfo}>
        <div className={styles.slotName}>{label}</div>
        {meta ? (
          <div className={styles.slotMeta}>
            <div>{meta.schoolName}（{meta.managerName}監督）</div>
            <div>{formatGameDate(meta.currentDate)} — {SEASON_PHASE_LABELS[meta.seasonPhase] ?? meta.seasonPhase}</div>
            <div>{meta.winRate} | 保存: {formatDate(meta.savedAt)}</div>
          </div>
        ) : (
          <div className={styles.slotEmpty}>（空きスロット）</div>
        )}
      </div>
      <div className={styles.slotActions}>
        {mode === 'save' && !isReadOnly && (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onSave?.(slotId)}>
            セーブ
          </button>
        )}
        {mode === 'load' && meta && (
          <button className={`${styles.btn} ${styles.btnAccent}`} onClick={() => onLoad?.(slotId)}>
            ロード
          </button>
        )}
        {meta && !isReadOnly && (
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => onDelete?.(slotId)}>
            削除
          </button>
        )}
        {isReadOnly && meta && mode === 'load' && (
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onLoad?.(slotId)}>
            ロード
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// クラウドスロットカード
// ============================================================

interface CloudSlotCardProps {
  slotId: CloudSlotId;
  label: string;
  meta: CloudSaveSlotMeta | null;
  mode: 'save' | 'load';
  isBusy?: boolean;
  onSave?: (slotId: CloudSlotId) => void;
  onLoad?: (slotId: CloudSlotId) => void;
  onDelete?: (slotId: CloudSlotId) => void;
}

function CloudSlotCard({ slotId, label, meta, mode, isBusy, onSave, onLoad, onDelete }: CloudSlotCardProps) {
  return (
    <div className={styles.slotCard}>
      <div className={styles.slotIcon}>
        {meta ? '☁️' : '📂'}
      </div>
      <div className={styles.slotInfo}>
        <div className={styles.slotName}>{label}</div>
        {meta ? (
          <div className={styles.slotMeta}>
            <div>{meta.schoolName}（{meta.managerName}監督）</div>
            <div>{formatGameDate(meta.currentDate)} — {SEASON_PHASE_LABELS[meta.seasonPhase] ?? meta.seasonPhase}</div>
            <div>保存: {formatIsoDate(meta.savedAt)}</div>
          </div>
        ) : (
          <div className={styles.slotEmpty}>（空きスロット）</div>
        )}
      </div>
      <div className={styles.slotActions}>
        {mode === 'save' && (
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => onSave?.(slotId)}
            disabled={isBusy}
          >
            {isBusy ? '...' : meta ? '上書き' : '保存'}
          </button>
        )}
        {mode === 'load' && meta && (
          <button
            className={`${styles.btn} ${styles.btnAccent}`}
            onClick={() => onLoad?.(slotId)}
            disabled={isBusy}
          >
            {isBusy ? '...' : 'ロード'}
          </button>
        )}
        {meta && (
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => onDelete?.(slotId)}>
            削除
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 確認ダイアログ
// ============================================================

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, confirmLabel = '確認', cancelLabel = 'キャンセル', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className={styles.confirmOverlay}>
      <div className={styles.confirmBox}>
        <div className={styles.confirmTitle}>{title}</div>
        <div className={styles.confirmMessage}>{message}</div>
        <div className={styles.confirmActions}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// クラウドタブコンテンツ
// ============================================================

interface CloudTabContentProps {
  mode: 'save' | 'load';
  hasGame: boolean;
  onClose: () => void;
}

function CloudTabContent({ mode, hasGame, onClose }: CloudTabContentProps) {
  const worldState = useWorldStore((s) => s.worldState);
  const [cloudSaves, setCloudSaves] = useState<CloudSaveSlotMeta[]>([]);
  const [isGuest, setIsGuest] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [busySlot, setBusySlot] = useState<CloudSlotId | null>(null);
  const [confirm, setConfirm] = useState<{
    type: 'save' | 'load' | 'delete';
    slotId: CloudSlotId;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) return;
        const meData = await meRes.json() as { user: { isGuest: boolean } | null };
        if (cancelled) return;
        if (meData.user?.isGuest) { setIsGuest(true); return; }

        const savesRes = await fetch('/api/save');
        if (savesRes.ok) {
          const savesData = await savesRes.json() as { saves: CloudSaveSlotMeta[] };
          if (!cancelled) setCloudSaves(savesData.saves ?? []);
        }
      } catch { /* 無視 */ }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const getMeta = (slotId: CloudSlotId) =>
    cloudSaves.find((m) => m.slotId === slotId) ?? null;

  const handleSave = useCallback(async (slotId: CloudSlotId) => {
    if (!worldState) return;
    setBusySlot(slotId);
    setMessage(null);
    try {
      const { serializeWorldState, computeWorldChecksum } = await import('../../../engine/save/world-serializer');
      const { WORLD_SAVE_VERSION } = await import('../../../engine/save/world-save-manager');
      const playerSchool = worldState.schools.find((s) => s.id === worldState.playerSchoolId);
      const stateJson = serializeWorldState(worldState);
      const checksum = await computeWorldChecksum(stateJson);
      const now = new Date().toISOString();
      const meta: CloudSaveSlotMeta = {
        slotId,
        displayName: CLOUD_SLOT_LABELS[slotId],
        schoolName: playerSchool?.name ?? '不明',
        managerName: worldState.manager.name,
        currentDate: { ...worldState.currentDate },
        seasonPhase: worldState.seasonState.phase,
        savedAt: now,
        version: WORLD_SAVE_VERSION,
      };
      const entry = { slotId, meta, stateJson, checksum, savedAt: now, version: WORLD_SAVE_VERSION };
      const res = await fetch(`/api/save/${slotId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (res.ok) {
        setCloudSaves((prev) => [...prev.filter((m) => m.slotId !== slotId), meta]);
        setMessage({ type: 'success', text: `「${CLOUD_SLOT_LABELS[slotId]}」にクラウドセーブしました。` });
      } else {
        const data = await res.json() as { error?: string };
        setMessage({ type: 'error', text: data.error ?? 'クラウドセーブに失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: 'クラウドセーブ中にエラーが発生しました' });
    } finally {
      setBusySlot(null);
    }
  }, [worldState]);

  const handleLoad = useCallback(async (slotId: CloudSlotId) => {
    setBusySlot(slotId);
    setMessage(null);
    try {
      const res = await fetch(`/api/save/${slotId}`);
      if (!res.ok) { setMessage({ type: 'error', text: 'クラウドセーブの取得に失敗しました' }); return; }
      const data = await res.json() as { entry: { stateJson: string } | null };
      if (!data.entry) { setMessage({ type: 'error', text: 'セーブデータが見つかりません' }); return; }
      const { deserializeWorldState } = await import('../../../engine/save/world-serializer');
      const world = deserializeWorldState(data.entry.stateJson);
      useWorldStore.setState({ worldState: world, recentResults: [], recentNews: [], lastDayResult: null });
      setMessage({ type: 'success', text: 'クラウドからロードしました。' });
      setTimeout(() => onClose(), 800);
    } catch {
      setMessage({ type: 'error', text: 'クラウドロード中にエラーが発生しました' });
    } finally {
      setBusySlot(null);
    }
  }, [onClose]);

  const handleDelete = useCallback(async (slotId: CloudSlotId) => {
    setBusySlot(slotId);
    try {
      const res = await fetch(`/api/save/${slotId}`, { method: 'DELETE' });
      if (res.ok) {
        setCloudSaves((prev) => prev.filter((m) => m.slotId !== slotId));
        setMessage({ type: 'success', text: '削除しました。' });
      }
    } catch { setMessage({ type: 'error', text: '削除に失敗しました' }); }
    finally { setBusySlot(null); }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!confirm) return;
    const { type, slotId } = confirm;
    setConfirm(null);
    if (type === 'save') handleSave(slotId);
    else if (type === 'load') handleLoad(slotId);
    else handleDelete(slotId);
  }, [confirm, handleSave, handleLoad, handleDelete]);

  if (isGuest) {
    return (
      <div className={styles.body}>
        <div className={styles.messageWarning}>
          ☁️ クラウドセーブはアカウント登録後にご利用いただけます。
          <br />
          <a href="/register" style={{ color: 'var(--color-accent)' }}>アカウント登録はこちら</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      {message && (
        <div className={message.type === 'success' ? styles.messageSuccess : message.type === 'warning' ? styles.messageWarning : styles.messageError}>
          {message.text}
        </div>
      )}
      {mode === 'save' && !hasGame && (
        <div className={styles.messageWarning}>ゲームを開始していないためセーブできません。</div>
      )}
      {CLOUD_SAVE_SLOTS.map((slotId) => (
        <CloudSlotCard
          key={slotId}
          slotId={slotId}
          label={CLOUD_SLOT_LABELS[slotId]}
          meta={getMeta(slotId)}
          mode={mode}
          isBusy={busySlot === slotId}
          onSave={(id) => setConfirm({ type: 'save', slotId: id })}
          onLoad={(id) => setConfirm({ type: 'load', slotId: id })}
          onDelete={(id) => setConfirm({ type: 'delete', slotId: id })}
        />
      ))}
      {confirm && (
        <ConfirmDialog
          title={confirm.type === 'save' ? 'クラウドセーブ確認' : confirm.type === 'load' ? 'クラウドロード確認' : '削除確認'}
          message={
            confirm.type === 'save' ? `「${CLOUD_SLOT_LABELS[confirm.slotId]}」にクラウドセーブします。よろしいですか？`
            : confirm.type === 'load' ? '現在の進行状況は失われます。クラウドからロードしますか？'
            : 'このクラウドセーブデータを削除します。この操作は取り消せません。'
          }
          confirmLabel={confirm.type === 'save' ? 'セーブ' : confirm.type === 'load' ? 'ロード' : '削除'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// メインパネル
// ============================================================

interface SaveLoadPanelProps {
  onClose: () => void;
  defaultTab?: 'save' | 'load';
}

export function SaveLoadPanel({ onClose, defaultTab = 'save' }: SaveLoadPanelProps) {
  const [tab, setTab] = useState<'save' | 'load'>(defaultTab);
  const [storageTab, setStorageTab] = useState<'local' | 'cloud'>('local');
  const [saves, setSaves] = useState<WorldSaveSlotMeta[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{
    type: 'save' | 'load' | 'delete';
    slotId: WorldSaveSlotId;
    existingMeta?: WorldSaveSlotMeta | null;
  } | null>(null);
  const [storageBytes, setStorageBytes] = useState(0);

  const worldState = useWorldStore((s) => s.worldState);
  const saveGame = useWorldStore((s) => s.saveGame);
  const loadGame = useWorldStore((s) => s.loadGame);
  const deleteSave = useWorldStore((s) => s.deleteSave);
  const listSaves = useWorldStore((s) => s.listSaves);
  const getStorageUsage = useWorldStore((s) => s.getStorageUsage);

  const refresh = useCallback(() => {
    setSaves(listSaves());
    setStorageBytes(getStorageUsage());
  }, [listSaves, getStorageUsage]);

  useEffect(() => { refresh(); }, [refresh]);

  const getMeta = (slotId: WorldSaveSlotId) => saves.find((m) => m.slotId === slotId) ?? null;

  const handleSaveClick = (slotId: WorldSaveSlotId) => {
    setConfirm({ type: 'save', slotId, existingMeta: getMeta(slotId) });
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    setConfirm(null);
    setMessage(null);
    try {
      if (confirm.type === 'save') {
        const label = MANUAL_SLOTS.find((s) => s.id === confirm.slotId)?.label ?? confirm.slotId;
        const result = await saveGame(confirm.slotId, label);
        if (result.success) {
          setMessage({ type: 'success', text: `「${label}」にセーブしました。` });
          if (result.storageWarning) setTimeout(() => setMessage({ type: 'warning', text: result.storageWarning! }), 2000);
        } else {
          setMessage({ type: 'error', text: result.error ?? 'セーブに失敗しました。' });
        }
      } else if (confirm.type === 'load') {
        const result = await loadGame(confirm.slotId);
        if (result.success) {
          if (result.checksumMismatch) {
            setMessage({ type: 'warning', text: 'ロード完了（チェックサム不一致 — データが一部破損している可能性があります）。' });
          } else {
            setMessage({ type: 'success', text: 'ロードしました。' });
          }
          setTimeout(() => onClose(), 800);
        } else {
          setMessage({ type: 'error', text: result.error ?? 'ロードに失敗しました。' });
        }
      } else if (confirm.type === 'delete') {
        deleteSave(confirm.slotId);
        setMessage({ type: 'success', text: '削除しました。' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: `エラー: ${e instanceof Error ? e.message : String(e)}` });
    }
    refresh();
  };

  const storagePercent = Math.min(100, (storageBytes / (4 * 1024 * 1024)) * 100);
  const hasGame = !!worldState;

  return (
    <>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          {/* ヘッダー */}
          <div className={styles.panelHeader}>
            <span>セーブ / ロード</span>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>

          {/* セーブ/ロード タブ */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${tab === 'save' ? styles.tabActive : ''}`}
              onClick={() => setTab('save')}
            >
              💾 セーブ
            </button>
            <button
              className={`${styles.tab} ${tab === 'load' ? styles.tabActive : ''}`}
              onClick={() => setTab('load')}
            >
              📂 ロード
            </button>
          </div>

          {/* ローカル/クラウド タブ */}
          <div className={styles.tabs} style={{ borderTop: '1px solid var(--color-border)' }}>
            <button
              className={`${styles.tab} ${storageTab === 'local' ? styles.tabActive : ''}`}
              onClick={() => setStorageTab('local')}
            >
              💾 ローカル
            </button>
            <button
              className={`${styles.tab} ${storageTab === 'cloud' ? styles.tabActive : ''}`}
              onClick={() => setStorageTab('cloud')}
            >
              ☁️ クラウド
            </button>
          </div>

          {/* クラウドタブ */}
          {storageTab === 'cloud' && (
            <CloudTabContent mode={tab} hasGame={hasGame} onClose={onClose} />
          )}

          {/* ローカルタブ */}
          {storageTab === 'local' && (
            <div className={styles.body}>
              {message && (
                <div className={message.type === 'success' ? styles.messageSuccess : message.type === 'warning' ? styles.messageWarning : styles.messageError}>
                  {message.text}
                </div>
              )}
              {tab === 'save' && !hasGame && (
                <div className={styles.messageWarning}>ゲームを開始していないためセーブできません。</div>
              )}
              {MANUAL_SLOTS.map(({ id, label }) => (
                <SlotCard
                  key={id}
                  slotId={id}
                  label={label}
                  meta={getMeta(id)}
                  mode={tab}
                  onSave={hasGame ? handleSaveClick : undefined}
                  onLoad={(slotId) => setConfirm({ type: 'load', slotId })}
                  onDelete={(slotId) => setConfirm({ type: 'delete', slotId })}
                />
              ))}
              <div className={styles.autoSaveSection}>
                <div className={styles.autoSaveTitle}>自動セーブ（読み取り専用）</div>
                {AUTO_SLOTS.map(({ id, label }) => (
                  <SlotCard
                    key={id}
                    slotId={id}
                    label={label}
                    meta={getMeta(id)}
                    mode={tab}
                    isReadOnly={true}
                    onLoad={(slotId) => setConfirm({ type: 'load', slotId })}
                  />
                ))}
              </div>
              <div className={styles.storageBar}>
                <span>ストレージ</span>
                <div className={styles.storageBarInner}>
                  <div
                    className={`${styles.storageBarFill} ${storagePercent > 75 ? styles.storageBarWarn : ''}`}
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
                <span>{Math.round(storageBytes / 1024)}KB / 4MB</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ローカル確認ダイアログ */}
      {confirm && storageTab === 'local' && (
        <ConfirmDialog
          title={confirm.type === 'save' ? 'セーブの確認' : confirm.type === 'load' ? 'ロードの確認' : '削除の確認'}
          message={
            confirm.type === 'save' && confirm.existingMeta
              ? `「${confirm.existingMeta.displayName}」に上書きします。\n${confirm.existingMeta.schoolName} — ${formatGameDate(confirm.existingMeta.currentDate)}\n\nよろしいですか？`
            : confirm.type === 'save' ? 'このスロットにセーブします。よろしいですか？'
            : confirm.type === 'load' ? '現在の進行状況は失われます。ロードしますか？'
            : 'このセーブデータを削除します。この操作は取り消せません。'
          }
          confirmLabel={confirm.type === 'save' ? 'セーブ' : confirm.type === 'load' ? 'ロード' : '削除'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
