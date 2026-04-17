'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../../stores/world-store';
import type { HomeViewState } from '../../ui/projectors/view-state-types';
import type { WorldDayResult } from '../../engine/world/world-ticker';
import type { PracticeMenuId } from '../../engine/types/calendar';
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
// ウェルカムバナー（初回プレイ Day 1）
// ============================================================

function WelcomeBanner({ schoolName, managerName }: { schoolName: string; managerName: string }) {
  return (
    <div className={styles.welcomeBanner}>
      <div className={styles.welcomeTitle}>ようこそ、{managerName}監督！</div>
      <p className={styles.welcomeText}>
        <strong>{schoolName}</strong> での新任監督生活がはじまりました。まずは以下の3ステップで始めましょう。
      </p>
      <ol className={styles.welcomeSteps}>
        <li>
          <span className={styles.stepNum}>1</span>
          <span className={styles.stepText}>
            <strong>チームを確認する</strong> —{' '}
            <Link href="/play/team" className={styles.stepLink}>チーム画面</Link>で選手一覧とラインナップを確認しましょう
          </span>
        </li>
        <li>
          <span className={styles.stepNum}>2</span>
          <span className={styles.stepText}>
            <strong>練習メニューを選ぶ</strong> — 下の「今日やること」で練習メニューを選択してください
          </span>
        </li>
        <li>
          <span className={styles.stepNum}>3</span>
          <span className={styles.stepText}>
            <strong>1日進める</strong> — 「練習して1日進む」ボタンで時間を進めましょう
          </span>
        </li>
      </ol>
    </div>
  );
}

// ============================================================
// 進行状況インジケーター
// ============================================================

function ProgressIndicator({ view }: { view: HomeViewState }) {
  // 次の大会情報
  let nextTournament = '';
  let daysLabel = '';

  if (view.isInTournamentSeason && view.tournament) {
    nextTournament = view.tournament.typeName;
    daysLabel = '開催中！';
  } else if (view.tournamentStart) {
    nextTournament = view.tournamentStart.name;
    daysLabel = `あと${view.tournamentStart.daysAway}日`;
  } else {
    const { month } = view.date;
    if (month < 7) {
      nextTournament = '夏季大会';
      daysLabel = `あと約${7 - month}ヶ月`;
    } else if (month < 9) {
      nextTournament = '秋季大会';
      daysLabel = `あと約${9 - month}ヶ月`;
    } else {
      nextTournament = '翌年夏季大会';
      daysLabel = '来年7月';
    }
  }

  return (
    <div className={styles.progressBar}>
      <div className={styles.progressItem}>
        <span className={styles.progressLabel}>現在</span>
        <span className={styles.progressValue}>{view.date.japaneseDisplay}</span>
      </div>
      <div className={styles.progressDivider} />
      <div className={styles.progressItem}>
        <span className={styles.progressLabel}>シーズン</span>
        <span className={styles.progressValue}>{view.seasonPhaseLabel}</span>
      </div>
      <div className={styles.progressDivider} />
      <div className={styles.progressItem}>
        <span className={styles.progressLabel}>次の大会</span>
        <span className={styles.progressValue}>
          {nextTournament}
          <span className={styles.progressSub}>{daysLabel}</span>
        </span>
      </div>
      <div className={styles.progressDivider} />
      <div className={styles.progressItem}>
        <span className={styles.progressLabel}>チーム総合力</span>
        <span className={`${styles.progressValue} ${styles.progressOverall}`}>
          {view.team.teamOverall}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 試合結果モーダル
// ============================================================

interface MatchResultModalProps {
  result: WorldDayResult;
  onClose: () => void;
}

function MatchResultModal({ result, onClose }: MatchResultModalProps) {
  const matchResult = result.playerMatchResult;
  if (!matchResult) return null;

  const isHome = result.playerMatchSide === 'home';
  const playerScore = isHome ? matchResult.finalScore.home : matchResult.finalScore.away;
  const opponentScore = isHome ? matchResult.finalScore.away : matchResult.finalScore.home;
  const won = matchResult.winner === result.playerMatchSide;
  const opponentName = result.playerMatchOpponent ?? '対戦校';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={`${styles.modalHeader} ${won ? styles.modalHeaderWin : styles.modalHeaderLose}`}>
          {won ? '⚾ 勝利！' : '⚾ 試合終了'}
        </div>
        <div className={styles.modalBody}>
          <div className={styles.matchResultScore}>
            <span className={styles.matchResultSelf}>{playerScore}</span>
            <span className={styles.matchResultVs}>対</span>
            <span className={styles.matchResultOpponent}>{opponentScore}</span>
          </div>
          <div className={styles.matchResultVsName}>vs {opponentName}</div>
          {won ? (
            <p className={styles.matchResultMessage}>
              🎉 おめでとうございます！次の試合も頑張りましょう！
            </p>
          ) : (
            <p className={styles.matchResultMessage}>
              残念...。大会は終了です。来年こそ甲子園へ！
            </p>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.modalBtn} onClick={onClose}>
            閉じる
          </button>
          <Link href="/play/results" className={styles.modalBtnSecondary} onClick={onClose}>
            試合結果を見る →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 大会開始通知バナー
// ============================================================

interface TournamentStartBannerProps {
  result: WorldDayResult;
  view: HomeViewState;
  onClose: () => void;
}

function TournamentStartBanner({ result, view, onClose }: TournamentStartBannerProps) {
  if (!result.seasonTransition) return null;
  if (result.seasonTransition !== 'summer_tournament' && result.seasonTransition !== 'autumn_tournament') return null;

  const typeName = result.seasonTransition === 'summer_tournament' ? '夏の大会' : '秋の大会';

  return (
    <div className={styles.tournamentStartBanner}>
      <div className={styles.tournamentStartIcon}>🏟️</div>
      <div className={styles.tournamentStartContent}>
        <div className={styles.tournamentStartTitle}>{typeName}が始まりました！</div>
        {view.tournament && !view.tournament.playerEliminated && (
          <div className={styles.tournamentStartDetail}>
            1回戦の日程が組まれました。試合の準備をしましょう！
          </div>
        )}
      </div>
      <button className={styles.tournamentStartClose} onClick={onClose}>✕</button>
    </div>
  );
}

// ============================================================
// ホーム画面本体
// ============================================================

function HomeContent({ view }: { view: HomeViewState }) {
  const advanceDay = useWorldStore((s) => s.advanceDay);
  const advanceWeek = useWorldStore((s) => s.advanceWeek);
  const getHomeView = useWorldStore((s) => s.getHomeView);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<PracticeMenuId>('batting_basic');
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveTab, setSaveTab] = useState<'save' | 'load'>('save');
  const [matchResult, setMatchResult] = useState<WorldDayResult | null>(null);
  const [tournamentStartResult, setTournamentStartResult] = useState<WorldDayResult | null>(null);
  const [currentView, setCurrentView] = useState<HomeViewState>(view);

  const handleAdvanceDay = useCallback(() => {
    setIsAdvancing(true);
    try {
      const result = advanceDay(selectedMenu);
      if (result) {
        // 最新のビューを取得して更新
        const newView = getHomeView();
        if (newView) setCurrentView(newView);

        // 大会開始通知
        if (result.seasonTransition === 'summer_tournament' || result.seasonTransition === 'autumn_tournament') {
          setTournamentStartResult(result);
        }
        // 試合結果モーダル
        if (result.playerMatchResult) {
          setMatchResult(result);
        }
      }
    } finally {
      setIsAdvancing(false);
    }
  }, [advanceDay, selectedMenu, getHomeView]);

  const handleAdvanceWeek = useCallback(() => {
    setIsAdvancing(true);
    try {
      const results = advanceWeek(selectedMenu);
      if (results.length > 0) {
        // 最新のビューを取得して更新
        const newView = getHomeView();
        if (newView) setCurrentView(newView);

        // 大会開始通知（最初の遷移）
        const transitionResult = results.find(
          (r) => r.seasonTransition === 'summer_tournament' || r.seasonTransition === 'autumn_tournament'
        );
        if (transitionResult) setTournamentStartResult(transitionResult);

        // 最後の試合結果を表示
        const lastMatchResult = [...results].reverse().find((r) => r.playerMatchResult);
        if (lastMatchResult) setMatchResult(lastMatchResult);
      }
    } finally {
      setIsAdvancing(false);
    }
  }, [advanceWeek, selectedMenu, getHomeView]);

  // view が外から更新された場合もcurrentViewに反映
  // （ただし advanceDay/Week 実行後は既に最新を反映済み）
  const displayView = currentView;

  return (
    <div className={styles.page}>
      {/* セーブ/ロードパネル */}
      {showSavePanel && (
        <SaveLoadPanel
          defaultTab={saveTab}
          onClose={() => setShowSavePanel(false)}
        />
      )}

      {/* 試合結果モーダル */}
      {matchResult && (
        <MatchResultModal
          result={matchResult}
          onClose={() => setMatchResult(null)}
        />
      )}

      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>{displayView.team.schoolName}</span>
          <div className={styles.headerMeta}>
            <div>{displayView.date.japaneseDisplay}</div>
            <div>
              <span className={styles.phaseBadge}>{displayView.seasonPhaseLabel}</span>
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
          <Link href="/play" className={`${styles.navLink} ${styles.navLinkActive}`}>ホーム</Link>
          <Link href="/play/team" className={styles.navLink}>チーム</Link>
          <Link href="/play/news" className={styles.navLink}>ニュース</Link>
          <Link href="/play/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/play/tournament" className={styles.navLink}>
            大会{displayView.isInTournamentSeason && <span className={styles.navIndicator}>🔴</span>}
          </Link>
          <Link href="/play/results" className={styles.navLink}>試合結果</Link>
          <Link href="/play/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      {/* 大会開始通知バナー */}
      {tournamentStartResult && (
        <TournamentStartBanner
          result={tournamentStartResult}
          view={displayView}
          onClose={() => setTournamentStartResult(null)}
        />
      )}

      {/* 大会シーズン中バナー（大会開始通知がない場合） */}
      {!tournamentStartResult && displayView.isInTournamentSeason && displayView.tournament && (
        <div className={`${styles.tournamentBanner} ${displayView.tournament.isMatchDay ? styles.tournamentBannerMatchDay : ''}`}>
          {displayView.tournament.isMatchDay ? (
            <>⚾ 今日は試合日です！ — {displayView.tournament.typeName} {displayView.tournament.currentRound}</>
          ) : (
            <>🏟️ {displayView.tournament.typeName} 開催中 — {displayView.tournament.currentRound}</>
          )}
        </div>
      )}

      {/* 大会開始予告バナー */}
      {!displayView.isInTournamentSeason && displayView.tournamentStart && displayView.tournamentStart.daysAway <= 14 && (
        <div className={styles.tournamentPreBanner}>
          🗓️ {displayView.tournamentStart.name}まで あと{displayView.tournamentStart.daysAway}日（{displayView.tournamentStart.date}開始）
        </div>
      )}

      {/* 初回プレイ（Year1 4月1日）ウェルカムメッセージ */}
      {displayView.date.year === 1 && displayView.date.month === 4 && displayView.date.day === 1 && (
        <WelcomeBanner
          schoolName={displayView.team.schoolName}
          managerName="新任"
        />
      )}

      {/* 進行状況インジケーター */}
      <ProgressIndicator view={displayView} />

      {/* メインコンテンツ */}
      <main className={styles.main}>

        {/* 試合日バナー（大会期間中かつ試合がある日） */}
        {displayView.tournament?.isMatchDay && !displayView.tournament.playerEliminated && (
          <div className={`${styles.card} ${styles.cardFull} ${styles.matchDayCard}`}>
            <div className={styles.matchDayTitle}>
              ⚾ 今日は試合日です！ — {displayView.tournament.typeName} {displayView.tournament.currentRound}
            </div>
            {displayView.tournament.nextOpponent && (
              <div className={styles.matchDayOpponent}>
                vs <strong>{displayView.tournament.nextOpponent}</strong>
              </div>
            )}
            <p className={styles.matchDayHint}>
              「練習して1日進む」で試合を行います。勝利して上位進出を目指しましょう！
            </p>
          </div>
        )}

        {/* 次の試合まで（大会期間中・試合がない日） */}
        {displayView.tournament?.isActive && !displayView.tournament.isMatchDay && !displayView.tournament.playerEliminated && displayView.tournament.nextMatchDate && (
          <div className={`${styles.card} ${styles.cardFull} ${styles.nextMatchCard}`}>
            <span className={styles.nextMatchLabel}>次の試合：</span>
            <span className={styles.nextMatchDate}>{displayView.tournament.nextMatchDate}</span>
            {displayView.tournament.nextMatchDaysAway !== undefined && (
              <span className={styles.nextMatchDays}>（あと{displayView.tournament.nextMatchDaysAway}日）</span>
            )}
            {displayView.tournament.nextOpponent && (
              <span className={styles.nextMatchOpponent}>vs {displayView.tournament.nextOpponent}</span>
            )}
          </div>
        )}

        {/* 今日やること + アクションボタン */}
        <div className={`${styles.card} ${styles.cardFull} ${styles.todayCard}`}>
          <div className={styles.cardTitle}>今日やること</div>
          <div className={styles.todayRow}>
            <div className={styles.todayTask}>
              <span className={`${styles.taskBadge} ${
                displayView.todayTask.type === 'match' ? styles.taskBadgeMatch
                : displayView.todayTask.type === 'off'  ? styles.taskBadgeOff
                : displayView.todayTask.type === 'scout' ? styles.taskBadgeScout
                : styles.taskBadgePractice
              }`}>
                {displayView.todayTask.type === 'match'    ? '⚾ 試合日'
                 : displayView.todayTask.type === 'off'    ? '💤 休養日'
                 : displayView.todayTask.type === 'scout'  ? '🔍 スカウト'
                 : '🏋 練習日'}
              </span>
              <span className={styles.todayDetail}>{displayView.todayTask.detail}</span>
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
            <span className={styles.teamOverall}>{displayView.team.teamOverall}</span>
            <span className={styles.teamLabel}>選手数</span>
            <span className={styles.teamValue}>{displayView.team.playerCount}名</span>
            {displayView.team.acePlayerName && (
              <>
                <span className={styles.teamLabel}>エース</span>
                <span className={styles.teamValue}>
                  {displayView.team.acePlayerName}（{displayView.team.aceOverall}）
                </span>
              </>
            )}
            {displayView.team.anchorPlayerName && (
              <>
                <span className={styles.teamLabel}>4番</span>
                <span className={styles.teamValue}>
                  {displayView.team.anchorPlayerName}（{displayView.team.anchorOverall}）
                </span>
              </>
            )}
          </div>
          {/* スタメン選手一覧 */}
          {displayView.featuredPlayers.length > 0 && (
            <div className={styles.startersList}>
              {displayView.featuredPlayers.map((p) => (
                <Link
                  key={p.id}
                  href={`/team/${p.id}`}
                  className={styles.starterItem}
                >
                  <span className={`${styles.starterRank} ${
                    p.overallRank === 'S' ? styles.rankS
                    : p.overallRank === 'A' ? styles.rankA
                    : p.overallRank === 'B' ? styles.rankB
                    : styles.rankC
                  }`}>{p.overallRank}</span>
                  <span className={styles.starterName}>{p.name}</span>
                  <span className={styles.starterOverall}>{p.overall}</span>
                </Link>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link href="/play/team" style={{ fontSize: 12, color: 'var(--color-accent)' }}>
              選手一覧 →
            </Link>
          </div>
        </div>

        {/* 注目選手 */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>注目選手</div>
          {displayView.featuredPlayers.length === 0 ? (
            <p className={styles.newsEmpty}>選手がいません</p>
          ) : (
            <div className={styles.featuredList}>
              {displayView.featuredPlayers.map((p) => (
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
          {displayView.upcomingSchedule.length === 0 ? (
            <p className={styles.newsEmpty}>予定なし</p>
          ) : (
            <ul className={styles.scheduleList}>
              {displayView.upcomingSchedule.map((item, i) => (
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
              今月の視察残：<strong className={styles.budgetNum}>{displayView.scoutBudgetRemaining}</strong>/{displayView.scoutBudgetTotal}回
            </span>
            {displayView.scoutBudgetRemaining > 0 && (
              <span className={styles.budgetAlert}>💡 視察できます</span>
            )}
          </div>
          <div className={styles.budgetBar}>
            {Array.from({ length: displayView.scoutBudgetTotal }, (_, i) => (
              <div
                key={i}
                className={`${styles.budgetDot} ${
                  i < (displayView.scoutBudgetTotal - displayView.scoutBudgetRemaining)
                    ? styles.budgetDotUsed
                    : styles.budgetDotFree
                }`}
              />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/play/scout" style={{ fontSize: 12, color: 'var(--color-accent)' }}>
              スカウト画面へ →
            </Link>
          </div>
        </div>

        {/* 最近のニュース */}
        <div className={`${styles.card} ${styles.cardFull}`}>
          <div className={styles.cardTitleRow}>
            <div className={styles.cardTitle}>最近のニュース</div>
            <Link href="/play/news" style={{ fontSize: 12, color: 'var(--color-accent)' }}>
              もっと見る →
            </Link>
          </div>
          {displayView.recentNews.length === 0 ? (
            <p className={styles.newsEmpty}>まだニュースはありません。日を進めると情報が集まります。</p>
          ) : (
            <ul className={styles.newsList}>
              {displayView.recentNews.slice(0, 5).map((item, i) => (
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
              { href: '/play/practice', label: '練習試合・紅白戦' },
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

export default function PlayPage() {
  const router = useRouter();
  const worldState = useWorldStore((s) => s.worldState);
  const getHomeView = useWorldStore((s) => s.getHomeView);

  // ゲームが開始されていない場合は新規ゲーム画面へ
  useEffect(() => {
    if (!worldState) {
      router.replace('/new-game');
    }
  }, [worldState, router]);

  if (!worldState) {
    return <div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>;
  }

  const view = getHomeView();
  if (!view) return <div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>;

  return <HomeContent view={view} />;
}
