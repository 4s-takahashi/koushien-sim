'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useWorldStore } from '../../stores/world-store';
import type { TournamentBracketView, TournamentRoundView, TournamentMatchView } from '../../ui/projectors/view-state-types';
import styles from './page.module.css';

// ============================================================
// 1試合セル
// ============================================================

function MatchCell({ match }: { match: TournamentMatchView }) {
  if (match.isBye) {
    return (
      <div className={`${styles.matchSlot} ${match.isPlayerSchoolMatch ? styles.matchSlotPlayer : ''}`}>
        <div className={styles.matchTeamRow}>
          <span className={match.isPlayerSchoolHome || match.isPlayerSchoolAway ? styles.matchTeamPlayer : styles.matchTeamWinner}>
            {match.homeSchoolName ?? match.awaySchoolName ?? '—'}
          </span>
          <span className={styles.matchBye}>不戦勝</span>
        </div>
      </div>
    );
  }

  if (!match.homeSchoolName && !match.awaySchoolName) {
    return (
      <div className={styles.matchSlot}>
        <div className={styles.matchTeamRow}>
          <span className={styles.matchTeamEmpty}>—</span>
        </div>
      </div>
    );
  }

  const homeWon = match.isCompleted && match.winnerId !== null && match.homeSchoolName === match.winnerName;
  const awayWon = match.isCompleted && match.winnerId !== null && match.awaySchoolName === match.winnerName;

  return (
    <div className={`${styles.matchSlot}
      ${match.isPlayerSchoolMatch ? styles.matchSlotPlayer : ''}
      ${match.isUpset ? styles.matchSlotUpset : ''}
    `}>
      {/* 先攻（away） */}
      <div className={`${styles.matchTeamRow} ${awayWon ? styles.matchTeamWinner : match.isCompleted ? styles.matchTeamLoser : ''}`}>
        <span className={match.isPlayerSchoolAway ? styles.matchTeamPlayer : ''}>
          {match.awaySchoolName ?? '—'}
        </span>
        {match.isCompleted && match.awayScore !== null && (
          <span className={styles.matchScore}>{match.awayScore}</span>
        )}
        {match.isPlayerSchoolAway && awayWon && (
          <span className={styles.playerHighlight}>◎</span>
        )}
      </div>
      {/* 後攻（home） */}
      <div className={`${styles.matchTeamRow} ${homeWon ? styles.matchTeamWinner : match.isCompleted ? styles.matchTeamLoser : ''}`}>
        <span className={match.isPlayerSchoolHome ? styles.matchTeamPlayer : ''}>
          {match.homeSchoolName ?? '—'}
        </span>
        {match.isCompleted && match.homeScore !== null && (
          <span className={styles.matchScore}>{match.homeScore}</span>
        )}
        {match.isPlayerSchoolHome && homeWon && (
          <span className={styles.playerHighlight}>◎</span>
        )}
        {match.isUpset && match.isCompleted && (
          <span className={styles.matchUpsetIcon}> 🔥</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ラウンド列
// ============================================================

function RoundColumn({ round }: { round: TournamentRoundView }) {
  return (
    <div className={styles.roundCol}>
      <div className={styles.roundHeader}>{round.roundName}</div>
      {round.matches.map((match) => (
        <MatchCell key={match.matchId} match={match} />
      ))}
    </div>
  );
}

// ============================================================
// ブラケット表示
// ============================================================

function BracketView({ bracket }: { bracket: TournamentBracketView }) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const displayRounds = selectedRound
    ? bracket.rounds.filter((r) => r.roundNumber === selectedRound)
    : bracket.rounds;

  return (
    <div>
      <div className={styles.bracketHeader}>
        <div>
          <div className={styles.bracketTypeName}>
            Year {bracket.year} {bracket.typeName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 2 }}>
            {bracket.totalTeams}校 トーナメント
            {bracket.playerSchoolBestRound > 0 && (
              <span style={{ color: 'var(--color-primary)', marginLeft: 8 }}>
                自校: {bracket.playerSchoolBestRound}回戦進出
                {bracket.isPlayerSchoolWinner && ' 🏆 優勝！'}
              </span>
            )}
          </div>
        </div>
        {bracket.championName && (
          <div className={styles.bracketChampion}>
            🏆 優勝: {bracket.championName}
          </div>
        )}
      </div>

      {/* ラウンドフィルタータブ */}
      <div className={styles.roundTabs}>
        <button
          className={`${styles.roundTab} ${selectedRound === null ? styles.roundTabActive : ''}`}
          onClick={() => setSelectedRound(null)}
        >
          全ラウンド
        </button>
        {bracket.rounds.map((r) => (
          <button
            key={r.roundNumber}
            className={`${styles.roundTab} ${selectedRound === r.roundNumber ? styles.roundTabActive : ''}`}
            onClick={() => setSelectedRound(r.roundNumber)}
          >
            {r.roundName}
          </button>
        ))}
      </div>

      <div className={styles.bracketScroll}>
        <div className={styles.bracketGrid}>
          {displayRounds.map((round) => (
            <RoundColumn key={round.roundNumber} round={round} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: 'var(--color-text-sub)' }}>
        ◎=自校 🔥=番狂わせ　自校の試合は赤枠で表示
      </div>
    </div>
  );
}

// ============================================================
// 大会ステータス表示（手動開始ボタンの代替）
// ============================================================

interface TournamentStatusDisplayProps {
  phase: string;
  month: number;
  day: number;
}

function TournamentStatusDisplay({ phase, month, day }: TournamentStatusDisplayProps) {
  // 大会前: 次の大会までの残り日数を計算
  function getDaysUntilSummer(): number {
    if (month === 7 && day < 10) return 10 - day;
    const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let d = monthDays[month] - day;
    for (let m = month + 1; m < 7; m++) d += monthDays[m];
    d += 10;
    return Math.max(0, d);
  }

  function getDaysUntilAutumn(): number {
    if (month === 9 && day < 15) return 15 - day;
    if (month === 8) return (31 - day) + 15;
    if (month === 7 && day >= 31) return (31 - day) + 31 + 15;
    return 0;
  }

  if (phase === 'spring_practice' || (month < 7) || (month === 7 && day < 10)) {
    const daysAway = getDaysUntilSummer();
    return (
      <div className={styles.statusBox}>
        <div className={styles.statusIcon}>🗓️</div>
        <div className={styles.statusContent}>
          <div className={styles.statusTitle}>夏の大会まで あと{daysAway}日</div>
          <div className={styles.statusDetail}>開始日: 7月10日</div>
          <p className={styles.statusNote}>
            大会は日程通りに自動開始されます。ホーム画面で日を進めていきましょう。
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'post_summer' || (month === 7 && day >= 31) || month === 8 || (month === 9 && day < 15)) {
    const daysAway = getDaysUntilAutumn();
    return (
      <div className={styles.statusBox}>
        <div className={styles.statusIcon}>🗓️</div>
        <div className={styles.statusContent}>
          <div className={styles.statusTitle}>秋の大会まで あと{daysAway}日</div>
          <div className={styles.statusDetail}>開始日: 9月15日</div>
          <p className={styles.statusNote}>
            大会は日程通りに自動開始されます。ホーム画面で日を進めていきましょう。
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'off_season') {
    return (
      <div className={styles.statusBox}>
        <div className={styles.statusIcon}>⛄</div>
        <div className={styles.statusContent}>
          <div className={styles.statusTitle}>オフシーズン</div>
          <p className={styles.statusNote}>
            現在は大会期間外です。次の夏の大会（翌年7月10日）に向けて準備しましょう。
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'pre_season') {
    return (
      <div className={styles.statusBox}>
        <div className={styles.statusIcon}>🌸</div>
        <div className={styles.statusContent}>
          <div className={styles.statusTitle}>プレシーズン — 春の練習期間</div>
          <p className={styles.statusNote}>
            夏の大会（7月10日）に向けてチームを仕上げましょう。
          </p>
        </div>
      </div>
    );
  }

  // フォールバック
  return (
    <div className={styles.placeholder}>
      <p>現在、進行中の大会はありません。</p>
    </div>
  );
}

// ============================================================
// ページ本体
// ============================================================

export default function TournamentPage() {
  const worldState = useWorldStore((s) => s.worldState);
  const getTournamentView = useWorldStore((s) => s.getTournamentView);
  const simulateTournament = useWorldStore((s) => s.simulateTournament);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const view = getTournamentView();
  if (!view) return <div style={{ padding: 40 }}>読み込み中...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>大会情報</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
            Year {view.currentYear}
          </span>
        </div>
      </header>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/play" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
          <Link href="/news" className={styles.navLink}>ニュース</Link>
          <Link href="/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/tournament" className={`${styles.navLink} ${styles.navLinkActive}`}>大会</Link>
          <Link href="/results" className={styles.navLink}>試合結果</Link>
          <Link href="/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      <main className={styles.main}>
        {/* 現在のフェーズ */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>現在のシーズン状況</div>
          <div className={styles.phaseDisplay}>
            <span className={styles.phaseBadge}>{view.seasonPhaseLabel}</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-sub)', marginLeft: 12 }}>
              Year {view.currentYear} 進行中
            </span>
          </div>
        </div>

        {/* 今シーズンの成績 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>今シーズンの成績</div>
          <table className={styles.resultTable}>
            <tbody>
              <tr>
                <td className={styles.resultLabel}>夏の大会 最高成績</td>
                <td className={styles.resultValue}>
                  {view.yearResults.summerBestRound === 0
                    ? '未出場'
                    : `${view.yearResults.summerBestRound}回戦進出`}
                </td>
              </tr>
              <tr>
                <td className={styles.resultLabel}>秋の大会 最高成績</td>
                <td className={styles.resultValue}>
                  {view.yearResults.autumnBestRound === 0
                    ? '未出場'
                    : `${view.yearResults.autumnBestRound}回戦進出`}
                </td>
              </tr>
              <tr>
                <td className={styles.resultLabel}>甲子園出場</td>
                <td className={styles.resultValue}>
                  {view.yearResults.koshienAppearance ? (
                    <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>
                      出場 ★（{view.yearResults.koshienBestRound}回戦進出）
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-sub)' }}>未出場</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* トーナメント表 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>トーナメント表</div>
          {view.activeBracket ? (
            <>
              <BracketView bracket={view.activeBracket} />
              {!view.activeBracket.isCompleted && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => simulateTournament()}
                    style={{
                      padding: '8px 20px', background: 'var(--color-primary)',
                      color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
                      fontSize: 13, fontWeight: 'bold',
                    }}
                  >
                    ▶ 大会を全試合シミュレート
                  </button>
                </div>
              )}
            </>
          ) : (
            <TournamentStatusDisplay
              phase={view.seasonPhase}
              month={worldState?.currentDate.month ?? 4}
              day={worldState?.currentDate.day ?? 1}
            />
          )}
        </div>

        {/* 過去大会履歴 */}
        {view.historyBrackets.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>過去大会履歴</div>
            <div className={styles.historySection}>
              {view.historyBrackets.map((b) => (
                <div key={b.id} style={{ marginBottom: 16 }}>
                  <BracketView bracket={b} />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
