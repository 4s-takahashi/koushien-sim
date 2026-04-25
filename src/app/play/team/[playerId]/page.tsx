'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useWorldStore } from '../../../../stores/world-store';
import type { PlayerDetailViewState, StatRowView } from '../../../../ui/projectors/view-state-types';
import { POSITION_LABELS } from '../../../../ui/labels/position-labels';
import type { Position } from '../../../../engine/types/player';
import { analyzePitcherStyle, analyzeBatterStyle } from '../../../../engine/player/playStyle';
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

import type { Player } from '../../../../engine/types/player';

interface PlayerDetailProps {
  view: PlayerDetailViewState;
  prevPlayerId: string | null;
  nextPlayerId: string | null;
  rawPlayer: Player | null;
}

function PlayerDetail({ view, prevPlayerId, nextPlayerId, rawPlayer }: PlayerDetailProps) {
  const router = useRouter();

  // プレイスタイル分析
  const pitcherStyle = rawPlayer && view.position === 'pitcher'
    ? analyzePitcherStyle(rawPlayer)
    : null;
  const batterStyle = rawPlayer ? analyzeBatterStyle(rawPlayer) : null;

  const handlePrev = () => {
    if (prevPlayerId) router.push(`/play/team/${prevPlayerId}`);
  };
  const handleNext = () => {
    if (nextPlayerId) router.push(`/play/team/${nextPlayerId}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>
            {view.fullName}（{view.gradeLabel} / {view.positionLabel}）
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 前/次 ナビゲーション矢印 */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={!prevPlayerId}
              aria-label="前の選手"
              style={{
                padding: '3px 10px',
                background: prevPlayerId ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 4,
                color: prevPlayerId ? '#fff' : 'rgba(255,255,255,0.35)',
                fontSize: 14,
                cursor: prevPlayerId ? 'pointer' : 'not-allowed',
              }}
            >
              ←
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!nextPlayerId}
              aria-label="次の選手"
              style={{
                padding: '3px 10px',
                background: nextPlayerId ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 4,
                color: nextPlayerId ? '#fff' : 'rgba(255,255,255,0.35)',
                fontSize: 14,
                cursor: nextPlayerId ? 'pointer' : 'not-allowed',
              }}
            >
              →
            </button>
            <Link href="/play/team" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
              ← チームに戻る
            </Link>
          </div>
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
          <Link href="/play/staff" className={styles.navLink}>スタッフ</Link>
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
                  {' '}（{view.subPositions.map((p) => POSITION_LABELS[p as Position] ?? p).join('・')}）
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
            {/* モチベーション (Phase 11-A3 2026-04-19) */}
            <span className={styles.pLabel}>やる気</span>
            <div>
              <div className={styles.barOuter} style={{ width: 120 }}>
                <div
                  className={styles.barInner}
                  style={{
                    width: `${view.motivation}%`,
                    background: view.motivation >= 70 ? '#ff6d00' : view.motivation <= 30 ? '#1565c0' : 'var(--color-accent)',
                  }}
                />
              </div>
              <span style={{
                fontSize: 11,
                marginLeft: 4,
                color: view.motivation >= 70 ? '#e65100' : view.motivation <= 30 ? '#1565c0' : 'var(--color-text-sub)',
                fontWeight: (view.motivation >= 70 || view.motivation <= 30) ? 600 : 400,
              }}>
                {view.motivation >= 70 ? '🔥 ' : view.motivation <= 30 ? '😢 ' : ''}
                {view.motivationLabel} ({view.motivation})
              </span>
            </div>
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

        {/* シーズン別成績 (Issue #6 2026-04-19) */}
        {view.seasonRecords && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>シーズン別成績</div>
            <table className={styles.recordTable}>
              <thead>
                <tr>
                  <th>学年</th>
                  <th>試合</th>
                  <th>打数</th>
                  <th>安打</th>
                  <th>本塁打</th>
                  <th>打点</th>
                  <th>打率</th>
                  {view.pitchingRecord && (
                    <>
                      <th>投球回</th>
                      <th>勝</th>
                      <th>敗</th>
                      <th>奪三振</th>
                      <th>防御率</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {([1, 2, 3] as const).map((g) => {
                  const key = `grade${g}` as 'grade1' | 'grade2' | 'grade3';
                  const rec = view.seasonRecords?.[key];
                  if (!rec) {
                    return (
                      <tr key={g}>
                        <td>{g}年</td>
                        <td colSpan={view.pitchingRecord ? 11 : 6} style={{ color: '#999', fontSize: 12, textAlign: 'center' }}>
                          試合出場なし
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={g}>
                      <td><strong>{g}年</strong></td>
                      <td>{rec.gamesPlayed}</td>
                      <td>{rec.atBats}</td>
                      <td>{rec.hits}</td>
                      <td>{rec.homeRuns}</td>
                      <td>{rec.rbis}</td>
                      <td><strong>{rec.battingAverage}</strong></td>
                      {view.pitchingRecord && (
                        <>
                          <td>{rec.inningsPitched.toFixed(1)}</td>
                          <td>{rec.wins}</td>
                          <td>{rec.losses}</td>
                          <td>{rec.strikeouts}</td>
                          <td><strong>{rec.era}</strong></td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 今の気持ち (Phase 11.5-E) */}
        {view.concern && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>今の気持ち</div>
            <p style={{
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--color-text)',
              fontStyle: 'italic',
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              borderLeft: '3px solid var(--color-accent)',
              borderRadius: 4,
              margin: 0,
            }}>
              「{view.concern}」
            </p>
          </div>
        )}

        {/* 直近練習履歴 (Phase 11.5-E) */}
        {view.recentPracticeHistory && view.recentPracticeHistory.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>直近の練習履歴</div>
            <table className={styles.recordTable}>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>メニュー</th>
                  <th>疲労</th>
                  <th>やる気</th>
                </tr>
              </thead>
              <tbody>
                {view.recentPracticeHistory.map((h, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{h.dateLabel}</td>
                    <td style={{ fontSize: 12 }}>{h.menuLabel}</td>
                    <td style={{
                      fontSize: 12,
                      color: h.fatigueAfter >= 80 ? 'var(--color-primary)' : h.fatigueAfter >= 50 ? '#f57c00' : 'var(--color-text)',
                    }}>{h.fatigueAfter}%</td>
                    <td style={{
                      fontSize: 12,
                      color: h.motivationAfter >= 70 ? '#e65100' : h.motivationAfter <= 30 ? '#1565c0' : 'var(--color-text)',
                    }}>{h.motivationAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* イベント履歴 (Phase 11.5-E) */}
        {view.eventHistory && view.eventHistory.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>イベント履歴</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {view.eventHistory.map((e, i) => (
                <li key={i} style={{
                  display: 'flex',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  fontSize: 12,
                  color: e.importance === 'high'
                    ? 'var(--color-text)'
                    : e.importance === 'medium'
                    ? 'var(--color-text)'
                    : 'var(--color-text-sub)',
                }}>
                  <span style={{ fontSize: 16, lineHeight: 1.4 }}>{e.icon}</span>
                  <span style={{ color: 'var(--color-text-sub)', minWidth: 48 }}>{e.dateLabel}</span>
                  <span>{e.text}</span>
                  {e.importance === 'high' && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      padding: '1px 6px',
                      background: 'var(--color-primary)',
                      borderRadius: 4,
                      color: '#fff',
                    }}>重要</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* プレイスタイル分析 (v0.43.0) */}
        {(pitcherStyle || batterStyle) && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>🎯 プレイスタイル分析</div>

            {/* 投手スタイル */}
            {pitcherStyle && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  color: 'var(--color-accent)',
                  marginBottom: 8,
                }}>
                  ⚾ 投球スタイル: {pitcherStyle.pitchingStyle}
                </div>
                {pitcherStyle.bestPitch && (
                  <div style={{ fontSize: 13, marginBottom: 4, color: 'var(--color-text)' }}>
                    🏆 得意球種: <strong>{pitcherStyle.bestPitch.label}</strong>
                    （習得度{pitcherStyle.bestPitch.level}）
                  </div>
                )}
                <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--color-text-sub)' }}>
                  🎯 制球: {pitcherStyle.controlStyle}
                </div>
                {pitcherStyle.strengths.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#2e7d32', marginBottom: 3 }}>✅ 強み</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {pitcherStyle.strengths.map((s, i) => (
                        <li key={i} style={{ fontSize: 12, padding: '2px 0', color: 'var(--color-text)' }}>
                          ・{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pitcherStyle.weaknesses.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#c62828', marginBottom: 3 }}>⚠️ 弱み・課題</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {pitcherStyle.weaknesses.map((w, i) => (
                        <li key={i} style={{ fontSize: 12, padding: '2px 0', color: 'var(--color-text-sub)' }}>
                          ・{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 打撃スタイル */}
            {batterStyle && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  color: 'var(--color-accent)',
                  marginBottom: 8,
                }}>
                  🏏 打撃スタイル: {batterStyle.battingStyle}
                </div>
                <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--color-text-sub)' }}>
                  🎯 打球傾向: {batterStyle.pullTendency}
                </div>
                {batterStyle.strengths.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#2e7d32', marginBottom: 3 }}>✅ 強み</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {batterStyle.strengths.map((s, i) => (
                        <li key={i} style={{ fontSize: 12, padding: '2px 0', color: 'var(--color-text)' }}>
                          ・{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {batterStyle.weaknesses.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#c62828', marginBottom: 3 }}>⚠️ 弱み・課題</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {batterStyle.weaknesses.map((w, i) => (
                        <li key={i} style={{ fontSize: 12, padding: '2px 0', color: 'var(--color-text-sub)' }}>
                          ・{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 特性の説明 */}
            {(pitcherStyle?.traitDescriptions ?? batterStyle?.traitDescriptions ?? []).length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 4 }}>
                  ⭐ 特性
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(pitcherStyle?.traitDescriptions ?? batterStyle?.traitDescriptions ?? []).map((desc, i) => {
                    const traitLabel = view.traits[i] ?? '';
                    return (
                      <div key={i} style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 4,
                        borderLeft: '2px solid var(--color-accent)',
                        color: 'var(--color-text)',
                      }}>
                        <strong style={{ marginRight: 6 }}>{traitLabel}</strong>
                        {desc}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ページ下部ナビゲーション (v0.43.0) */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 0',
          marginTop: 8,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button
            type="button"
            disabled={!prevPlayerId}
            onClick={() => prevPlayerId && router.push(`/play/team/${prevPlayerId}`)}
            style={{
              padding: '8px 16px',
              background: prevPlayerId ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 6,
              color: prevPlayerId ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 13,
              cursor: prevPlayerId ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ← 前の選手
          </button>
          <Link href="/play/team" style={{
            fontSize: 12,
            color: 'var(--color-text-sub)',
            textDecoration: 'none',
          }}>
            チーム一覧へ
          </Link>
          <button
            type="button"
            disabled={!nextPlayerId}
            onClick={() => nextPlayerId && router.push(`/play/team/${nextPlayerId}`)}
            style={{
              padding: '8px 16px',
              background: nextPlayerId ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 6,
              color: nextPlayerId ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 13,
              cursor: nextPlayerId ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            次の選手 →
          </button>
        </div>
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
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  // 打順ベースのナビゲーション (lineup.battingOrder) または選手リスト順
  const playerSchool = worldState.schools?.find((s) => s.id === worldState.playerSchoolId);
  const allPlayers = playerSchool?.players ?? [];
  const battingOrder = playerSchool?.lineup?.battingOrder ?? [];

  // 打順が設定されていればその順、なければ全選手の登録順
  const navIds: string[] = battingOrder.length > 0 ? battingOrder : allPlayers.map((p) => p.id);

  const currentIndex = navIds.indexOf(playerId);
  const prevPlayerId = navIds.length > 1 && currentIndex >= 0
    ? navIds[(currentIndex - 1 + navIds.length) % navIds.length]
    : null;
  const nextPlayerId = navIds.length > 1 && currentIndex >= 0
    ? navIds[(currentIndex + 1) % navIds.length]
    : null;

  // raw player for play style analysis
  const rawPlayer = allPlayers.find((p) => p.id === playerId) ?? null;

  const view = getPlayerView(playerId);
  if (!view) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>選手が見つかりません（ID: {playerId}）</p>
        <Link href="/play/team" style={{ color: 'var(--color-primary)' }}>チームに戻る</Link>
      </div>
    );
  }

  return (
    <PlayerDetail
      view={view}
      prevPlayerId={prevPlayerId}
      nextPlayerId={nextPlayerId}
      rawPlayer={rawPlayer}
    />
  );
}
