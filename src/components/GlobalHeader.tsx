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
 */

import { useState } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../stores/world-store';
import { SaveLoadPanel } from '../app/play/save/SaveLoadPanel';
import styles from './GlobalHeader.module.css';

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
              className={styles.iconBtn}
              onClick={() => setShowMenu(!showMenu)}
              aria-label="メニュー"
              title="メニュー"
              aria-expanded={showMenu}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* サブメニュー (ナビゲーションドロワー) */}
      {showMenu && (
        <div className={styles.menuOverlay} onClick={() => setShowMenu(false)}>
          <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
            <Link href="/play" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              🏠 ホーム
            </Link>
            <Link href="/play/team" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              👥 チーム
            </Link>
            <Link href="/play/tournament" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              🏆 大会
            </Link>
            <Link href="/play/results" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              📊 戦績
            </Link>
            <Link href="/play/news" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              📰 ニュース
            </Link>
            <Link href="/play/scout" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              🔍 スカウト
            </Link>
            <Link href="/play/ob" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              🎓 OB
            </Link>
            <Link href="/play/practice" className={styles.menuItem} onClick={() => setShowMenu(false)}>
              ⚾ 練習
            </Link>
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
