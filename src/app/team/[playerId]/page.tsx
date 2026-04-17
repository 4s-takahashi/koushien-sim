'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWorldStore } from '../../../stores/world-store';
import type { PlayerDetailViewState, StatRowView } from '../../../ui/projectors/view-state-types';
import styles from './page.module.css';

function StatBar({ stat }: { stat: StatRowView }) {
  return (
    <tr>
      <td className={styles.statLabel}>{stat.label}</td>
      <td>
        <div className={styles.barOuter}>
          <div
            className={styles.barInner}
            style={{ width: `${stat.barPercent}%` }}
          />
        </div>
      </td>
      <td className={styles.statValue}>{stat.value}</td>
      <td className={`${styles.statRank} ${styles['rank' + stat.rank]}`}>{stat.rank}</td>
    </tr>
  );
}

function PlayerDetail({ view }: { view: PlayerDetailViewState }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>
            {view.fullName}（{view.gradeLabel} / {view.positionLabel}）
          </span>
          <Link href="/team" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
            ← チームに戻る
          </Link>
        </div>
      </header>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={`${styles.navLink} ${styles.navLinkActive}`}>チーム</Link>
          <Link href="/news" className={styles.navLink}>ニュース</Link>
          <Link href="/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/tournament" className={styles.navLink}>大会</Link>
          <Link href="/results" className={styles.navLink}>試合結果</Link>
          <Link href="/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      <main className={styles.main}>
        {/* プロフィール */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>プロフィール</div>
          <div className={styles.profileGrid}>
            <span className={styles.pLabel}>総合力</span>
            <span>
              <strong className={styles['rank' + view.overallRank]} style={{ fontSize: 22 }}>
                {view.overall}
              </strong>
              {' '}
              <span className={`${styles.rankBadge} ${styles['rank' + view.overallRank]}`}>
                {view.overallRank}
              </span>
            </span>
            <span className={styles.pLabel}>身長 / 体重</span>
            <span>{view.height}cm / {view.weight}kg</span>
            <span className={styles.pLabel}>打席 / 投</span>
            <span>{view.battingSide} / {view.throwingHand}</span>
            <span className={styles.pLabel}>ポジション</span>
            <span>
              {view.positionLabel}
              {view.subPositions.length > 0 && (
                <span style={{ color: 'var(--color-text-sub)', fontSize: 11 }}>
                  {' '}（{view.subPositions.join('・')}）
                </span>
              )}
            </span>
            {view.traits.length > 0 && (
              <>
                <span className={styles.pLabel}>特性</span>
                <span style={{ fontSize: 12 }}>{view.traits.join('・')}</span>
              </>
            )}
          </div>
        </div>

        {/* コンディション */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>コンディション</div>
          <div className={styles.condGrid}>
            <span className={styles.pLabel}>疲労度</span>
            <div>
              <div className={styles.barOuter} style={{ width: 120 }}>
                <div
                  className={styles.barInner}
                  style={{
                    width: `${view.condition.fatigue}%`,
                    background: view.condition.fatigue >= 80 ? 'var(--color-primary)' : 'var(--color-accent)',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                {' '}{view.condition.fatigue}%
              </span>
            </div>
            <span className={styles.pLabel}>状態</span>
            <span style={{
              color: view.condition.injuryDescription ? 'var(--color-primary)' : 'var(--color-accent)',
              fontWeight: 'bold', fontSize: 13,
            }}>
              {view.condition.injuryDescription ?? view.condition.moodLabel}
            </span>
          </div>
        </div>

        {/* 基礎能力値 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>基礎能力値</div>
          <table className={styles.statTable}>
            <tbody>
              {view.baseStats.map((s) => <StatBar key={s.label} stat={s} />)}
            </tbody>
          </table>
        </div>

        {/* 打撃能力値 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>打撃能力値</div>
          <table className={styles.statTable}>
            <tbody>
              {view.battingStats.map((s) => <StatBar key={s.label} stat={s} />)}
            </tbody>
          </table>
        </div>

        {/* 投球能力値（投手のみ） */}
        {view.pitchingStats && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>投球能力値</div>
            <table className={styles.statTable}>
              <tbody>
                {view.pitchingStats.map((s) => <StatBar key={s.label} stat={s} />)}
              </tbody>
            </table>
          </div>
        )}

        {/* 通算成績 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>通算成績（打者）</div>
          <table className={styles.recordTable}>
            <thead>
              <tr>
                <th>試合</th>
                <th>打数</th>
                <th>安打</th>
                <th>本塁打</th>
                <th>打点</th>
                <th>盗塁</th>
                <th>打率</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{view.battingRecord.gamesPlayed}</td>
                <td>{view.battingRecord.atBats}</td>
                <td>{view.battingRecord.hits}</td>
                <td>{view.battingRecord.homeRuns}</td>
                <td>{view.battingRecord.rbis}</td>
                <td>{view.battingRecord.stolenBases}</td>
                <td><strong>{view.battingRecord.battingAverage}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 通算成績（投手） */}
        {view.pitchingRecord && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>通算成績（投手）</div>
            <table className={styles.recordTable}>
              <thead>
                <tr>
                  <th>先発</th>
                  <th>投球回</th>
                  <th>勝利</th>
                  <th>敗北</th>
                  <th>奪三振</th>
                  <th>防御率</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{view.pitchingRecord.gamesStarted}</td>
                  <td>{view.pitchingRecord.inningsPitched.toFixed(1)}</td>
                  <td>{view.pitchingRecord.wins}</td>
                  <td>{view.pitchingRecord.losses}</td>
                  <td>{view.pitchingRecord.strikeouts}</td>
                  <td><strong>{view.pitchingRecord.era}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PlayerDetailPage() {
  const params = useParams();
  const playerId = typeof params.playerId === 'string' ? params.playerId : '';
  const worldState = useWorldStore((s) => s.worldState);
  const getPlayerView = useWorldStore((s) => s.getPlayerView);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const view = getPlayerView(playerId);
  if (!view) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>選手が見つかりません（ID: {playerId}）</p>
        <Link href="/team" style={{ color: 'var(--color-primary)' }}>チームに戻る</Link>
      </div>
    );
  }

  return <PlayerDetail view={view} />;
}
