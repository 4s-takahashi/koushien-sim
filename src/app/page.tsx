'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../stores/world-store';
import type { HomeViewState } from '../ui/projectors/view-state-types';
import type { PracticeMenuId } from '../engine/types/calendar';
import { SaveLoadPanel } from './save/SaveLoadPanel';
import styles from './page.module.css';

// ============================================================
// 練習メニューの定義
// ============================================================

const PRACTICE_MENUS: { id: PracticeMenuId; label: string }[] = [
  { id: 'batting_basic',    label: '基礎打撃練習' },
  { id: 'batting_live',     label: '実戦打撃練習' },
  { id: 'pitching_basic',   label: '投球基礎練習' },
  { id: 'pitching_bullpen', label: '投手ブルペン強化' },
  { id: 'fielding_drill',   label: '守備練習' },
  { id: 'running',          label: '走塁・体力練習' },
  { id: 'rest',             label: '休養（疲労回復）' },
];

// ============================================================
// セットアップフォーム
// ============================================================

function SetupScreen({ onStart }: { onStart: (name: string, pref: string, manager: string) => void }) {
  const [schoolName, setSchoolName] = useState('桜葉高校');
  const [prefecture, setPrefecture] = useState('新潟');
  const [managerName, setManagerName] = useState('監督');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (schoolName.trim() && prefecture.trim() && managerName.trim()) {
      onStart(schoolName.trim(), prefecture.trim(), managerName.trim());
    }
  };

  return (
    <div className={styles.setupScreen}>
      <h1 className={styles.setupTitle}>甲子園への道</h1>
      <p className={styles.setupSubtitle}>高校野球シミュレーター — 夢の甲子園を目指せ</p>
      <form className={styles.setupForm} onSubmit={handleSubmit}>
        <div>
          <label className={styles.formLabel}>学校名</label>
          <input
            className={styles.formInput}
            type="text"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="例：桜葉高校"
            required
          />
        </div>
        <div>
          <label className={styles.formLabel}>都道府県</label>
          <input
            className={styles.formInput}
            type="text"
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            placeholder="例：新潟"
            required
          />
        </div>
        <div>
          <label className={styles.formLabel}>監督名</label>
          <input
            className={styles.formInput}
            type="text"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="例：山田太郎"
            required
          />
        </div>
        <button type="submit" className={styles.setupBtn}>ゲーム開始</button>
      </form>
    </div>
  );
}

// ============================================================
// ホーム画面本体
// ============================================================

function HomeContent({ view }: { view: HomeViewState }) {
  const advanceDay = useWorldStore((s) => s.advanceDay);
  const advanceWeek = useWorldStore((s) => s.advanceWeek);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<PracticeMenuId>('batting_basic');
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveTab, setSaveTab] = useState<'save' | 'load'>('save');

  const handleAdvanceDay = useCallback(() => {
    setIsAdvancing(true);
    try {
      advanceDay(selectedMenu);
    } finally {
      setIsAdvancing(false);
    }
  }, [advanceDay, selectedMenu]);

  const handleAdvanceWeek = useCallback(() => {
    setIsAdvancing(true);
    try {
      advanceWeek(selectedMenu);
    } finally {
      setIsAdvancing(false);
    }
  }, [advanceWeek, selectedMenu]);

  return (
    <div className={styles.page}>
      {/* セーブ/ロードパネル */}
      {showSavePanel && (
        <SaveLoadPanel
          defaultTab={saveTab}
          onClose={() => setShowSavePanel(false)}
        />
      )}

      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>{view.team.schoolName}</span>
          <div className={styles.headerMeta}>
            <div>{view.date.japaneseDisplay}</div>
            <div>
              <span className={styles.phaseBadge}>{view.seasonPhaseLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                onClick={() => { setSaveTab('save'); setShowSavePanel(true); }}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 3,
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)',
                  color: '#fff', cursor: 'pointer',
                }}
              >
                💾 セーブ
              </button>
              <button
                onClick={() => { setSaveTab('load'); setShowSavePanel(true); }}
                style={{
                  padding: '3px 10px', fontSize: 11, borderRadius: 3,
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.4)',
                  color: '#fff', cursor: 'pointer',
                }}
              >
                📂 ロード
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ナビゲーション */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={`${styles.navLink} ${styles.navLinkActive}`}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
          <Link href="/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/tournament" className={styles.navLink}>大会</Link>
          <Link href="/results" className={styles.navLink}>試合結果</Link>
          <Link href="/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      {/* 大会シーズン中バナー */}
      {view.isInTournamentSeason && (
        <div className={styles.tournamentBanner}>
          🏆 大会進行中 — {view.seasonPhaseLabel}開催中！全力で勝利を目指せ
        </div>
      )}

      {/* メインコンテンツ */}
      <main className={styles.main}>

        {/* 今日やること + アクションボタン */}
        <div className={`${styles.card} ${styles.cardFull} ${styles.todayCard}`}>
          <div className={styles.cardTitle}>今日やること</div>
          <div className={styles.todayRow}>
            <div className={styles.todayTask}>
              <span className={`${styles.taskBadge} ${
                view.todayTask.type === 'match' ? styles.taskBadgeMatch
                : view.todayTask.type === 'off'  ? styles.taskBadgeOff
                : view.todayTask.type === 'scout' ? styles.taskBadgeScout
                : styles.taskBadgePractice
              }`}>
                {view.todayTask.type === 'match'    ? '⚾ 試合日'
                 : view.todayTask.type === 'off'    ? '💤 休養日'
                 : view.todayTask.type === 'scout'  ? '🔍 スカウト'
                 : '🏋 練習日'}
              </span>
              <span className={styles.todayDetail}>{view.todayTask.detail}</span>
            </div>

            {/* 練習メニュー選択 + 進行ボタン */}
            <div className={styles.actions}>
              <div className={styles.menuRow}>
                <label className={styles.menuLabel}>練習メニュー：</label>
                <select
                  className={styles.menuSelect}
                  value={selectedMenu}
                  onChange={(e) => setSelectedMenu(e.target.value as PracticeMenuId)}
                  disabled={isAdvancing}
                >
                  {PRACTICE_MENUS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.btnRow}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary} ${isAdvancing ? styles.btnDisabled : ''}`}
                  onClick={handleAdvanceDay}
                  disabled={isAdvancing}
                >
                  ▶ 練習して1日進む
                </button>
                <button
                  className={`${styles.btn} ${styles.btnSecondary} ${isAdvancing ? styles.btnDisabled : ''}`}
                  onClick={handleAdvanceWeek}
                  disabled={isAdvancing}
                >
                  ▶▶ 1週間まとめて進む
                </button>
              </div>
              {isAdvancing && <span className={styles.advancing}>処理中...</span>}
            </div>
          </div>
        </div>

        {/* チーム概要 */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>チーム概要</div>
          <div className={styles.teamGrid}>
            <span className={styles.teamLabel}>総合力</span>
            <span className={styles.teamOverall}>{view.team.teamOverall}</span>
            <span className={styles.teamLabel}>選手数</span>
            <span className={styles.teamValue}>{view.team.playerCount}名</span>
            {view.team.acePlayerName && (
              <>
                <span className={styles.teamLabel}>エース</span>
                <span className={styles.teamValue}>
                  {view.team.acePlayerName}（{view.team.aceOverall}）
                </span>
              </>
            )}
            {view.team.anchorPlayerName && (
              <>
                <span className={styles.teamLabel}>4番</span>
                <span className={styles.teamValue}>
                  {view.team.anchorPlayerName}（{view.team.anchorOverall}）
                </span>
              </>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <Link href="/team" style={{ fontSize: 12, color: 'var(--color-accent)' }}>
              選手一覧 →
            </Link>
          </div>
        </div>

        {/* 注目選手 */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>注目選手</div>
          {view.featuredPlayers.length === 0 ? (
            <p className={styles.newsEmpty}>選手がいません</p>
          ) : (
            <div className={styles.featuredList}>
              {view.featuredPlayers.map((p) => (
                <Link
                  key={p.id}
                  href={`/team/${p.id}`}
                  className={styles.featuredItem}
                >
                  <span className={`${styles.featuredRank} ${
                    p.overallRank === 'S' ? styles.rankS
                    : p.overallRank === 'A' ? styles.rankA
                    : p.overallRank === 'B' ? styles.rankB
                    : styles.rankC
                  }`}>{p.overallRank}</span>
                  <span className={styles.featuredName}>{p.name}</span>
                  <span className={styles.featuredOverall}>{p.overall}</span>
                  <span className={styles.featuredReason}>{p.reason}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 次の予定 */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>今後の主な予定</div>
          {view.upcomingSchedule.length === 0 ? (
            <p className={styles.newsEmpty}>予定なし</p>
          ) : (
            <ul className={styles.scheduleList}>
              {view.upcomingSchedule.map((item, i) => (
                <li key={i} className={styles.scheduleItem}>
                  <span>{item.description}</span>
                  <span className={styles.scheduleDate}>{item.monthDay}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* スカウト予算 */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>スカウト状況</div>
          <div className={styles.budgetHeader}>
            <span className={styles.budgetMain}>
              今月の視察残：<strong className={styles.budgetNum}>{view.scoutBudgetRemaining}</strong>/{view.scoutBudgetTotal}回
            </span>
            {view.scoutBudgetRemaining > 0 && (
              <span className={styles.budgetAlert}>💡 視察できます</span>
            )}
          </div>
          <div className={styles.budgetBar}>
            {Array.from({ length: view.scoutBudgetTotal }, (_, i) => (
              <div
                key={i}
                className={`${styles.budgetDot} ${
                  i < (view.scoutBudgetTotal - view.scoutBudgetRemaining)
                    ? styles.budgetDotUsed
                    : styles.budgetDotFree
                }`}
              />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/scout" style={{ fontSize: 12, color: 'var(--color-accent)' }}>
              スカウト画面へ →
            </Link>
          </div>
        </div>

        {/* 最近のニュース */}
        <div className={`${styles.card} ${styles.cardFull}`}>
          <div className={styles.cardTitle}>最近のニュース</div>
          {view.recentNews.length === 0 ? (
            <p className={styles.newsEmpty}>まだニュースはありません。日を進めると情報が集まります。</p>
          ) : (
            <ul className={styles.newsList}>
              {view.recentNews.map((item, i) => (
                <li
                  key={i}
                  className={`${styles.newsItem} ${
                    item.importance === 'high' ? styles.newsHigh
                    : item.importance === 'medium' ? styles.newsMedium
                    : styles.newsLow
                  }`}
                >
                  <span className={styles.newsIcon}>{item.icon}</span>
                  <span className={styles.newsHeadline}>{item.headline}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* クイックナビ */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>メニュー</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { href: '/team', label: '選手一覧・ラインナップ' },
              { href: '/scout', label: 'スカウト・勧誘' },
              { href: '/tournament', label: '大会情報' },
              { href: '/results', label: '試合結果' },
              { href: '/ob', label: 'OB・卒業生' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block',
                  padding: '7px 10px',
                  background: 'var(--color-bg)',
                  borderRadius: 3,
                  fontSize: 13,
                  color: 'var(--color-text)',
                  borderLeft: '2px solid var(--color-border)',
                }}
              >
                {item.label} →
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================================
// ページエントリポイント
// ============================================================

export default function HomePage() {
  const worldState = useWorldStore((s) => s.worldState);
  const newWorldGame = useWorldStore((s) => s.newWorldGame);
  const getHomeView = useWorldStore((s) => s.getHomeView);

  const handleStart = useCallback((schoolName: string, prefecture: string, managerName: string) => {
    newWorldGame({ schoolName, prefecture, managerName });
  }, [newWorldGame]);

  if (!worldState) {
    return <SetupScreen onStart={handleStart} />;
  }

  const view = getHomeView();
  if (!view) return <div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>;

  return <HomeContent view={view} />;
}
