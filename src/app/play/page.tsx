'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../../stores/world-store';
import type { HomeViewState } from '../../ui/projectors/view-state-types';
import type { WorldDayResult } from '../../engine/world/world-ticker';
import { SaveLoadPanel } from './save/SaveLoadPanel';
import styles from './page.module.css';
import { SchoolNewsBoard } from '../../ui/components/SchoolNewsBoard';
import { buildSchoolNewsList } from '../../engine/news/school-news';
import type { SchoolNewsItem } from '../../engine/news/school-news';

// ── ナビバッジコンポーネント (B2) ──────────────────────────────────

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid="nav-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        background: '#e53935',
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        padding: '0 3px',
        marginLeft: 3,
        lineHeight: 1,
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

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
            <strong>練習メニューを設定する</strong> — チーム画面で練習メニューを設定してください
          </span>
        </li>
        <li>
          <span className={styles.stepNum}>3</span>
          <span className={styles.stepText}>
            <strong>1日進める</strong> — 「1日進む」ボタンで時間を進めましょう
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
// 自校タブコンテンツ
// ============================================================

function OwnSchoolTab({ view, isAdvancing, onAdvanceDay, onAdvanceWeek, schoolNewsItems, schoolName }: {
  view: HomeViewState;
  isAdvancing: boolean;
  onAdvanceDay: () => void;
  onAdvanceWeek: () => void;
  schoolNewsItems: SchoolNewsItem[];
  schoolName: string;
}) {
  const cond = view.teamConditionSummary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* チーム状態サマリー */}
      {cond && (
        <div style={{
          background: '#f8f9fa',
          borderRadius: 6,
          padding: '10px 14px',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: 12, flex: 1 }}>
            <span style={{ fontSize: 13, color: '#2e7d32' }}>
              ✅ 良好 <strong>{cond.goodCount}</strong>名
            </span>
            <span style={{ fontSize: 13, color: '#e65100' }}>
              ⚠️ 注意 <strong>{cond.cautionCount}</strong>名
            </span>
            <span style={{ fontSize: 13, color: '#c62828' }}>
              🏥 負傷 <strong>{cond.dangerCount}</strong>名
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#546e7a' }}>
            平均モチベ: <strong>{cond.avgMotivation}</strong>
          </span>
        </div>
      )}

      {/* 負傷・注意選手リスト */}
      {cond && (cond.injuredPlayers.length > 0 || cond.warningPlayers.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cond.injuredPlayers.map((p) => (
            <Link key={p.id} href={`/team/${p.id}`} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '5px 10px', background: '#ffebee', borderRadius: 4,
              fontSize: 12, textDecoration: 'none', color: '#333',
              borderLeft: '3px solid #c62828',
            }}>
              <span>🏥 {p.name}</span>
              <span style={{ color: '#c62828' }}>{p.statusText}</span>
            </Link>
          ))}
          {cond.warningPlayers.map((p) => (
            <Link key={p.id} href={`/team/${p.id}`} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '5px 10px', background: '#fff3e0', borderRadius: 4,
              fontSize: 12, textDecoration: 'none', color: '#333',
              borderLeft: '3px solid #e65100',
            }}>
              <span>⚠️ {p.name}</span>
              <span style={{ color: '#e65100' }}>{p.statusText}</span>
            </Link>
          ))}
          <Link href="/play/team" style={{ fontSize: 11, color: '#e65100', marginTop: 2 }}>
            チーム画面で一括休養 →
          </Link>
        </div>
      )}

      {/* 今日やること（読み取り専用） */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        padding: '10px 14px',
      }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>今日やること</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            background: view.todayTask.type === 'match' ? '#1565c0'
              : view.todayTask.type === 'off' ? '#546e7a'
              : view.todayTask.type === 'scout' ? '#6a1b9a'
              : '#2e7d32',
            color: '#fff',
          }}>
            {view.todayTask.type === 'match'  ? '⚾ 試合日'
             : view.todayTask.type === 'off'  ? '💤 休養日'
             : view.todayTask.type === 'scout' ? '🔍 スカウト'
             : '🏋 練習日'}
          </span>
          <span style={{ fontSize: 13, color: '#37474f' }}>{view.todayTask.detail}</span>
        </div>
        {/* Feature #3 Phase 12-M: 現在の練習メニューを常時表示 */}
        <div style={{ marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>現在の練習メニュー</div>
          {view.teamPracticeMenuLabel ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 600,
                background: '#e8f5e9',
                color: '#2e7d32',
                border: '1px solid #a5d6a7',
              }}>
                🏋 {view.teamPracticeMenuLabel}
              </span>
              <Link href="/play/team" style={{ fontSize: 11, color: '#1565c0' }}>変更 →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>未設定</span>
              <Link
                href="/play/team"
                style={{
                  padding: '3px 10px',
                  background: '#1565c0',
                  color: '#fff',
                  borderRadius: 3,
                  fontSize: 12,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                練習メニューを設定する
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 進行ボタン */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onAdvanceDay}
          disabled={isAdvancing}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: isAdvancing ? '#ccc' : '#1565c0',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: isAdvancing ? 'not-allowed' : 'pointer',
          }}
        >
          ▶ 1日進む
        </button>
        <button
          onClick={onAdvanceWeek}
          disabled={isAdvancing}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: isAdvancing ? '#ccc' : '#37474f',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            cursor: isAdvancing ? 'not-allowed' : 'pointer',
          }}
        >
          ▶▶ 1週間進む
        </button>
      </div>
      {isAdvancing && (
        <span style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>処理中...</span>
      )}

      {/* 注目選手 */}
      {view.featuredPlayers.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#546e7a', fontWeight: 600, marginBottom: 6 }}>注目選手</div>
          {view.featuredPlayers.map((p) => (
            <Link key={p.id} href={`/team/${p.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', marginBottom: 3,
              background: '#f5f5f5', borderRadius: 4,
              textDecoration: 'none', color: '#333', fontSize: 12,
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: p.overallRank === 'S' ? '#c62828'
                  : p.overallRank === 'A' ? '#e65100'
                  : p.overallRank === 'B' ? '#1565c0' : '#546e7a',
                color: '#fff', fontSize: 10, fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>{p.overallRank}</span>
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: '#888' }}>{p.overall}</span>
              <span style={{ fontSize: 10, color: '#2e7d32' }}>{p.reason}</span>
            </Link>
          ))}
        </div>
      )}

      {/* OBの活躍 */}
      {view.recentGraduates && view.recentGraduates.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#546e7a', fontWeight: 600, marginBottom: 6 }}>🎓 最近のOB</div>
          {view.recentGraduates.map((g, i) => (
            <div key={i} style={{
              padding: '5px 10px', marginBottom: 3,
              background: g.careerPath === 'pro' ? 'linear-gradient(90deg,#fff9c4,#ffe082)' : '#f5f5f5',
              borderRadius: 4, fontSize: 12,
              borderLeft: g.careerPath === 'pro' ? '3px solid #ffc107' : '3px solid #ccc',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{g.name}</strong>
                <span style={{ fontSize: 10, color: '#666' }}>{g.graduationYear}年卒 / 総合{g.finalOverall}</span>
              </div>
              <div style={{ fontSize: 11, marginTop: 1, color: g.careerPath === 'pro' ? '#e65100' : '#455a64' }}>
                {g.careerPath === 'pro' && '⭐ '}{g.careerPathLabel}
                {g.bestAchievement && <span style={{ marginLeft: 6, color: '#666' }}>— {g.bestAchievement}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 自校ニュースボード (C2) */}
      <SchoolNewsBoard
        schoolId="user"
        items={schoolNewsItems}
        schoolName={schoolName}
      />
    </div>
  );
}

// ============================================================
// 他校タブコンテンツ
// ============================================================

function OtherSchoolTab({ view }: { view: HomeViewState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 大会情報 */}
      {view.isInTournamentSeason && view.tournament && (
        <div style={{
          background: view.tournament.isMatchDay ? '#e3f2fd' : '#f5f5f5',
          border: `1px solid ${view.tournament.isMatchDay ? '#1565c0' : '#e0e0e0'}`,
          borderRadius: 6, padding: '10px 14px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1565c0', marginBottom: 4 }}>
            🏟️ {view.tournament.typeName} 開催中 — {view.tournament.currentRound}
          </div>
          {view.tournament.nextMatchDate && !view.tournament.playerEliminated && (
            <div style={{ fontSize: 12, color: '#37474f' }}>
              次の試合: {view.tournament.nextMatchDate}
              {view.tournament.nextMatchDaysAway !== undefined && (
                <span style={{ marginLeft: 6, color: '#888' }}>（あと{view.tournament.nextMatchDaysAway}日）</span>
              )}
              {view.tournament.nextOpponent && (
                <span style={{ marginLeft: 6, color: '#1565c0', fontWeight: 600 }}>vs {view.tournament.nextOpponent}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 今後の予定 */}
      <div>
        <div style={{ fontSize: 12, color: '#546e7a', fontWeight: 600, marginBottom: 6 }}>今後の主な予定</div>
        {view.upcomingSchedule.length === 0 ? (
          <p style={{ fontSize: 12, color: '#888' }}>予定なし</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {view.upcomingSchedule.map((item, i) => (
              <li key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 8px', marginBottom: 3,
                background: '#f5f5f5', borderRadius: 4, fontSize: 12,
              }}>
                <span>{item.description}</span>
                <span style={{ color: '#888' }}>{item.monthDay}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 最近のニュース */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: '#546e7a', fontWeight: 600 }}>最近のニュース</div>
          <Link href="/play/news" style={{ fontSize: 11, color: '#1565c0' }}>もっと見る →</Link>
        </div>
        {view.recentNews.length === 0 ? (
          <p style={{ fontSize: 12, color: '#888' }}>まだニュースはありません。日を進めると情報が集まります。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {view.recentNews.slice(0, 8).map((item, i) => (
              <li key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '5px 8px', marginBottom: 3,
                background: item.importance === 'high' ? '#fff3e0'
                  : item.importance === 'medium' ? '#f5f5f5' : '#fafafa',
                borderRadius: 4, fontSize: 12,
                borderLeft: `2px solid ${item.importance === 'high' ? '#e65100'
                  : item.importance === 'medium' ? '#546e7a' : '#ccc'}`,
              }}>
                <span>{item.icon}</span>
                <span style={{ color: '#333' }}>{item.headline}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* スカウト予算 */}
      <div style={{
        background: '#f5f5f5', borderRadius: 6, padding: '10px 14px',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#546e7a', marginBottom: 6 }}>スカウト状況</div>
        <div style={{ fontSize: 13 }}>
          今月の視察残：<strong>{view.scoutBudgetRemaining}</strong>/{view.scoutBudgetTotal}回
          {view.scoutBudgetRemaining > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#2e7d32' }}>💡 視察できます</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {Array.from({ length: view.scoutBudgetTotal }, (_, i) => (
            <div key={i} style={{
              width: 12, height: 12, borderRadius: '50%',
              background: i < (view.scoutBudgetTotal - view.scoutBudgetRemaining) ? '#ccc' : '#2e7d32',
            }} />
          ))}
        </div>
        <Link href="/play/scout" style={{ fontSize: 11, color: '#1565c0', marginTop: 6, display: 'block' }}>
          スカウト画面へ →
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// 評価者タブコンテンツ（Phase 11.5-C で本実装予定）
// ============================================================

function EvaluatorTab({ view }: { view: HomeViewState }) {
  const highlights = view.evaluatorHighlights ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {highlights.length === 0 ? (
        <div style={{
          padding: 24, textAlign: 'center',
          background: '#f5f5f5', borderRadius: 6,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 14, color: '#546e7a', fontWeight: 600 }}>評価者システム</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Phase 11.5-C で実装予定です。
          </div>
          <div style={{ fontSize: 11, color: '#90a4ae', marginTop: 8 }}>
            メディア、評論家、スカウトなど24名の評価者があなたのチームの選手を評価します。
          </div>
        </div>
      ) : (
        highlights.map((h, i) => (
          <div key={i} style={{
            padding: '8px 12px', background: '#f5f5f5', borderRadius: 6,
            borderLeft: '3px solid #1565c0',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{h.playerName}</span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: ['SSS','SS','S'].includes(h.rank) ? '#c62828' : '#333',
              }}>{h.rank}</span>
            </div>
            <div style={{ fontSize: 11, color: '#546e7a', marginTop: 2 }}>
              {h.evaluatorName} ({h.evaluatorType})
              {h.comment && <span style={{ marginLeft: 6, color: '#888' }}>— {h.comment}</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================
// ホーム画面本体
// ============================================================

type HomeTab = '自校' | '他校' | '評価者';

function HomeContent({ view }: { view: HomeViewState }) {
  const advanceDay = useWorldStore((s) => s.advanceDay);
  const advanceWeek = useWorldStore((s) => s.advanceWeek);
  const getHomeView = useWorldStore((s) => s.getHomeView);
  const worldState = useWorldStore((s) => s.worldState);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveTab, setSaveTab] = useState<'save' | 'load'>('save');
  const [matchResult, setMatchResult] = useState<WorldDayResult | null>(null);
  const [tournamentStartResult, setTournamentStartResult] = useState<WorldDayResult | null>(null);
  const [currentView, setCurrentView] = useState<HomeViewState>(view);
  const [activeTab, setActiveTab] = useState<HomeTab>('自校');
  const router = useRouter();

  const pendingInteractiveMatch = worldState?.pendingInteractiveMatch ?? null;
  const pausedInteractiveMatch = worldState?.pausedInteractiveMatch ?? null;
  const discardPausedMatch = useWorldStore((s) => s.discardPausedMatch);

  const handleStartInteractiveMatch = useCallback(() => {
    if (!pendingInteractiveMatch) return;
    router.push('/play/match/current');
  }, [pendingInteractiveMatch, router]);

  const handleResumePausedMatch = useCallback(() => {
    if (!pausedInteractiveMatch) return;
    router.push('/play/match/current');
  }, [pausedInteractiveMatch, router]);

  const handleDiscardPausedMatch = useCallback(() => {
    if (!pausedInteractiveMatch) return;
    const confirmed = window.confirm(
      '中断中の試合を放棄しますか？\n試合は不戦敗扱いにはならず、通常の進行に戻ります。',
    );
    if (!confirmed) return;
    discardPausedMatch();
  }, [pausedInteractiveMatch, discardPausedMatch]);

  const handleAdvanceDay = useCallback(() => {
    setIsAdvancing(true);
    try {
      const result = advanceDay();
      if (result) {
        const newView = getHomeView();
        if (newView) setCurrentView(newView);
        if (result.seasonTransition === 'summer_tournament' || result.seasonTransition === 'autumn_tournament') {
          setTournamentStartResult(result);
        }
        if (result.playerMatchResult) {
          setMatchResult(result);
        }
      }
    } finally {
      setIsAdvancing(false);
    }
  }, [advanceDay, getHomeView]);

  const handleAdvanceWeek = useCallback(() => {
    setIsAdvancing(true);
    try {
      const results = advanceWeek();
      if (results.length > 0) {
        const newView = getHomeView();
        if (newView) setCurrentView(newView);
        const transitionResult = results.find(
          (r) => r.seasonTransition === 'summer_tournament' || r.seasonTransition === 'autumn_tournament'
        );
        if (transitionResult) setTournamentStartResult(transitionResult);
        const lastMatchResult = [...results].reverse().find((r) => r.playerMatchResult);
        if (lastMatchResult) setMatchResult(lastMatchResult);
      }
    } finally {
      setIsAdvancing(false);
    }
  }, [advanceWeek, getHomeView]);

  const displayView = currentView;

  const TABS: HomeTab[] = ['自校', '他校', '評価者'];

  return (
    <div className={styles.page}>
      {showSavePanel && (
        <SaveLoadPanel
          defaultTab={saveTab}
          onClose={() => setShowSavePanel(false)}
        />
      )}

      {matchResult && (
        <MatchResultModal
          result={matchResult}
          onClose={() => setMatchResult(null)}
        />
      )}

      {/* ナビゲーション (B1: 10項目 / B2: バッジ付き) */}
      <nav className={styles.nav} data-testid="main-nav">
        <div className={styles.navInner}>
          <Link href="/play" className={`${styles.navLink} ${styles.navLinkActive}`}>
            ホーム
          </Link>
          <Link href="/play/team" className={styles.navLink}>
            チーム
          </Link>
          <Link href="/play/practice" className={styles.navLink}>
            練習{displayView.navBadges?.practice ? <NavBadge count={displayView.navBadges.practice} /> : null}
          </Link>
          <Link href="/play/staff" className={styles.navLink}>
            スタッフ{displayView.navBadges?.staff ? <NavBadge count={displayView.navBadges.staff} /> : null}
          </Link>
          <Link href="/play/news" className={styles.navLink}>
            ニュース{displayView.navBadges?.news ? <NavBadge count={displayView.navBadges.news} /> : null}
          </Link>
          <Link href="/play/scout" className={styles.navLink}>
            スカウト{displayView.navBadges?.scout ? <NavBadge count={displayView.navBadges.scout} /> : null}
          </Link>
          <Link href="/play/tournament" className={styles.navLink}>
            大会
            {displayView.isInTournamentSeason && <span className={styles.navIndicator}>🔴</span>}
            {displayView.navBadges?.tournament ? <NavBadge count={displayView.navBadges.tournament} /> : null}
          </Link>
          <Link href="/play/match/current" className={styles.navLink}>
            試合{displayView.navBadges?.match ? <NavBadge count={displayView.navBadges.match} /> : null}
          </Link>
          <Link href="/play/results" className={styles.navLink}>
            試合結果{displayView.navBadges?.results ? <NavBadge count={displayView.navBadges.results} /> : null}
          </Link>
          <Link href="/play/ob" className={styles.navLink}>
            OB{displayView.navBadges?.ob ? <NavBadge count={displayView.navBadges.ob} /> : null}
          </Link>
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

      {/* 大会シーズン中バナー */}
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

      {/* 初回プレイウェルカムメッセージ */}
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

        {/* 中断中の試合 再開バナー */}
        {pausedInteractiveMatch && (
          <div className={`${styles.card} ${styles.cardFull}`} style={{
            background: 'linear-gradient(90deg, #fff3e0, #ffe0b2)',
            borderLeft: '4px solid #ff9800',
          }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#e65100' }}>
              ⏸ 中断中の試合があります
            </div>
            {(() => {
              const opponent = worldState?.schools?.find(
                (s) => s.id === pausedInteractiveMatch.pending.opponentSchoolId
              );
              return opponent ? (
                <div style={{ fontSize: 13, color: '#37474f', marginTop: 6 }}>
                  vs <strong>{opponent.name}</strong>
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#90a4ae' }}>
                    {pausedInteractiveMatch.pending.round}回戦
                  </span>
                </div>
              ) : null;
            })()}
            <div style={{ fontSize: 11, color: '#78909c', marginTop: 4 }}>
              中断時刻: {new Date(pausedInteractiveMatch.pausedAt).toLocaleString('ja-JP')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={handleResumePausedMatch}
                style={{
                  padding: '10px 24px', background: '#e65100',
                  border: 'none', borderRadius: 4, color: '#fff',
                  fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
                }}
              >
                ▶ 試合を再開
              </button>
              <button
                onClick={handleDiscardPausedMatch}
                style={{
                  padding: '10px 16px', background: 'transparent',
                  border: '1px solid #e65100', borderRadius: 4, color: '#e65100',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                放棄
              </button>
            </div>
          </div>
        )}

        {/* インタラクティブ試合待機バナー */}
        {pendingInteractiveMatch && !pausedInteractiveMatch && (
          <div className={`${styles.card} ${styles.cardFull} ${styles.matchDayCard}`}>
            <div className={styles.matchDayTitle}>
              ⚾ 試合の準備ができました！
            </div>
            {(() => {
              const opponent = worldState?.schools?.find(
                (s) => s.id === pendingInteractiveMatch.opponentSchoolId
              );
              return opponent ? (
                <div className={styles.matchDayOpponent}>
                  vs <strong>{opponent.name}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#90a4ae' }}>
                    {pendingInteractiveMatch.round}回戦
                  </span>
                </div>
              ) : null;
            })()}
            <p className={styles.matchDayHint}>
              インタラクティブ試合モードで1球ずつ采配できます。
            </p>
            <div style={{ marginTop: 12 }}>
              <button
                onClick={handleStartInteractiveMatch}
                style={{
                  padding: '10px 24px',
                  background: '#1565c0',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                ▶ 試合を始める
              </button>
            </div>
          </div>
        )}

        {/* 試合日バナー */}
        {!pendingInteractiveMatch && displayView.tournament?.isMatchDay && !displayView.tournament.playerEliminated && (
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
              「1日進む」で試合を行います。勝利して上位進出を目指しましょう！
            </p>
          </div>
        )}

        {/* 次の試合まで */}
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

        {/* タブナビゲーション */}
        <div style={{
          display: 'flex',
          borderBottom: '2px solid #e0e0e0',
          marginBottom: 16,
          gap: 0,
        }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 20px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #1565c0' : '2px solid transparent',
                marginBottom: -2,
                fontSize: 13,
                fontWeight: activeTab === tab ? 700 : 400,
                color: activeTab === tab ? '#1565c0' : '#546e7a',
                cursor: 'pointer',
              }}
            >
              {tab === '自校' ? `⚾ 自校` : tab === '他校' ? `📰 他校` : `🔍 評価者`}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className={`${styles.card} ${styles.cardFull}`} style={{ padding: 16 }}>
          {activeTab === '自校' && (
            <OwnSchoolTab
              view={displayView}
              isAdvancing={isAdvancing}
              onAdvanceDay={handleAdvanceDay}
              onAdvanceWeek={handleAdvanceWeek}
              schoolNewsItems={buildSchoolNewsList(worldState?.eventLog ?? [])}
              schoolName={displayView.team.schoolName}
            />
          )}
          {activeTab === '他校' && <OtherSchoolTab view={displayView} />}
          {activeTab === '評価者' && <EvaluatorTab view={displayView} />}
        </div>

        {/* クイックナビ */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>メニュー</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { href: '/play/team', label: '選手一覧・ラインナップ・練習設定' },
              { href: '/play/scout', label: 'スカウト・勧誘' },
              { href: '/play/practice', label: '練習試合・紅白戦' },
              { href: '/play/tournament', label: '大会情報' },
              { href: '/play/results', label: '試合結果' },
              { href: '/play/ob', label: 'OB・卒業生' },
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
  const hasHydrated = useWorldStore((s) => s._hasHydrated);
  const getHomeView = useWorldStore((s) => s.getHomeView);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!worldState) {
      router.replace('/new-game');
    }
  }, [hasHydrated, worldState, router]);

  if (!hasHydrated || !worldState) {
    return <div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>;
  }

  const view = getHomeView();
  if (!view) return <div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>;

  return <HomeContent view={view} />;
}
