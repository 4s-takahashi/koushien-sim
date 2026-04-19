'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../../../stores/world-store';
import type { TeamViewState } from '../../../ui/projectors/view-state-types';
import styles from './page.module.css';

function getRankClass(rank: string): string {
  const map: Record<string, string> = {
    S: styles.rankS, A: styles.rankA, B: styles.rankB,
    C: styles.rankC, D: styles.rankD, E: styles.rankE,
  };
  return map[rank] ?? styles.rankE;
}

function getCondClass(cond: string): string {
  if (cond === '負傷中') return styles.condInjury;
  if (cond === '要休養') return styles.condRest;
  if (cond === '注意') return styles.condCaution;
  return styles.condGood;
}

function getGradeClass(grade: number): string {
  if (grade === 3) return styles.grade3;
  if (grade === 2) return styles.grade2;
  return styles.grade1;
}

const MENU_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: '（共通）' },
  { id: 'batting_basic', label: '打撃・基礎' },
  { id: 'batting_live', label: '打撃・実戦' },
  { id: 'pitching_basic', label: '投球・基礎' },
  { id: 'pitching_bullpen', label: '投球・ブルペン' },
  { id: 'fielding_drill', label: '守備' },
  { id: 'running', label: '走塁' },
  { id: 'strength', label: '筋力' },
  { id: 'mental', label: 'メンタル' },
  { id: 'rest', label: '休養' },
];

function TeamPage({ view }: { view: TeamViewState }) {
  const restAllInjuredAndWarned = useWorldStore((s) => s.restAllInjuredAndWarned);
  const setIndividualMenu = useWorldStore((s) => s.setIndividualMenu);
  const clearAllIndividualMenus = useWorldStore((s) => s.clearAllIndividualMenus);
  const [restToast, setRestToast] = useState<string | null>(null);

  const handleBulkRest = () => {
    const { count } = restAllInjuredAndWarned();
    if (count === 0) {
      setRestToast('休養対象の選手はいません');
    } else {
      setRestToast(`${count}人の選手を1日休養にしました（翌日に自動復帰）`);
    }
    setTimeout(() => setRestToast(null), 3500);
  };

  const handleMenuChange = (playerId: string, menuId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIndividualMenu(playerId, (menuId || null) as any);
  };

  const individualMenuCount = view.players.filter((p) => p.individualMenu).length;

  // 休養中選手数 (UI 表示用: restOverride が true の選手をカウント)
  const restingCount = view.players.filter((p) => p.isResting).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>{view.schoolName} — 選手一覧</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
            {view.prefecture} / {view.reputationLabel}（評判{view.reputation}）
          </span>
        </div>
      </header>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/play" className={styles.navLink}>ホーム</Link>
          <Link href="/play/team" className={`${styles.navLink} ${styles.navLinkActive}`}>チーム</Link>
          <Link href="/play/news" className={styles.navLink}>ニュース</Link>
          <Link href="/play/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/play/tournament" className={styles.navLink}>大会</Link>
          <Link href="/play/results" className={styles.navLink}>試合結果</Link>
          <Link href="/play/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      <main className={styles.main}>
        {/* チーム力サマリー */}
        <div className={styles.statsBar}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>チーム総合力</div>
            <div className={styles.statValue}>{view.totalStrength}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>投手力</div>
            <div className={styles.statValue}>{view.pitchingStrength}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>打撃力</div>
            <div className={styles.statValue}>{view.battingStrength}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>守備力</div>
            <div className={styles.statValue}>{view.defenseStrength}</div>
            <div className={styles.statSub}>
              3年{view.grade3Count} / 2年{view.grade2Count} / 1年{view.grade1Count}名
            </div>
          </div>
        </div>

        {/* ラインナップ */}
        {view.lineup ? (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>スターティングラインナップ</div>
            <table className={styles.playerTable}>
              <thead>
                <tr>
                  <th>打順</th>
                  <th>名前</th>
                  <th>守備</th>
                  <th>総合力</th>
                </tr>
              </thead>
              <tbody>
                {view.lineup.starters.map((s) => (
                  <tr key={s.playerId}>
                    <td>
                      <span className={styles.lineupOrder}>{s.battingOrder}</span>
                    </td>
                    <td>
                      <Link href={`/team/${s.playerId}`} className={styles.playerLink}>
                        {s.playerName}
                      </Link>
                    </td>
                    <td>{s.positionLabel}</td>
                    <td className={getRankClass('B')}>{s.overall}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>ラインナップ</div>
            <p className={styles.noGame}>ラインナップ未設定</p>
          </div>
        )}

        {/* 選手一覧 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            選手一覧（{view.players.length}名）
            {restingCount > 0 && (
              <span style={{ marginLeft: 12, fontSize: 12, color: '#ff9800' }}>
                🛌 休養中 {restingCount}名
              </span>
            )}
          </div>

          {/* 一括休養ボタン (Issue #5 2026-04-19) */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={handleBulkRest}
              style={{
                padding: '6px 14px',
                background: '#fff3e0',
                color: '#e65100',
                border: '1px solid #ffb74d',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="疲労50以上・負傷中の選手を1日休養に。翌日は通常練習に戻る"
            >
              🛌 けが人・けが注意を一括休養（1日）
            </button>
            {restToast && (
              <span style={{
                fontSize: 12,
                color: '#2e7d32',
                background: '#e8f5e9',
                padding: '4px 10px',
                borderRadius: 4,
              }}>
                {restToast}
              </span>
            )}
          </div>

          {/* 個別練習一括クリア (Phase 11-A1 Issue #4) */}
          {individualMenuCount > 0 && (
            <div style={{ marginBottom: 8, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#666' }}>個別練習: {individualMenuCount}名</span>
              <button
                onClick={() => {
                  if (window.confirm('全選手の個別練習設定をクリアしますか？')) {
                    clearAllIndividualMenus();
                  }
                }}
                style={{
                  padding: '2px 8px', fontSize: 11,
                  background: 'transparent', border: '1px solid #999',
                  borderRadius: 3, cursor: 'pointer', color: '#666',
                }}
              >
                全クリア
              </button>
            </div>
          )}

          <table className={styles.playerTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>名前</th>
                <th>学年</th>
                <th>ポジション</th>
                <th>総合力</th>
                <th>状態</th>
                <th>打順</th>
                <th>個別練習</th>
              </tr>
            </thead>
            <tbody>
              {view.players.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--color-text-sub)', fontSize: 11 }}>{p.uniformNumber}</td>
                  <td>
                    <Link href={`/team/${p.id}`} className={styles.playerLink}>
                      {p.lastName}{p.firstName}
                    </Link>
                  </td>
                  <td>
                    <span className={`${styles.gradeTag} ${getGradeClass(p.grade)}`}>
                      {p.gradeLabel}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{p.positionLabel}</td>
                  <td>
                    <span className={getRankClass(p.overallRank)}>{p.overall}</span>
                    {' '}
                    <span className={getRankClass(p.overallRank)} style={{ fontSize: 11 }}>
                      {p.overallRank}
                    </span>
                  </td>
                  <td className={getCondClass(p.conditionBrief)}>
                    {p.conditionBrief}
                    {p.isResting && (
                      <span style={{
                        marginLeft: 4,
                        fontSize: 11,
                        color: '#ff9800',
                      }} title="翌日まで休養中">
                        🛌
                      </span>
                    )}
                  </td>
                  <td>
                    {p.battingOrderNumber !== null
                      ? <span className={styles.lineupOrder}>{p.battingOrderNumber}</span>
                      : <span style={{ color: 'var(--color-text-sub)', fontSize: 11 }}>-</span>
                    }
                  </td>
                  <td>
                    <select
                      value={p.individualMenu ?? ''}
                      onChange={(e) => handleMenuChange(p.id, e.target.value)}
                      style={{
                        fontSize: 11,
                        padding: '2px 4px',
                        borderRadius: 3,
                        border: '1px solid #cfd8dc',
                        background: p.individualMenu ? '#e3f2fd' : '#fff',
                        cursor: 'pointer',
                      }}
                      title={p.individualMenu ? '個別メニュー設定中' : 'チーム共通メニュー'}
                    >
                      {MENU_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default function TeamPageRoute() {
  const worldState = useWorldStore((s) => s.worldState);
  const getTeamView = useWorldStore((s) => s.getTeamView);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const view = getTeamView();
  if (!view) return <div style={{ padding: 40 }}>読み込み中...</div>;

  return <TeamPage view={view} />;
}
