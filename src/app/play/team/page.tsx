'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../../../stores/world-store';
import type { TeamViewState, PlayerRowView } from '../../../ui/projectors/view-state-types';
import type { PracticeMenuId } from '../../../engine/types/calendar';
import type { Player } from '../../../engine/types/player';
import { INDIVIDUAL_PRACTICE_MENUS } from '../../../data/practice-menus';
import styles from './page.module.css';

// チーム全体練習用オプション（従来の9種）
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

// 個別練習メニューオプション (B4: 15種全メニュー)
const MENU_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: '（共通）' },
  ...INDIVIDUAL_PRACTICE_MENUS.map((m) => ({ id: m.id, label: m.name })),
];

// ── 能力値タブの種別 ──────────────────────────────────────

type PlayerListTab = '一覧' | '基礎能力値' | '打撃能力値' | '投手能力値' | '通算成績';

const PLAYER_LIST_TABS: PlayerListTab[] = ['一覧', '基礎能力値', '打撃能力値', '投手能力値', '通算成績'];

// ── 能力値を0-100スケールのバー表示するミニヘルパー ──────────────────

function StatMini({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? '#1565c0' : pct >= 50 ? '#2e7d32' : '#546e7a';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </span>
  );
}

// ── 個別練習プルダウン ──────────────────────────────────────

function PracticeDropdown({ playerId, currentMenu, onChange }: {
  playerId: string;
  currentMenu: string | null | undefined;
  onChange: (playerId: string, menuId: string) => void;
}) {
  return (
    <select
      value={currentMenu ?? ''}
      onChange={(e) => onChange(playerId, e.target.value)}
      style={{
        fontSize: 11,
        padding: '2px 4px',
        borderRadius: 3,
        border: '1px solid #cfd8dc',
        background: currentMenu ? '#e3f2fd' : '#fff',
        cursor: 'pointer',
      }}
      title={currentMenu ? '個別メニュー設定中' : 'チーム共通メニュー'}
    >
      {MENU_OPTIONS.map((m) => (
        <option key={m.id} value={m.id}>{m.label}</option>
      ))}
    </select>
  );
}

// ── タブ別テーブル ──────────────────────────────────────

interface PlayerListTableProps {
  tab: PlayerListTab;
  rows: PlayerRowView[];
  players: Player[];  // raw engine data for stats
  onMenuChange: (playerId: string, menuId: string) => void;
}

function PlayerListTable({ tab, rows, players, onMenuChange }: PlayerListTableProps) {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  if (tab === '一覧') {
    return (
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
          {rows.map((p) => (
            <tr key={p.id}>
              <td style={{ color: 'var(--color-text-sub)', fontSize: 11 }}>{p.uniformNumber}</td>
              <td>
                <Link href={`/play/team/${p.id}`} className={styles.playerLink}>
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
                  <span style={{ marginLeft: 4, fontSize: 11, color: '#ff9800' }} title="翌日まで休養中">
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
                <PracticeDropdown
                  playerId={p.id}
                  currentMenu={p.individualMenu}
                  onChange={onMenuChange}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === '基礎能力値') {
    return (
      <table className={styles.playerTable}>
        <thead>
          <tr>
            <th>名前</th>
            <th>体力</th>
            <th>走力</th>
            <th>肩力</th>
            <th>守備</th>
            <th>集中</th>
            <th>精神</th>
            <th>個別練習</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const raw = playerMap.get(p.id);
            const base = raw?.stats.base;
            return (
              <tr key={p.id}>
                <td>
                  <Link href={`/play/team/${p.id}`} className={styles.playerLink}>
                    {p.lastName}{p.firstName}
                  </Link>
                  <span style={{ fontSize: 11, color: 'var(--color-text-sub)', marginLeft: 4 }}>
                    {p.positionLabel}
                  </span>
                </td>
                <td><StatMini value={base?.stamina ?? 0} /></td>
                <td><StatMini value={base?.speed ?? 0} /></td>
                <td><StatMini value={base?.armStrength ?? 0} /></td>
                <td><StatMini value={base?.fielding ?? 0} /></td>
                <td><StatMini value={base?.focus ?? 0} /></td>
                <td><StatMini value={base?.mental ?? 0} /></td>
                <td>
                  <PracticeDropdown
                    playerId={p.id}
                    currentMenu={p.individualMenu}
                    onChange={onMenuChange}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (tab === '打撃能力値') {
    return (
      <table className={styles.playerTable}>
        <thead>
          <tr>
            <th>名前</th>
            <th>パワー</th>
            <th>ミート</th>
            <th>選球眼</th>
            <th>テク</th>
            <th>個別練習</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const raw = playerMap.get(p.id);
            const bat = raw?.stats.batting;
            return (
              <tr key={p.id}>
                <td>
                  <Link href={`/play/team/${p.id}`} className={styles.playerLink}>
                    {p.lastName}{p.firstName}
                  </Link>
                  <span style={{ fontSize: 11, color: 'var(--color-text-sub)', marginLeft: 4 }}>
                    {p.positionLabel}
                  </span>
                </td>
                <td><StatMini value={bat?.power ?? 0} /></td>
                <td><StatMini value={bat?.contact ?? 0} /></td>
                <td><StatMini value={bat?.eye ?? 0} /></td>
                <td><StatMini value={bat?.technique ?? 0} /></td>
                <td>
                  <PracticeDropdown
                    playerId={p.id}
                    currentMenu={p.individualMenu}
                    onChange={onMenuChange}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (tab === '投手能力値') {
    // 投手のみ表示（投手でない選手はハイフン）
    return (
      <table className={styles.playerTable}>
        <thead>
          <tr>
            <th>名前</th>
            <th>球速</th>
            <th>制球</th>
            <th>スタミナ</th>
            <th>変化球</th>
            <th>個別練習</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const raw = playerMap.get(p.id);
            const pit = raw?.stats.pitching;
            const isPitcher = p.position === 'pitcher';
            const pitchCount = pit ? Object.keys(pit.pitches).length : 0;
            return (
              <tr key={p.id} style={{ opacity: isPitcher ? 1 : 0.55 }}>
                <td>
                  <Link href={`/play/team/${p.id}`} className={styles.playerLink}>
                    {p.lastName}{p.firstName}
                  </Link>
                  <span style={{ fontSize: 11, color: 'var(--color-text-sub)', marginLeft: 4 }}>
                    {p.positionLabel}
                  </span>
                </td>
                <td>{isPitcher && pit ? <StatMini value={pit.velocity} /> : <span style={{ color: '#bbb', fontSize: 11 }}>—</span>}</td>
                <td>{isPitcher && pit ? <StatMini value={pit.control} /> : <span style={{ color: '#bbb', fontSize: 11 }}>—</span>}</td>
                <td>{isPitcher && pit ? <StatMini value={pit.pitchStamina} /> : <span style={{ color: '#bbb', fontSize: 11 }}>—</span>}</td>
                <td>{isPitcher && pit ? <span style={{ fontSize: 12 }}>{pitchCount}種</span> : <span style={{ color: '#bbb', fontSize: 11 }}>—</span>}</td>
                <td>
                  <PracticeDropdown
                    playerId={p.id}
                    currentMenu={p.individualMenu}
                    onChange={onMenuChange}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (tab === '通算成績') {
    return (
      <table className={styles.playerTable}>
        <thead>
          <tr>
            <th>名前</th>
            <th>試合</th>
            <th>打数</th>
            <th>安打</th>
            <th>本塁打</th>
            <th>打率</th>
            <th>投球回</th>
            <th>勝/敗</th>
            <th>防御率</th>
            <th>個別練習</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const raw = playerMap.get(p.id);
            const cs = raw?.careerStats;
            const avg = cs && cs.atBats > 0
              ? (cs.hits / cs.atBats).toFixed(3).replace(/^0/, '')
              : '.000';
            const era = cs && cs.inningsPitched > 0
              ? ((cs.earnedRuns * 9) / cs.inningsPitched).toFixed(2)
              : '—';
            return (
              <tr key={p.id}>
                <td>
                  <Link href={`/play/team/${p.id}`} className={styles.playerLink}>
                    {p.lastName}{p.firstName}
                  </Link>
                  <span style={{ fontSize: 11, color: 'var(--color-text-sub)', marginLeft: 4 }}>
                    {p.positionLabel}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>{cs?.gamesPlayed ?? 0}</td>
                <td style={{ fontSize: 12 }}>{cs?.atBats ?? 0}</td>
                <td style={{ fontSize: 12 }}>{cs?.hits ?? 0}</td>
                <td style={{ fontSize: 12 }}>{cs?.homeRuns ?? 0}</td>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{avg}</td>
                <td style={{ fontSize: 12 }}>{cs?.inningsPitched?.toFixed(1) ?? '0.0'}</td>
                <td style={{ fontSize: 12 }}>{cs?.wins ?? 0}/{cs?.losses ?? 0}</td>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{era}</td>
                <td>
                  <PracticeDropdown
                    playerId={p.id}
                    currentMenu={p.individualMenu}
                    onChange={onMenuChange}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return null;
}

function TeamPage({ view }: { view: TeamViewState }) {
  const restAllInjuredAndWarned = useWorldStore((s) => s.restAllInjuredAndWarned);
  const setIndividualMenu = useWorldStore((s) => s.setIndividualMenu);
  const clearAllIndividualMenus = useWorldStore((s) => s.clearAllIndividualMenus);
  const setTeamPracticeMenu = useWorldStore((s) => s.setTeamPracticeMenu);
  const setTeamPracticePlan = useWorldStore((s) => s.setTeamPracticePlan);
  const worldState = useWorldStore((s) => s.worldState);
  const [restToast, setRestToast] = useState<string | null>(null);
  const [menuToast, setMenuToast] = useState<string | null>(null);
  const [playerListTab, setPlayerListTab] = useState<PlayerListTab>('一覧');

  // Raw players from worldState for stats tabs
  const rawPlayers: Player[] = worldState?.schools?.find(
    (s) => s.id === worldState.playerSchoolId
  )?.players ?? [];

  // 現在のチーム練習メニュー・プラン
  const playerSchool = worldState?.schools.find((s) => s.id === worldState.playerSchoolId);
  const currentTeamMenu: PracticeMenuId = playerSchool?.practiceMenu ?? 'batting_basic';
  // B3: 3スロットプランの現在値（未設定の場合は全スロット currentTeamMenu）
  const currentPlan = (playerSchool as { teamPracticePlan?: { slots: Array<{ menuId: PracticeMenuId }> } } | undefined)
    ?.teamPracticePlan ?? {
    slots: [
      { menuId: currentTeamMenu },
      { menuId: currentTeamMenu },
      { menuId: currentTeamMenu },
    ] as [{ menuId: PracticeMenuId }, { menuId: PracticeMenuId }, { menuId: PracticeMenuId }],
  };
  const [slot0, slot1, slot2] = [
    currentPlan.slots[0].menuId,
    currentPlan.slots[1].menuId,
    currentPlan.slots[2].menuId,
  ];

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

  // B3: 3スロットプランのスロット変更ハンドラ
  const handleSlotChange = (slotIdx: 0 | 1 | 2, menuId: string) => {
    const newSlots: [{ menuId: PracticeMenuId }, { menuId: PracticeMenuId }, { menuId: PracticeMenuId }] = [
      { menuId: slotIdx === 0 ? menuId as PracticeMenuId : slot0 },
      { menuId: slotIdx === 1 ? menuId as PracticeMenuId : slot1 },
      { menuId: slotIdx === 2 ? menuId as PracticeMenuId : slot2 },
    ];
    setTeamPracticePlan({ slots: newSlots });
    setMenuToast(`スロット${slotIdx + 1}を変更しました`);
    setTimeout(() => setMenuToast(null), 2000);
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
          <Link href="/play/practice" className={styles.navLink}>練習</Link>
          <Link href="/play/staff" className={styles.navLink}>スタッフ</Link>
          <Link href="/play/news" className={styles.navLink}>ニュース</Link>
          <Link href="/play/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/play/tournament" className={styles.navLink}>大会</Link>
          <Link href="/play/match/current" className={styles.navLink}>試合</Link>
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

          {/* チーム練習メニュー (B3: 3スロット) */}
          <div style={{ marginBottom: 14 }} data-testid="team-practice-plan">
            <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 6 }}>
              チーム全体の練習プラン（3メニュー同時設定、各1/3ずつ効果加算）
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {([0, 1, 2] as const).map((idx) => {
                const currentSlot = [slot0, slot1, slot2][idx];
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                      スロット{idx + 1}
                    </div>
                    <select
                      data-testid={`team-practice-slot-${idx}`}
                      value={currentSlot}
                      onChange={(e) => handleSlotChange(idx, e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #90caf9',
                        background: '#e3f2fd',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#0d47a1',
                        cursor: 'pointer',
                      }}
                    >
                      {TEAM_MENU_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {menuToast && (
                <span style={{
                  fontSize: 12, color: '#2e7d32',
                  background: '#e8f5e9', padding: '4px 10px', borderRadius: 4,
                  alignSelf: 'flex-end',
                }}>
                  ✓ {menuToast}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 4 }}>
              ※ 各スロットの練習効果を1/3ずつ加算。個別設定のない選手はこのプランに従います。
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

        {/* 選手一覧 (タブ切り替え) */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            選手一覧（{view.players.length}名）
            {restingCount > 0 && (
              <span style={{ marginLeft: 12, fontSize: 12, color: '#ff9800' }}>
                🛌 休養中 {restingCount}名
              </span>
            )}
          </div>

          {/* タブナビゲーション */}
          <div style={{
            display: 'flex',
            borderBottom: '2px solid #e0e0e0',
            marginBottom: 12,
            gap: 0,
            flexWrap: 'wrap',
          }}>
            {PLAYER_LIST_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setPlayerListTab(tab)}
                style={{
                  padding: '6px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: playerListTab === tab ? '2px solid #1565c0' : '2px solid transparent',
                  marginBottom: -2,
                  fontSize: 12,
                  fontWeight: playerListTab === tab ? 700 : 400,
                  color: playerListTab === tab ? '#1565c0' : '#546e7a',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab}
              </button>
            ))}
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

          <PlayerListTable
            tab={playerListTab}
            rows={view.players}
            players={rawPlayers}
            onMenuChange={handleMenuChange}
          />
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
