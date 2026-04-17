'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWorldStore } from '../../../stores/world-store';
import { computePlayerOverall } from '../../../engine/world/career/draft-system';
import type { Player } from '../../../engine/types/player';
import type { HighSchool } from '../../../engine/world/world-state';
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
  const velocity = p.velocity ?? 0;
  const maxBreak = Math.max(
    p.pitches?.slider ?? 0,
    p.pitches?.curve ?? 0,
    p.pitches?.changeup ?? 0,
    p.pitches?.fork ?? 0,
  );
  if (velocity >= 80 && maxBreak < 50) return '速球派';
  if (velocity < 80 && maxBreak >= 50) return '変化球派';
  return 'バランス型';
}

function getBatterStyle(player: Player): string {
  const b = player.stats.batting;
  const base = player.stats.base;
  if (b.power >= 65) return '長距離打者';
  if (b.contact >= 65) return '巧打者';
  if (base.speed >= 65) return '俊足';
  if (base.fielding >= 65) return '守備型';
  return 'バランス型';
}

function getPhysique(player: Player): string {
  const h = player.height ?? 175;
  const w = player.weight ?? 70;
  return `${h}cm / ${w}kg`;
}

function getPlayerGrade(enrollmentYear: number, currentYear: number): 1 | 2 | 3 {
  const grade = currentYear - enrollmentYear + 1;
  if (grade >= 3) return 3;
  if (grade >= 2) return 2;
  return 1;
}

// ============================================================
// 自校選手詳細（/team/[playerId] へリダイレクト）
// ============================================================

function RedirectToTeam({ playerId }: { playerId: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p>自校の選手は詳細データをご覧いただけます。</p>
      <Link href={`/team/${playerId}`} style={{
        display: 'inline-block',
        marginTop: 12,
        padding: '8px 20px',
        background: 'var(--color-primary)',
        color: '#fff',
        borderRadius: 4,
        textDecoration: 'none',
        fontSize: 14,
      }}>
        選手詳細へ →
      </Link>
    </div>
  );
}

// ============================================================
// 他校選手概要
// ============================================================

function OtherSchoolPlayerView({
  player,
  school,
  scoutReport,
  currentYear,
}: {
  player: Player;
  school: HighSchool;
  scoutReport: string | null;
  currentYear: number;
}) {
  const overall = computePlayerOverall(player);
  const rank = overallToRank(overall);
  const isPitcher = player.position === 'pitcher';
  const style = isPitcher ? getPitcherStyle(player) : getBatterStyle(player);
  const grade = getPlayerGrade(player.enrollmentYear, currentYear);

  return (
    <div className={styles.page}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>
            {player.lastName}{player.firstName}（{school.name}）
          </span>
          <Link href={`/school/${school.id}`} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
            ← {school.name}
          </Link>
        </div>
      </header>

      {/* ナビゲーション */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
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
            <span className={styles.pLabel}>所属</span>
            <span className={styles.pValue}>
              <Link href={`/school/${school.id}`} className={styles.schoolLink}>
                {school.name}
              </Link>
            </span>
            <span className={styles.pLabel}>学年</span>
            <span className={styles.pValue}>{grade}年生</span>
            <span className={styles.pLabel}>ポジション</span>
            <span className={styles.pValue}>{positionToLabel(player.position)}</span>
            <span className={styles.pLabel}>体格</span>
            <span className={styles.pValue}>{getPhysique(player)}</span>
          </div>
        </div>

        {/* 総合評価 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>スカウト評価</div>
          <div className={styles.rankDisplay}>
            <span className={`${styles.rankBig} ${styles['rank' + rank]}`}>{rank}</span>
            <div className={styles.rankDetail}>
              <span className={styles.rankLabel}>総合力ランク</span>
              <span className={styles.styleLabel}>{style}</span>
            </div>
          </div>
          <div className={styles.scoutNote}>
            ※ 数値は非公開。ランクのみ表示。
          </div>
          {isPitcher && (
            <div className={styles.pitcherInfo}>
              <span className={styles.pitcherBadge}>
                {player.stats.pitching?.velocity
                  ? `最速 ${Math.round(player.stats.pitching.velocity)}km/h 前後`
                  : '投球スタイル: ' + style}
              </span>
            </div>
          )}
        </div>

        {/* スカウトレポート */}
        {scoutReport && (
          <div className={`${styles.section} ${styles.sectionFull}`}>
            <div className={styles.sectionTitle}>スカウトレポート（自校スカウト）</div>
            <p className={styles.scoutReport}>{scoutReport}</p>
          </div>
        )}

        {/* スカウトへのリンク */}
        <div className={`${styles.section} ${styles.sectionFull}`}>
          <div className={styles.sectionTitle}>アクション</div>
          <div className={styles.actionLinks}>
            <Link href="/scout" className={styles.actionBtn}>
              スカウト画面で視察する →
            </Link>
            <Link href={`/school/${school.id}`} className={styles.actionBtnSecondary}>
              {school.name} の詳細を見る →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================================
// ページエントリポイント
// ============================================================

export default function PlayerPage() {
  const params = useParams();
  const playerId = typeof params.playerId === 'string' ? params.playerId : '';
  const worldState = useWorldStore((s) => s.worldState);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  // 全校から選手を検索
  let foundPlayer: Player | null = null;
  let foundSchool: HighSchool | null = null;

  for (const school of worldState.schools) {
    const player = school.players.find((p) => p.id === playerId);
    if (player) {
      foundPlayer = player;
      foundSchool = school;
      break;
    }
  }

  if (!foundPlayer || !foundSchool) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>選手が見つかりません（ID: {playerId}）</p>
        <Link href="/" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  // 自校の選手は /team/[playerId] へ誘導
  if (foundSchool.id === worldState.playerSchoolId) {
    return <RedirectToTeam playerId={playerId} />;
  }

  // スカウトレポートの取得
  const scoutReportData = worldState.scoutState.scoutReports.get(playerId);
  const scoutReport = scoutReportData?.scoutComment ?? null;

  return (
    <OtherSchoolPlayerView
      player={foundPlayer}
      school={foundSchool}
      scoutReport={scoutReport}
      currentYear={worldState.currentDate.year}
    />
  );
}
