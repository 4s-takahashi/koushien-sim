'use client';

/**
 * SaveLoadPanel — セーブ/ロードパネル UI
 *
 * ホーム画面に「セーブ」ボタンを配置し、このパネルをモーダルで表示する。
 * - 3手動スロット + 自動セーブスロット表示
 * - 上書き確認ダイアログ
 * - ロード確認ダイアログ
 * - ストレージ使用量表示
 */

import { useState, useEffect, useCallback } from 'react';
import { useWorldStore } from '../../stores/world-store';
import { WORLD_SAVE_SLOTS } from '../../engine/save/world-save-manager';
import type { WorldSaveSlotId, WorldSaveSlotMeta } from '../../engine/save/world-save-manager';
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

// ============================================================
// 日時フォーマット
// ============================================================

function formatDate(ts: number): string {
  const d = new Date(ts);
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
// スロットカード
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
// メインパネル
// ============================================================

interface SaveLoadPanelProps {
  onClose: () => void;
  defaultTab?: 'save' | 'load';
}

export function SaveLoadPanel({ onClose, defaultTab = 'save' }: SaveLoadPanelProps) {
  const [tab, setTab] = useState<'save' | 'load'>(defaultTab);
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getMeta = (slotId: WorldSaveSlotId) =>
    saves.find((m) => m.slotId === slotId) ?? null;

  // セーブ確認
  const handleSaveClick = (slotId: WorldSaveSlotId) => {
    const existing = getMeta(slotId);
    setConfirm({ type: 'save', slotId, existingMeta: existing });
  };

  // ロード確認
  const handleLoadClick = (slotId: WorldSaveSlotId) => {
    setConfirm({ type: 'load', slotId });
  };

  // 削除確認
  const handleDeleteClick = (slotId: WorldSaveSlotId) => {
    setConfirm({ type: 'delete', slotId });
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
          if (result.storageWarning) {
            setTimeout(() => setMessage({ type: 'warning', text: result.storageWarning! }), 2000);
          }
        } else {
          setMessage({ type: 'error', text: result.error ?? 'セーブに失敗しました。' });
        }
      } else if (confirm.type === 'load') {
        const result = await loadGame(confirm.slotId);
        if (result.success) {
          setMessage({ type: 'success', text: 'ロードしました。' });
          if (result.checksumMismatch) {
            setMessage({ type: 'warning', text: 'ロード完了（チェックサム不一致 — データが一部破損している可能性があります）。' });
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

  const handleCancel = () => setConfirm(null);

  // ストレージ使用量パーセント（4MB 上限基準）
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

          {/* タブ */}
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

          <div className={styles.body}>
            {/* メッセージ */}
            {message && (
              <div className={
                message.type === 'success' ? styles.messageSuccess
                : message.type === 'warning' ? styles.messageWarning
                : styles.messageError
              }>
                {message.text}
              </div>
            )}

            {/* セーブ不可メッセージ */}
            {tab === 'save' && !hasGame && (
              <div className={styles.messageWarning}>
                ゲームを開始していないためセーブできません。
              </div>
            )}

            {/* 手動スロット */}
            {MANUAL_SLOTS.map(({ id, label }) => (
              <SlotCard
                key={id}
                slotId={id}
                label={label}
                meta={getMeta(id)}
                mode={tab}
                onSave={hasGame ? handleSaveClick : undefined}
                onLoad={handleLoadClick}
                onDelete={handleDeleteClick}
              />
            ))}

            {/* 自動セーブスロット */}
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
                  onLoad={handleLoadClick}
                />
              ))}
            </div>

            {/* ストレージ使用量 */}
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
        </div>
      </div>

      {/* 確認ダイアログ */}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.type === 'save' ? 'セーブの確認'
            : confirm.type === 'load' ? 'ロードの確認'
            : '削除の確認'
          }
          message={
            confirm.type === 'save' && confirm.existingMeta
              ? `「${confirm.existingMeta.displayName}」に上書きします。\n${confirm.existingMeta.schoolName} — ${formatGameDate(confirm.existingMeta.currentDate)}\n\nよろしいですか？`
            : confirm.type === 'save'
              ? 'このスロットにセーブします。よろしいですか？'
            : confirm.type === 'load'
              ? '現在の進行状況は失われます。ロードしますか？'
            : 'このセーブデータを削除します。この操作は取り消せません。'
          }
          confirmLabel={
            confirm.type === 'save' ? 'セーブ'
            : confirm.type === 'load' ? 'ロード'
            : '削除'
          }
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
