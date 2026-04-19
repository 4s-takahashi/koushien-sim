'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWorldStore } from '../../../stores/world-store';
import { computePlayerOverall } from '../../../engine/world/career/draft-system';
import type { HighSchool } from '../../../engine/world/world-state';
import type { Player } from '../../../engine/types/player';
import styles from './page.module.css';

// ============================================================
// 内部ヘルパー
// ============================================================

type AbilityRank = 'S' | 'A' | 'B' | 'C';

function overallToRank(overall: number): AbilityRank {
  if (overall >= 75) return 'S';
  if (overall >= 60) return 'A';
  if (overall >= 45) return 'B';
  return 'C';
}

function reputationToLabel(reputation: number): string {
  if (reputation >= 85) return '名門';
  if (reputation >= 65) return '強豪';
  if (reputation >= 45) return '中堅';
  if (reputation >= 25) return '新興';
  return '弱小';
}

function reputationToStars(reputation: number): number {
  if (reputation >= 85) return 5;
  if (reputation >= 65) return 4;
  if (reputation >= 45) return 3;
  if (reputation >= 25) return 2;
  return 1;
}

function positionToLabel(pos: string): string {
  const map: Record<string, string> = {
    pitcher: '投手',
    catcher: '捕手',
    first: '一塁手',
    second: '二塁手',
    third: '三塁手',
    shortstop: '遊撃手',
    left: '左翼手',
    center: '中堅手',
    right: '右翼手',
  };
  return map[pos] ?? pos;
}

function getPitcherStyle(player: Player): string {
  const p = player.stats.pitching;
  if (!p) return '';
  const fastballDom = (p.velocity ?? 0) >= 80;
  const breakingDom = Math.max(
    p.pitches?.slider ?? 0,
    p.pitches?.curve ?? 0,
    p.pitches?.changeup ?? 0,
    p.pitches?.fork ?? 0,
  ) >= 50;
  if (fastballDom && !breakingDom) return '速球派';
  if (!fastballDom && breakingDom) return '変化球派';
  return 'バランス型';
}

function getBatterStyle(player: Player): string {
  const b = player.stats.batting;
  const base = player.stats.base;
  const power = b.power;
  const contact = b.contact;
  const speed = base.speed;
  const fielding = base.fielding;

  if (power >= 65) return '長距離打者';
  if (contact >= 65) return '巧打者';
  if (speed >= 65) return '俊足';
  if (fielding >= 65) return '守備型';
  return 'バランス型';
}

function getPlayerGrade(enrollmentYear: number, currentYear: number): 1 | 2 | 3 {
  const grade = currentYear - enrollmentYear + 1;
  if (grade >= 3) return 3;
  if (grade >= 2) return 2;
  return 1;
}

function getTeamStrength(school: HighSchool): number {
  if (school.players.length === 0) return 0;
  const sum = school.players.reduce((acc, p) => acc + computePlayerOverall(p), 0);
  return Math.round(sum / school.players.length);
}

// ============================================================
// 星表示
// ============================================================

function StarRating({ stars }: { stars: number }) {
  return (
    <span className={styles.stars}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < stars ? styles.starFilled : styles.starEmpty}>★</span>
      ))}
    </span>
  );
}

// ============================================================
// 高校詳細ページ
// ============================================================

function SchoolDetail({ school, isPlayerSchool, currentYear }: { school: HighSchool; isPlayerSchool: boolean; currentYear: number }) {
  const strength = getTeamStrength(school);
  const stars = reputationToStars(school.reputation);

  // 主要選手（全選手を overall 順でソート）
  const sortedPlayers = [...school.players]
    .sort((a, b) => computePlayerOverall(b) - computePlayerOverall(a))
    .slice(0, 9);

  return (
    <div className={styles.page}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>{school.name}</span>
          <Link href="/play" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
            ← ホームに戻る
          </Link>
        </div>
      </header>

      {/* ナビゲーション */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/play" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
          <Link href="/news" className={styles.navLink}>ニュース</Link>
          <Link href="/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/tournament" className={styles.navLink}>大会</Link>
          <Link href="/results" className={styles.navLink}>試合結果</Link>
          <Link href="/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      <main className={styles.main}>
        {/* 高校プロフィール */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>高校プロフィール</div>
          <div className={styles.profileGrid}>
            <span className={styles.pLabel}>学校名</span>
            <span className={styles.pValue}>
              {school.name}
              {isPlayerSchool && <span className={styles.playerSchoolBadge}>自校</span>}
            </span>

            <span className={styles.pLabel}>都道府県</span>
            <span className={styles.pValue}>{school.prefecture}</span>

            <span className={styles.pLabel}>評判</span>
            <span className={styles.pValue}>
              <StarRating stars={stars} />
              <span className={styles.reputationLabel}>{reputationToLabel(school.reputation)}</span>
            </span>

            <span className={styles.pLabel}>部員数</span>
            <span className={styles.pValue}>{school.players.length}名</span>
          </div>
        </div>

        {/* チーム戦力 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>チーム戦力</div>
          <div className={styles.strengthGrid}>
            <div className={styles.strengthItem}>
              <span className={styles.strengthLabel}>総合力</span>
              <span className={`${styles.strengthValue} ${styles['rank' + overallToRank(strength)]}`}>
                {strength}
              </span>
            </div>
            <div className={styles.strengthItem}>
              <span className={styles.strengthLabel}>ランク</span>
              <span className={`${styles.strengthRank} ${styles['rank' + overallToRank(strength)]}`}>
                {overallToRank(strength)}
              </span>
            </div>
          </div>
          <div className={styles.strengthBar}>
            <div className={styles.strengthBarInner} style={{ width: `${strength}%` }} />
          </div>
          {isPlayerSchool && (
            <div style={{ marginTop: 10 }}>
              <Link href="/team" style={{ fontSize: 12, color: 'var(--color-accent)' }}>
                詳細データを見る（チーム画面）→
              </Link>
            </div>
          )}
        </div>

        {/* 今年の成績 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>今年の成績</div>
          <div className={styles.recordGrid}>
            <span className={styles.pLabel}>夏大会</span>
            <span className={styles.pValue}>
              {school.yearResults.summerBestRound > 0
                ? `ベスト${roundToLabel(school.yearResults.summerBestRound)}`
                : '初戦敗退'}
            </span>
            <span className={styles.pLabel}>秋大会</span>
            <span className={styles.pValue}>
              {school.yearResults.autumnBestRound > 0
                ? `ベスト${roundToLabel(school.yearResults.autumnBestRound)}`
                : '初戦敗退'}
            </span>
            {school.yearResults.koshienAppearance && (
              <>
                <span className={styles.pLabel}>甲子園</span>
                <span className={styles.pValue}>
                  {school.yearResults.koshienBestRound > 0
                    ? `ベスト${roundToLabel(school.yearResults.koshienBestRound)}`
                    : '出場'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 主要選手 */}
        <div className={`${styles.section} ${styles.sectionFull}`}>
          <div className={styles.sectionTitle}>主要選手</div>
          {sortedPlayers.length === 0 ? (
            <p className={styles.empty}>選手データがありません</p>
          ) : (
            <ul className={styles.playerList}>
              {sortedPlayers.map((player) => {
                const overall = computePlayerOverall(player);
                const rank = overallToRank(overall);
                const isPitcher = player.position === 'pitcher';
                const style = isPitcher ? getPitcherStyle(player) : getBatterStyle(player);

                const grade = getPlayerGrade(player.enrollmentYear, currentYear);
                return (
                  <li key={player.id} className={styles.playerItem}>
                    <Link
                      href={isPlayerSchool ? `/team/${player.id}` : `/player/${player.id}`}
                      className={styles.playerLink}
                    >
                      <span className={`${styles.playerRank} ${styles['rank' + rank]}`}>
                        {rank}
                      </span>
                      <span className={styles.playerName}>
                        {player.lastName}{player.firstName}
                      </span>
                      <span className={styles.playerGrade}>{grade}年</span>
                      <span className={styles.playerPos}>{positionToLabel(player.position)}</span>
                      <span className={styles.playerStyle}>{style}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function roundToLabel(round: number): string {
  const labels: Record<number, string> = {
    1: '1回戦',
    2: '2回戦',
    3: '3回戦（ベスト16）',
    4: '4強（準々決勝）',
    5: '4強（準決勝）',
    6: '優勝',
  };
  return labels[round] ?? `ラウンド${round}`;
}

// ============================================================
// ページエントリポイント
// ============================================================

export default function SchoolPage() {
  const params = useParams();
  const schoolId = typeof params.schoolId === 'string' ? params.schoolId : '';
  const worldState = useWorldStore((s) => s.worldState);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const school = worldState.schools.find((s) => s.id === schoolId);
  if (!school) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>高校が見つかりません（ID: {schoolId}）</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const isPlayerSchool = school.id === worldState.playerSchoolId;
  return <SchoolDetail school={school} isPlayerSchool={isPlayerSchool} currentYear={worldState.currentDate.year} />;
}
