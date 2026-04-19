'use client';

import Link from 'next/link';
import { useWorldStore } from '../../stores/world-store';
import type { ScoreboardView } from '../../ui/projectors/view-state-types';
import styles from './page.module.css';

// ============================================================
// イニング別スコアボード
// ============================================================

function InningScoreboard({ r }: { r: ScoreboardView }) {
  if (!r.inningScores) return null;
  const { homeInnings, awayInnings, totalInnings } = r.inningScores;

  return (
    <div className={styles.scoreboard}>
      <table className={styles.scoreTable}>
        <thead>
          <tr>
            <th className={styles.scoreTeamCol}>チーム</th>
            {Array.from({ length: totalInnings }, (_, i) => (
              <th key={i} className={styles.scoreInningCol}>{i + 1}</th>
            ))}
            <th className={styles.scoreTotalCol}>計</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={styles.scoreTeamName}>{r.awaySchool}</td>
            {awayInnings.map((v, i) => (
              <td key={i} className={styles.scoreCell}>{v ?? '-'}</td>
            ))}
            <td className={styles.scoreTotalCell}>{r.awayScore}</td>
          </tr>
          <tr>
            <td className={styles.scoreTeamName}>{r.homeSchool}</td>
            {homeInnings.map((v, i) => (
              <td key={i} className={styles.scoreCell}>{v ?? '-'}</td>
            ))}
            <td className={styles.scoreTotalCell}>{r.homeScore}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// ハイライト
// ============================================================

function MatchHighlights({ r }: { r: ScoreboardView }) {
  if (!r.highlights || r.highlights.length === 0) return null;

  return (
    <div className={styles.highlightSection}>
      <div className={styles.subTitle}>ハイライト</div>
      <ul className={styles.highlightList}>
        {r.highlights.map((h, i) => (
          <li key={i} className={`${styles.highlightItem} ${
            h.kind === 'homerun' ? styles.hlHomerun
            : h.kind === 'strikeout' ? styles.hlStrikeout
            : styles.hlDefault
          }`}>
            <span className={styles.hlIcon}>{h.icon}</span>
            <span>{h.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// 先発投手成績
// ============================================================

function PitcherSummaryBox({ r }: { r: ScoreboardView }) {
  if (!r.pitcherSummary) return null;
  const p = r.pitcherSummary;

  return (
    <div className={styles.pitcherBox}>
      <div className={styles.subTitle}>先発投手</div>
      <div className={styles.pitcherRow}>
        <span className={styles.pitcherName}>{p.name}</span>
        <span className={styles.pitcherStat}>{p.inningsPitched}回</span>
        <span className={styles.pitcherStat}>{p.pitchCount}球</span>
        <span className={styles.pitcherStat}>{p.strikeouts}K</span>
        <span className={styles.pitcherStat}>{p.earnedRuns}失点</span>
      </div>
    </div>
  );
}

// ============================================================
// 打席フロー
// ============================================================

function AtBatFlow({ r }: { r: ScoreboardView }) {
  if (!r.atBatFlow || r.atBatFlow.length === 0) return null;

  return (
    <div className={styles.atBatSection}>
      <div className={styles.subTitle}>打席の流れ</div>
      <table className={styles.atBatTable}>
        <thead>
          <tr>
            <th>回</th>
            <th>打者</th>
            <th>結果</th>
            <th>打点</th>
            <th>スコア</th>
          </tr>
        </thead>
        <tbody>
          {r.atBatFlow.map((ab, i) => (
            <tr key={i}>
              <td className={styles.atBatInning}>
                {ab.inning}{ab.half === 'top' ? '表' : '裏'}
              </td>
              <td>{ab.batterName}</td>
              <td className={`${styles.atBatResult} ${
                ab.result === 'ホームラン' ? styles.abHomerun
                : ab.result === '三振' ? styles.abStrikeout
                : ab.result === '二塁打' || ab.result === '三塁打' ? styles.abExtra
                : ''
              }`}>{ab.result}</td>
              <td>{ab.rbiCount > 0 ? `${ab.rbiCount}点` : ''}</td>
              <td className={styles.atBatScore}>{ab.scoreAfter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// 試合カード（詳細展開つき）
// ============================================================

function MatchCard({ r }: { r: ScoreboardView }) {
  const hasDetail = (r.inningScores || r.highlights || r.pitcherSummary || r.atBatFlow);

  return (
    <div className={`${styles.matchCard} ${
      r.result === '勝利' ? styles.matchWin
      : r.result === '敗北' ? styles.matchLose
      : styles.matchDraw
    }`}>
      <div className={styles.matchHeader}>
        <div className={styles.matchDate}>{r.date.japaneseDisplay}</div>
        {r.result && (
          <div className={`${styles.matchResult} ${
            r.result === '勝利' ? styles.resultWin
            : r.result === '敗北' ? styles.resultLose
            : styles.resultDraw
          }`}>
            {r.result}
          </div>
        )}
      </div>

      <div className={styles.matchScore}>
        <span className={`${styles.matchTeam} ${r.result === '勝利' ? styles.matchTeamWin : ''}`}>
          {r.homeSchool}
        </span>
        <span className={styles.matchNum}>{r.homeScore}</span>
        <span className={styles.matchVs}>-</span>
        <span className={styles.matchNum}>{r.awayScore}</span>
        <span className={styles.matchTeam}>{r.awaySchool}</span>
      </div>

      {/* イニング別スコアボード */}
      {r.inningScores && <InningScoreboard r={r} />}

      {/* 先発投手 */}
      {r.pitcherSummary && <PitcherSummaryBox r={r} />}

      {/* ハイライト */}
      {r.highlights && r.highlights.length > 0 && <MatchHighlights r={r} />}

      {/* 打席フロー */}
      {r.atBatFlow && r.atBatFlow.length > 0 && <AtBatFlow r={r} />}
    </div>
  );
}

// ============================================================
// ページ本体
// ============================================================

export default function ResultsPage() {
  const worldState = useWorldStore((s) => s.worldState);
  const getResultsView = useWorldStore((s) => s.getResultsView);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const view = getResultsView();
  if (!view) return <div style={{ padding: 40 }}>読み込み中...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>試合結果</span>
        </div>
      </header>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/play" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
          <Link href="/news" className={styles.navLink}>ニュース</Link>
          <Link href="/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/tournament" className={styles.navLink}>大会</Link>
          <Link href="/results" className={`${styles.navLink} ${styles.navLinkActive}`}>試合結果</Link>
          <Link href="/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      <main className={styles.main}>
        {/* シーズン成績 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>今シーズン通算成績</div>
          <div className={styles.recordRow}>
            <span className={styles.win}>{view.seasonRecord.wins}勝</span>
            <span className={styles.sep}> - </span>
            <span className={styles.lose}>{view.seasonRecord.losses}敗</span>
            {view.seasonRecord.draws > 0 && (
              <>
                <span className={styles.sep}> - </span>
                <span>{view.seasonRecord.draws}分</span>
              </>
            )}
          </div>
        </div>

        {/* 直近の試合結果 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>直近の試合結果</div>
          {view.recentResults.length === 0 ? (
            <div className={styles.placeholder}>
              <p>まだ試合結果がありません。</p>
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-sub)' }}>
                大会シーズンに突入すると試合が記録されます。
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {view.recentResults.map((r, i) => (
                <MatchCard key={i} r={r} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
