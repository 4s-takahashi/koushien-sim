'use client';

/**
 * / — タイトル画面
 *
 * ログイン後のメイン画面。
 * セーブデータの有無で表示を変える:
 * - セーブデータあり → セーブ一覧 + 「続きから遊ぶ」
 * - なし → 「新規プレイ」ボタンのみ
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../stores/world-store';
import { listWorldSaves } from '../engine/save/world-save-manager';
import type { WorldSaveSlotMeta } from '../engine/save/world-save-manager';
import type { CloudSaveSlotMeta } from '../lib/cloud-save';
import styles from './page.module.css';

// ============================================================
// 日時フォーマット
// ============================================================

function formatSavedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} `
       + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatCloudSavedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} `
       + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ============================================================
// セーブカード（ローカル）
// ============================================================

interface LocalSaveCardProps {
  meta: WorldSaveSlotMeta;
  onLoad: (slotId: string) => void;
}

function LocalSaveCard({ meta, onLoad }: LocalSaveCardProps) {
  return (
    <div className={styles.saveCard}>
      <div className={styles.saveIcon}>🏫</div>
      <div className={styles.saveInfo}>
        <div className={styles.saveName}>
          {meta.schoolName}
          <span className={styles.localSaveBadge}>ローカル</span>
        </div>
        <div className={styles.saveMeta}>
          <div>{meta.managerName}監督</div>
          <div>
            Year {meta.currentDate.year} {meta.currentDate.month}月{meta.currentDate.day}日
          </div>
          <div>最終保存: {formatSavedAt(meta.savedAt)}</div>
        </div>
      </div>
      <div className={styles.saveActions}>
        <button className={styles.btnContinue} onClick={() => onLoad(meta.slotId)}>
          続きから
        </button>
      </div>
    </div>
  );
}

// ============================================================
// セーブカード（クラウド）
// ============================================================

interface CloudSaveCardProps {
  meta: CloudSaveSlotMeta;
  onLoad: (slotId: string) => void;
}

function CloudSaveCard({ meta, onLoad }: CloudSaveCardProps) {
  return (
    <div className={styles.saveCard}>
      <div className={styles.saveIcon}>☁️</div>
      <div className={styles.saveInfo}>
        <div className={styles.saveName}>{meta.schoolName}</div>
        <div className={styles.saveMeta}>
          <div>{meta.managerName}監督</div>
          <div>
            Year {meta.currentDate.year} {meta.currentDate.month}月{meta.currentDate.day}日
          </div>
          <div>最終保存: {formatCloudSavedAt(meta.savedAt)}</div>
        </div>
      </div>
      <div className={styles.saveActions}>
        <button className={styles.btnContinue} onClick={() => onLoad(meta.slotId)}>
          続きから
        </button>
      </div>
    </div>
  );
}

// ============================================================
// タイトル画面本体
// ============================================================

interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
  isGuest: boolean;
}

export default function TitlePage() {
  const router = useRouter();
  const loadGame = useWorldStore((s) => s.loadGame);
  const newWorldGame = useWorldStore((s) => s.newWorldGame);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [localSaves, setLocalSaves] = useState<WorldSaveSlotMeta[]>([]);
  const [cloudSaves, setCloudSaves] = useState<CloudSaveSlotMeta[]>([]);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingCloudSaves, setIsLoadingCloudSaves] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // ユーザー情報取得
  useEffect(() => {
    let cancelled = false;
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json() as { user: AuthUser | null };
        if (!cancelled) {
          setAuthUser(data.user);
        }
      } catch {
        // 取得失敗は無視
      } finally {
        if (!cancelled) setIsLoadingUser(false);
      }
    }
    fetchUser();
    return () => { cancelled = true; };
  }, []);

  // ローカルセーブ取得
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saves = listWorldSaves();
    // 手動スロットのみ（AUTO 系除外）
    setLocalSaves(saves.filter((m) => m.slotId.startsWith('world_slot_')));
  }, []);

  // クラウドセーブ取得（ログインユーザーのみ）
  useEffect(() => {
    if (!authUser || authUser.isGuest) return;
    let cancelled = false;
    async function fetchCloudSaves() {
      setIsLoadingCloudSaves(true);
      try {
        const res = await fetch('/api/save');
        if (res.ok) {
          const data = await res.json() as { saves: CloudSaveSlotMeta[] };
          if (!cancelled) setCloudSaves(data.saves ?? []);
        }
      } catch {
        // 取得失敗は無視
      } finally {
        if (!cancelled) setIsLoadingCloudSaves(false);
      }
    }
    fetchCloudSaves();
    return () => { cancelled = true; };
  }, [authUser]);

  // ローカルセーブからロード
  const handleLocalLoad = useCallback(async (slotId: string) => {
    setLoadingMessage('ロード中...');
    const result = await loadGame(slotId as Parameters<typeof loadGame>[0]);
    if (result.success) {
      router.push('/play');
    } else {
      setLoadingMessage('');
      alert(result.error ?? 'ロードに失敗しました');
    }
  }, [loadGame, router]);

  // クラウドセーブからロード
  const handleCloudLoad = useCallback(async (slotId: string) => {
    setLoadingMessage('クラウドからロード中...');
    try {
      const res = await fetch(`/api/save/${slotId}`);
      if (!res.ok) {
        setLoadingMessage('');
        alert('クラウドセーブの取得に失敗しました');
        return;
      }
      const data = await res.json() as { entry: { stateJson: string } | null };
      if (!data.entry) {
        setLoadingMessage('');
        alert('セーブデータが見つかりません');
        return;
      }

      // stateJson を world-store にロード
      const { deserializeWorldState } = await import('../engine/save/world-serializer');
      const world = deserializeWorldState(data.entry.stateJson);
      useWorldStore.setState({
        worldState: world,
        recentResults: [],
        recentNews: [],
        lastDayResult: null,
      });
      router.push('/play');
    } catch {
      setLoadingMessage('');
      alert('クラウドセーブのロードに失敗しました');
    }
  }, [router]);

  // ログアウト
  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }, [router]);

  if (isLoadingUser) {
    return <div className={styles.loading}>読み込み中...</div>;
  }

  if (loadingMessage) {
    return <div className={styles.loading}>{loadingMessage}</div>;
  }

  const hasSaveData = localSaves.length > 0 || cloudSaves.length > 0;

  return (
    <div className={styles.page}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <span className={styles.logoIcon}>⚾</span>
        <div className={styles.title}>高校野球デイズ</div>
        <div className={styles.subtitle}>夢の甲子園を目指せ！</div>
      </div>

      {/* ユーザー情報バー */}
      {authUser && (
        <div className={styles.userBar}>
          <span className={styles.userName}>
            {authUser.isGuest ? 'ゲスト' : authUser.displayName} さん
          </span>
          {authUser.isGuest ? (
            <span className={styles.guestBadge}>ゲストモード</span>
          ) : (
            <span className={styles.userBadge}>ログイン中</span>
          )}
        </div>
      )}

      {/* クラウドセーブ一覧 */}
      {!authUser?.isGuest && cloudSaves.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>☁️ クラウドセーブ</div>
          {cloudSaves.map((meta) => (
            <CloudSaveCard key={meta.slotId} meta={meta} onLoad={handleCloudLoad} />
          ))}
        </div>
      )}

      {/* ローカルセーブ一覧 */}
      {localSaves.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>💾 ローカルセーブ</div>
          {localSaves.map((meta) => (
            <LocalSaveCard key={meta.slotId} meta={meta} onLoad={handleLocalLoad} />
          ))}
        </div>
      )}

      {/* メインアクション */}
      <div className={styles.mainActions}>
        <button
          className={styles.btnNewGame}
          onClick={() => router.push('/new-game')}
        >
          🆕 新規プレイ
        </button>
        <button className={styles.btnLogout} onClick={handleLogout}>
          📤 ログアウト
        </button>
      </div>
    </div>
  );
}
