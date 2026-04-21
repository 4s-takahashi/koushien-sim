'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../../../stores/world-store';
import type { TeamViewState } from '../../../ui/projectors/view-state-types';
import type { PracticeMenuId } from '../../../engine/types/calendar';
import styles from './page.module.css';

const TEAM_MENU_OPTIONS: Array<{ id: PracticeMenuId; label: string }> = [
  { id: 'batting_basic',    label: '基礎打撃練習' },
  { id: 'batting_live',     label: '実戦打撃練習' },
  { id: 'pitching_basic',   label: '投球基礎練習' },
  { id: 'pitching_bullpen', label: '投手ブルペン強化' },
  { id: 'fielding_drill',   label: '守備練習' },
  { id: 'running',          label: '走塁・体力練習' },
  { id: 'strength',         label: '筋力トレーニング' },
  { id: 'mental',           label: 'メンタルトレーニング' },
  { id: 'rest',             label: '休養（疲労回復）' },
];

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
  const setTeamPracticeMenu = useWorldStore((s) => s.setTeamPracticeMenu);
  const worldState = useWorldStore((s) => s.worldState);
  const [restToast, setRestToast] = useState<string | null>(null);
  const [menuToast, setMenuToast] = useState<string | null>(null);

  // 現在のチーム練習メニュー
  const playerSchool = worldState?.schools.find((s) => s.id === worldState.playerSchoolId);
  const currentTeamMenu: PracticeMenuId = playerSchool?.practiceMenu ?? 'batting_basic';

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

  const handleTeamMenuChange = (menuId: string) => {
    setTeamPracticeMenu(menuId as PracticeMenuId);
    const label = TEAM_MENU_OPTIONS.find((m) => m.id === menuId)?.label ?? menuId;
    setMenuToast(`チーム練習メニューを「${label}」に変更しました`);
    setTimeout(() => setMenuToast(null), 3000);
  };

  const individualMenuCount = view.players.filter((p) => p.individualMenu).length;

  // 休養中選手数
  const restingCount = view.players.filter((p) => p.isResting).length;

  // 負傷・注意選手リスト
  const injuredPlayers = view.players.filter((p) => p.conditionBrief === '負傷中');
  const cautionPlayers = view.players.filter((p) => p.conditionBrief === '注意' || p.conditionBrief === '要休養');

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

        {/* 監督情報 (Phase 11-A2) */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>監督</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{view.manager.name}</span>
            <span style={{ color: 'var(--color-text-sub)' }}>
              通算 {view.manager.totalWins}勝{view.manager.totalLosses}敗
              {view.manager.koshienAppearances > 0 && (
                <span style={{ marginLeft: 6, color: '#c62828' }}>
                  甲子園{view.manager.koshienAppearances}回
                </span>
              )}
            </span>
          </div>
        </div>

        {/* 📋 今日の練習設定 (Phase 11.5-B) */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>📋 今日の練習設定</div>

          {/* チーム練習メニュー */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 6 }}>
              チーム全体の練習メニュー
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={currentTeamMenu}
                onChange={(e) => handleTeamMenuChange(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #90caf9',
                  background: '#e3f2fd',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0d47a1',
                  cursor: 'pointer',
                }}
              >
                {TEAM_MENU_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              {menuToast && (
                <span style={{
                  fontSize: 12, color: '#2e7d32',
                  background: '#e8f5e9', padding: '4px 10px', borderRadius: 4,
                }}>
                  ✓ {menuToast}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 4 }}>
              ※ 個別設定のない選手はこのメニューに従います。ホーム画面の「1日進む」で使用されます。
            </div>
          </div>

          {/* 負傷・注意選手リスト + 一括休養 */}
          {(injuredPlayers.length > 0 || cautionPlayers.length > 0) && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#c62828', fontWeight: 600, marginBottom: 6 }}>
                コンディション要注意 ({injuredPlayers.length + cautionPlayers.length}名)
              </div>
              {injuredPlayers.map((p) => (
                <Link key={p.id} href={`/team/${p.id}`} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 8px', background: '#ffebee', borderRadius: 4,
                  fontSize: 12, marginBottom: 2, textDecoration: 'none', color: '#333',
                  borderLeft: '3px solid #c62828',
                }}>
                  <span>🏥 {p.lastName}{p.firstName}</span>
                  <span style={{ color: '#c62828' }}>{p.conditionBrief}</span>
                </Link>
              ))}
              {cautionPlayers.map((p) => (
                <Link key={p.id} href={`/team/${p.id}`} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 8px', background: '#fff3e0', borderRadius: 4,
                  fontSize: 12, marginBottom: 2, textDecoration: 'none', color: '#333',
                  borderLeft: '3px solid #e65100',
                }}>
                  <span>⚠️ {p.lastName}{p.firstName}</span>
                  <span style={{ color: '#e65100' }}>{p.conditionBrief}</span>
                </Link>
              ))}
            </div>
          )}

          {/* 一括休養ボタン (Issue #5 改善版) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleBulkRest}
              style={{
                padding: '8px 16px',
                background: (injuredPlayers.length + cautionPlayers.length) > 0 ? '#fff3e0' : '#f5f5f5',
                color: (injuredPlayers.length + cautionPlayers.length) > 0 ? '#e65100' : '#999',
                border: `1px solid ${(injuredPlayers.length + cautionPlayers.length) > 0 ? '#ffb74d' : '#ddd'}`,
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="疲労50以上・負傷中の選手を1日休養に。翌日は通常練習に戻る"
            >
              🛌 けが人・けが注意を一括休養（1日）
            </button>
            {restingCount > 0 && (
              <span style={{ fontSize: 12, color: '#ff9800' }}>🛌 休養中 {restingCount}名</span>
            )}
            {restToast && (
              <span style={{
                fontSize: 12, color: '#2e7d32',
                background: '#e8f5e9', padding: '4px 10px', borderRadius: 4,
              }}>
                {restToast}
              </span>
            )}
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
                <th>やる気</th>
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
                  <td title={`モチベーション: ${p.motivation}`}>
                    <span style={{ fontSize: 13, marginRight: 2 }}>
                      {p.motivation >= 70 ? '🔥' : p.motivation <= 30 ? '😢' : ''}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: p.motivation >= 70 ? '#e65100' : p.motivation <= 30 ? '#1565c0' : 'var(--color-text-sub)',
                      fontWeight: (p.motivation >= 70 || p.motivation <= 30) ? 600 : 400,
                    }}>
                      {p.motivation}
                    </span>
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
