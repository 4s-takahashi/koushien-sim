'use client';

/**
 * GlobalHeader — /play 配下全画面で共通の固定ヘッダー
 *
 * 高さは画面遷移で変わらない (desktop 56px / mobile 48px)。
 * 右端には セーブ/ロード ボタン + メニューボタン。
 * モバイルでは文字情報を圧縮してタイトルと日付だけ表示。
 *
 * 子画面で追加情報を出したい場合は title prop で上書き可能。
 *
 * (2026-04-19 Issue #2 対応: 画面ごとのヘッダー高さ不一致を解消)
 * (v0.43.0: 練習・スタッフをヘッダーナビに追加、バッジ通知)
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../stores/world-store';
import { SaveLoadPanel } from '../app/play/save/SaveLoadPanel';
import styles from './GlobalHeader.module.css';

// ── バッジコンポーネント ──────────────────────────────────────

interface MenuBadgeProps {
  count: number;
}

function MenuBadge({ count }: MenuBadgeProps) {
  if (count <= 0) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      background: '#e53935',
      color: '#fff',
      fontSize: 11,
      fontWeight: 'bold',
      padding: '0 4px',
      marginLeft: 4,
      lineHeight: 1,
      verticalAlign: 'middle',
      flexShrink: 0,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ── ハンバーガーメニュー内のバッジ付きアイテム ──────────────────

interface MenuLinkItemProps {
  href: string;
  label: string;
  badge?: number;
  onClick: () => void;
}

function MenuLinkItem({ href, label, badge, onClick }: MenuLinkItemProps) {
  return (
    <Link href={href} className={styles.menuItem} onClick={onClick}>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && badge > 0 && (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 20,
          height: 20,
          borderRadius: 10,
          background: '#e53935',
          color: '#fff',
          fontSize: 11,
          fontWeight: 'bold',
          padding: '0 4px',
          lineHeight: 1,
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export interface GlobalHeaderProps {
  /** 画面ごとのサブタイトル (省略時は自校名) */
  title?: string;
  /** 追加の右上エリア (必要な画面だけ使う) */
  rightSlot?: React.ReactNode;
}

export default function GlobalHeader({ title, rightSlot }: GlobalHeaderProps) {
  const worldState = useWorldStore((s) => s.worldState);
  const hasHydrated = useWorldStore((s) => s._hasHydrated);
  const getHomeView = useWorldStore((s) => s.getHomeView);

  const [showSave, setShowSave] = useState<false | 'save' | 'load'>(false);
  const [showMenu, setShowMenu] = useState(false);

  // バッジ用カウント計算
  const badgeCounts = useMemo(() => {
    if (!worldState) return { practice: 0, staff: 0, match: 0 };

    const playerSchool = worldState.schools?.find((s) => s.id === worldState.playerSchoolId);
    const players = playerSchool?.players ?? [];

    // 練習: 個別練習未設定の選手数
    const practiceBadge = players.filter((p) => !p.restOverride && !(p as unknown as Record<string, unknown>).individualMenu).length;

    // スタッフ: 役割未割り当てのマネージャー数（staffが未初期化なら0）
    const staff = worldState.managerStaff;
    const staffBadge = staff ? Math.max(0, staff.maxMembers - staff.members.length) : 0;

    // 試合: 次の試合までの日数（大会期間中のみ、14日以内）
    const homeView = getHomeView?.();
    let matchBadge = 0;
    if (homeView?.tournament?.nextMatchDaysAway !== undefined && homeView.tournament.nextMatchDaysAway <= 14) {
      matchBadge = homeView.tournament.nextMatchDaysAway;
    }

    return { practice: practiceBadge, staff: staffBadge, match: matchBadge };
  }, [worldState, getHomeView]);

  // Hydrate 前は最小表示
  if (!hasHydrated || !worldState) {
    return (
      <header className={styles.header}>
        <div className={styles.inner}>
          <span className={styles.title}>高校野球デイズ</span>
        </div>
      </header>
    );
  }

  const view = getHomeView();
  const displayTitle = title ?? view?.team.schoolName ?? '高校野球デイズ';
  const dateText = view?.date.japaneseDisplay ?? '';
  const phaseLabel = view?.seasonPhaseLabel ?? '';

  return (
    <>
      <header className={styles.header} data-testid="global-header">
        <div className={styles.inner}>
          <Link href="/play" className={styles.titleLink}>
            <span className={styles.title}>{displayTitle}</span>
            {phaseLabel && <span className={styles.phase}>{phaseLabel}</span>}
          </Link>

          {/* デスクトップ用クイックナビ (中央) */}
          <nav className={styles.quickNav}>
            <Link href="/play/practice" className={styles.quickNavLink}>
              ⚾ 練習
              <MenuBadge count={badgeCounts.practice} />
            </Link>
            <Link href="/play/staff" className={styles.quickNavLink}>
              👩‍💼 スタッフ
              <MenuBadge count={badgeCounts.staff} />
            </Link>
            {badgeCounts.match > 0 && (
              <Link href="/play/tournament" className={styles.quickNavLink}>
                🏆 試合
                <MenuBadge count={badgeCounts.match} />
              </Link>
            )}
          </nav>

          <div className={styles.meta}>
            {dateText && <span className={styles.date}>{dateText}</span>}
            {rightSlot}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setShowSave('save')}
              aria-label="セーブ"
              title="セーブ"
            >
              💾
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setShowSave('load')}
              aria-label="ロード"
              title="ロード"
            >
              📂
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.menuBtn}`}
              onClick={() => setShowMenu(!showMenu)}
              aria-label="メニュー"
              title="メニュー"
              aria-expanded={showMenu}
            >
              ☰
              {(badgeCounts.practice > 0 || badgeCounts.staff > 0 || badgeCounts.match > 0) && (
                <span className={styles.menuBtnBadge} />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* サブメニュー (ナビゲーションドロワー) */}
      {showMenu && (
        <div className={styles.menuOverlay} onClick={() => setShowMenu(false)}>
          <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
            <MenuLinkItem href="/play" label="🏠 ホーム" onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/team" label="👥 チーム" onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/tournament" label="🏆 大会" badge={badgeCounts.match} onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/results" label="📊 戦績" onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/news" label="📰 ニュース" onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/scout" label="🔍 スカウト" onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/ob" label="🎓 OB" onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/practice" label="⚾ 練習" badge={badgeCounts.practice} onClick={() => setShowMenu(false)} />
            <MenuLinkItem href="/play/staff" label="👩‍💼 スタッフ" badge={badgeCounts.staff} onClick={() => setShowMenu(false)} />
          </div>
        </div>
      )}

      {/* セーブ/ロードモーダル */}
      {showSave && (
        <SaveLoadPanel
          defaultTab={showSave}
          onClose={() => setShowSave(false)}
        />
      )}
    </>
  );
}
