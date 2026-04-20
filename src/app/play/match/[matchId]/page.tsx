'use client';

/**
 * /play/match/[matchId] — インタラクティブ試合画面
 *
 * Phase 10-B: 1球 / 1打席 / 1イニング / 試合終了まで采配しながら観戦できる。
 * Phase 10-C: WorldState.pendingInteractiveMatch からゲームを初期化し、
 *             試合終了後にブラケット更新してホームへ戻る。
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useWorldStore } from '../../../../stores/world-store';
import { useMatchStore } from '../../../../stores/match-store';
import { buildMatchTeam } from '../../../../engine/world/match-team-builder';
import type { MatchState } from '../../../../engine/match/types';
import { EMPTY_BASES } from '../../../../engine/match/types';
import type { TacticalOrder } from '../../../../engine/match/types';
import type { MatchViewState, PitchLogEntry } from '../../../../ui/projectors/view-state-types';
import styles from './match.module.css';
import { PsycheWindow } from './PsycheWindow';
import { DetailedOrderModal } from './DetailedOrderModal';

// ============================================================
// 型
// ============================================================

type SelectMode =
  | { type: 'none' }
  | { type: 'pinch_hit' }
  | { type: 'pitching_change' }
  | { type: 'steal' }
  | { type: 'bunt' }
  | { type: 'detailed_order'; mode: 'batter' | 'pitcher' };

// ============================================================
// ヘルパー
// ============================================================

function pauseKindLabel(view: MatchViewState): { icon: string; title: string; detail: string; cls: string } {
  const r = view.pauseReason;
  if (!r) return { icon: '⏸', title: '一時停止', detail: '', cls: styles.pauseBannerGeneral };
  switch (r.kind) {
    case 'scoring_chance':
      return { icon: '⚾', title: `チャンス！ — ${r.detail}`, detail: '采配を選択してください', cls: styles.pauseBannerChance };
    case 'pinch':
      return { icon: '🔴', title: `ピンチ！ — ${r.detail}`, detail: '采配を選択してください', cls: styles.pauseBannerPinch };
    case 'pitcher_tired':
      return { icon: '💦', title: `投手疲労 — スタミナ ${Math.round(r.staminaPct * 100)}%`, detail: '継投を検討してください', cls: styles.pauseBannerTired };
    case 'close_and_late':
      return { icon: '⚡', title: `${r.inning}回 クロスゲーム`, detail: '1点が明暗を分けます', cls: styles.pauseBannerClose };
    case 'at_bat_start':
      return { icon: '🧢', title: '打席開始', detail: '采配サインを送ってください', cls: styles.pauseBannerAtBat };
    case 'pitch_start':
      return { icon: '⚾', title: '投球前', detail: '指示を選択してください', cls: styles.pauseBannerAtBat };
    case 'inning_end':
      return { icon: '🔔', title: 'イニング終了', detail: '次のイニングへ', cls: styles.pauseBannerGeneral };
    case 'match_end':
      return { icon: '🏆', title: '試合終了', detail: '結果を確認してください', cls: styles.pauseBannerEnd };
    default:
      return { icon: '⏸', title: '一時停止', detail: '', cls: styles.pauseBannerGeneral };
  }
}

function outcomeLabel(outcome: string): { text: string; cls: string } {
  const map: Record<string, { text: string; cls: string }> = {
    called_strike: { text: '見逃し', cls: styles.logOutcomeStrike },
    swinging_strike: { text: '空振り', cls: styles.logOutcomeStrike },
    ball: { text: 'ボール', cls: styles.logOutcomeBall },
    foul: { text: 'ファウル', cls: styles.logOutcomeOut },
    foul_bunt: { text: 'ファウルバント', cls: styles.logOutcomeStrike },
    in_play: { text: 'インプレー', cls: styles.logOutcomeHit },
  };
  return map[outcome] ?? { text: outcome, cls: '' };
}

// ============================================================
// スコアボード
// ============================================================

function Scoreboard({ view }: { view: MatchViewState }) {
  const outs = view.count; // Use count from view
  const stateOuts = (view as MatchViewState & { _outs?: number })._outs ?? 0;

  return (
    <div className={styles.scoreboard}>
      <div className={styles.scoreboardMain}>
        <div className={styles.scoreboardTeams}>
          <span className={styles.teamName}>{view.awaySchoolName}</span>
          <div className={styles.scoreDisplay}>
            <span className={styles.scoreAway}>{view.score.away}</span>
            <span className={styles.scoreDash}>-</span>
            <span className={styles.scoreHome}>{view.score.home}</span>
          </div>
          <span className={styles.teamName}>{view.homeSchoolName}</span>
        </div>

        <div className={styles.scoreboardInfo}>
          <span className={styles.inningLabel}>{view.inningLabel}</span>
          <div className={styles.outsCount}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${styles.outDot} ${
                  // outsLabel = "2アウト" → outsNum
                  parseInt(view.outsLabel) > i ? styles.outDotFilled : ''
                }`}
              />
            ))}
          </div>
          <span className={styles.countDisplay}>
            <span className={styles.countBalls}>{view.count.balls}</span>
            -
            <span className={styles.countStrikes}>{view.count.strikes}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// イニングスコア
// ============================================================

function InningScoreTable({ view }: { view: MatchViewState }) {
  const innings = Math.max(9, view.inningScores.home.length, view.inningScores.away.length);
  const currentInningNum = parseInt(view.inningLabel.replace(/回.*/, ''));

  return (
    <div className={styles.inningScores}>
      <table className={styles.inningScoreTable}>
        <thead>
          <tr>
            <th></th>
            {Array.from({ length: innings }, (_, i) => (
              <th key={i}>{i + 1}</th>
            ))}
            <th>R</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={styles.inningScoreTeamCell}>{view.awaySchoolName}</td>
            {Array.from({ length: innings }, (_, i) => (
              <td
                key={i}
                className={i + 1 === currentInningNum && view.inningLabel.includes('表') ? styles.inningScoreCurrent : ''}
              >
                {view.inningScores.away[i] ?? '-'}
              </td>
            ))}
            <td className={styles.inningScoreTotal}>{view.score.away}</td>
          </tr>
          <tr>
            <td className={styles.inningScoreTeamCell}>{view.homeSchoolName}</td>
            {Array.from({ length: innings }, (_, i) => (
              <td
                key={i}
                className={i + 1 === currentInningNum && view.inningLabel.includes('裏') ? styles.inningScoreCurrent : ''}
              >
                {view.inningScores.home[i] ?? '-'}
              </td>
            ))}
            <td className={styles.inningScoreTotal}>{view.score.home}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// ダイヤモンド
// ============================================================

function Diamond({ view }: { view: MatchViewState }) {
  return (
    <div className={styles.diamondCard}>
      <div className={styles.cardTitle}>走者</div>
      <div className={styles.diamond}>
        <div className={styles.diamondInner}>
          {/* 1塁 */}
          <div className={`${styles.base} ${styles.base1} ${view.bases.first ? styles.baseOccupied : styles.baseEmpty}`} />
          {/* 2塁 */}
          <div className={`${styles.base} ${styles.base2} ${view.bases.second ? styles.baseOccupied : styles.baseEmpty}`} />
          {/* 3塁 */}
          <div className={`${styles.base} ${styles.base3} ${view.bases.third ? styles.baseOccupied : styles.baseEmpty}`} />
          {/* ホーム */}
          <div className={`${styles.base} ${styles.homeBase} ${styles.baseEmpty}`} />

          {/* 走者名 */}
          {view.bases.first && (
            <span className={`${styles.runnerName} ${styles.runnerName1}`}>
              {view.bases.first.runnerName}
            </span>
          )}
          {view.bases.second && (
            <span className={`${styles.runnerName} ${styles.runnerName2}`}>
              {view.bases.second.runnerName}
            </span>
          )}
          {view.bases.third && (
            <span className={`${styles.runnerName} ${styles.runnerName3}`}>
              {view.bases.third.runnerName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 投手パネル
// ============================================================

function PitcherPanel({ view }: { view: MatchViewState }) {
  const p = view.pitcher;
  const staminaCls =
    p.staminaClass === 'fresh' ? styles.staminaFresh
    : p.staminaClass === 'normal' ? styles.staminaNormal
    : p.staminaClass === 'tired' ? styles.staminaTired
    : styles.staminaExhausted;

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelHeader}>投手</div>
      <div className={styles.panelName}>{p.name}</div>

      <div className={styles.panelStat}>
        <span className={styles.panelStatLabel}>スタミナ</span>
        <div className={styles.staminaBar}>
          <div
            className={`${styles.staminaFill} ${staminaCls}`}
            style={{ width: `${Math.round(p.staminaPct * 100)}%` }}
          />
        </div>
        <span className={styles.staminaPct}>{Math.round(p.staminaPct * 100)}%</span>
      </div>

      <div className={styles.panelStat}>
        <span className={styles.panelStatLabel}>球数</span>
        <span>{p.pitchCount}球</span>
      </div>

      <div className={styles.panelStat}>
        <span className={styles.panelStatLabel}>調子</span>
        <span>{p.moodLabel}</span>
      </div>

      <div className={styles.panelStat}>
        <span className={styles.panelStatLabel}>球種</span>
        <span>
          {p.availablePitches.slice(0, 3).map((pitch) => (
            <span key={pitch.type} className={styles.pitchBadge}>{pitch.type}</span>
          ))}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 打者パネル
// ============================================================

function BatterPanel({ view }: { view: MatchViewState }) {
  const b = view.batter;

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelHeader}>{view.isPlayerBatting ? '打者（自校）' : '打者'}</div>
      <div className={styles.panelName}>{b.name}</div>

      <div className={styles.panelStat}>
        <span className={styles.panelStatLabel}>今日の成績</span>
        <span>{b.battingAvg}</span>
      </div>

      <div className={styles.panelStat}>
        <span className={styles.panelStatLabel}>総合力</span>
        <span>{b.overall}</span>
      </div>

      <div className={styles.panelStat}>
        <span className={styles.panelStatLabel}>調子</span>
        <span>{b.moodLabel}</span>
      </div>

      {b.trait && (
        <div className={styles.panelStat}>
          <span className={styles.panelStatLabel}>特性</span>
          <span className={styles.traitBadge}>{b.trait}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 勝負所バナー
// ============================================================

function PauseBanner({ view }: { view: MatchViewState }) {
  if (!view.pauseReason) return null;
  const { icon, title, detail, cls } = pauseKindLabel(view);

  return (
    <div className={`${styles.pauseBanner} ${cls}`}>
      <span className={styles.pauseIcon}>{icon}</span>
      <div className={styles.pauseContent}>
        <div className={styles.pauseTitle}>{title}</div>
        {detail && <div className={styles.pauseDetail}>{detail}</div>}
      </div>
    </div>
  );
}

// ============================================================
// 采配ボタン
// ============================================================

interface TacticsBtnProps {
  view: MatchViewState;
  onOrder: (order: TacticalOrder) => void;
  selectMode: SelectMode;
  setSelectMode: (m: SelectMode) => void;
  disabled: boolean;
  /** 上部にバナー (pauseBanner 情報) を統合表示する場合は true */
  showBanner?: boolean;
}

function TacticsBar({ view, onOrder, selectMode, setSelectMode, disabled, showBanner }: TacticsBtnProps) {
  const isPlayerBatting = view.isPlayerBatting;
  const bannerInfo = showBanner && view.pauseReason ? pauseKindLabel(view) : null;

  const handleNone = useCallback(() => {
    onOrder({ type: 'none' });
  }, [onOrder]);

  const handleBunt = useCallback(() => {
    if (selectMode.type === 'bunt') {
      setSelectMode({ type: 'none' });
    } else {
      setSelectMode({ type: 'bunt' });
    }
  }, [selectMode, setSelectMode]);

  const handleSteal = useCallback(() => {
    if (selectMode.type === 'steal') {
      setSelectMode({ type: 'none' });
    } else {
      setSelectMode({ type: 'steal' });
    }
  }, [selectMode, setSelectMode]);

  const handlePinchHit = useCallback(() => {
    if (selectMode.type === 'pinch_hit') {
      setSelectMode({ type: 'none' });
    } else {
      setSelectMode({ type: 'pinch_hit' });
    }
  }, [selectMode, setSelectMode]);

  const handlePitchingChange = useCallback(() => {
    if (selectMode.type === 'pitching_change') {
      setSelectMode({ type: 'none' });
    } else {
      setSelectMode({ type: 'pitching_change' });
    }
  }, [selectMode, setSelectMode]);

  const handleMoundVisit = useCallback(() => {
    onOrder({ type: 'mound_visit' });
  }, [onOrder]);

  const handleDetailedOrder = useCallback(() => {
    if (selectMode.type === 'detailed_order') {
      setSelectMode({ type: 'none' });
    } else {
      const mode = isPlayerBatting ? 'batter' : 'pitcher';
      setSelectMode({ type: 'detailed_order', mode });
    }
  }, [selectMode, setSelectMode, isPlayerBatting]);

  return (
    <div className={styles.tacticsCard}>
      {bannerInfo ? (
        <div className={`${styles.tacticsBanner} ${bannerInfo.cls}`}>
          <span className={styles.tacticsBannerIcon}>{bannerInfo.icon}</span>
          <div className={styles.tacticsBannerText}>
            <div className={styles.tacticsBannerTitle}>{bannerInfo.title}</div>
            {bannerInfo.detail && <div className={styles.tacticsBannerDetail}>{bannerInfo.detail}</div>}
          </div>
        </div>
      ) : (
        <div className={styles.cardTitle}>采配</div>
      )}
      <div className={styles.tacticsGrid}>
        {/* 何もしない */}
        <button
          className={`${styles.tacticsBtn} ${selectMode.type === 'none' ? styles.tacticsBtnActive : ''}`}
          onClick={handleNone}
          disabled={disabled}
        >
          そのまま
          <span className={styles.tacticsBtnLabel}>サインなし</span>
        </button>

        {/* バント */}
        <button
          className={`${styles.tacticsBtn} ${selectMode.type === 'bunt' ? styles.tacticsBtnActive : ''}`}
          onClick={handleBunt}
          disabled={disabled || !isPlayerBatting || !view.canBunt}
          title={!view.canBunt ? '走者なし or 2アウト' : ''}
        >
          バント
          <span className={styles.tacticsBtnLabel}>{view.canBunt ? '実行可' : '不可'}</span>
        </button>

        {/* 盗塁 */}
        <button
          className={`${styles.tacticsBtn} ${selectMode.type === 'steal' ? styles.tacticsBtnActive : ''}`}
          onClick={handleSteal}
          disabled={disabled || !isPlayerBatting || !view.canSteal}
          title={!view.canSteal ? '走者条件未達' : ''}
        >
          盗塁
          <span className={styles.tacticsBtnLabel}>{view.canSteal ? '実行可' : '不可'}</span>
        </button>

        {/* 代打 */}
        <button
          className={`${styles.tacticsBtn} ${selectMode.type === 'pinch_hit' ? styles.tacticsBtnActive : ''}`}
          onClick={handlePinchHit}
          disabled={disabled || !isPlayerBatting || !view.canPinchHit}
          title={!view.canPinchHit ? 'ベンチなし' : ''}
        >
          代打
          <span className={styles.tacticsBtnLabel}>{view.canPinchHit ? `${view.availablePinchHitters.length}人` : '不可'}</span>
        </button>

        {/* 投手交代 */}
        <button
          className={`${styles.tacticsBtn} ${selectMode.type === 'pitching_change' ? styles.tacticsBtnActive : ''}`}
          onClick={handlePitchingChange}
          disabled={disabled || isPlayerBatting || !view.canChangePitcher}
          title={!view.canChangePitcher ? 'リリーフなし' : ''}
        >
          投手交代
          <span className={styles.tacticsBtnLabel}>{view.canChangePitcher ? `${view.availableRelievers.length}人` : '不可'}</span>
        </button>

        {/* マウンド訪問 */}
        <button
          className={styles.tacticsBtn}
          onClick={handleMoundVisit}
          disabled={disabled || isPlayerBatting}
        >
          マウンド訪問
          <span className={styles.tacticsBtnLabel}>スタミナ回復</span>
        </button>

        {/* 詳細采配 (Phase 7-C) */}
        <button
          className={`${styles.tacticsBtn} ${styles.tacticsBtnDetail} ${selectMode.type === 'detailed_order' ? styles.tacticsBtnActive : ''}`}
          onClick={handleDetailedOrder}
          disabled={disabled}
          title="コース・球種など細かく指示する"
        >
          ⚙ 細かく指示
          <span className={styles.tacticsBtnLabel}>{isPlayerBatting ? '打者指示' : '投手指示'}</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 采配選択モーダル（代打・投手交代・走者選択等）
// ============================================================

interface SelectPanelProps {
  mode: Exclude<SelectMode, { type: 'none' } | { type: 'detailed_order'; mode: 'batter' | 'pitcher' }>;
  view: MatchViewState;
  onSelect: (order: TacticalOrder) => void;
  onCancel: () => void;
}

function SelectPanel({ mode, view, onSelect, onCancel }: SelectPanelProps) {
  if (mode.type === 'pinch_hit') {
    return (
      <div className={styles.selectOverlay} onClick={onCancel}>
        <div className={styles.selectPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.selectTitle}>代打を選択（現在: {view.batter.name}）</div>
          <ul className={styles.selectList}>
            {view.availablePinchHitters.map((ph) => (
              <li
                key={ph.id}
                className={styles.selectItem}
                onClick={() =>
                  onSelect({
                    type: 'pinch_hit',
                    outPlayerId: view.batter.id,
                    inPlayerId: ph.id,
                  })
                }
              >
                <span className={styles.selectItemName}>{ph.name}</span>
                <span className={styles.selectItemDetail}>総合力 {ph.overall}</span>
              </li>
            ))}
          </ul>
          <button className={styles.selectCancelBtn} onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    );
  }

  if (mode.type === 'pitching_change') {
    return (
      <div className={styles.selectOverlay} onClick={onCancel}>
        <div className={styles.selectPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.selectTitle}>継投相手を選択</div>
          <ul className={styles.selectList}>
            {view.availableRelievers.map((r) => {
              const staminaPct = Math.round(r.staminaPct * 100);
              const staminaCls =
                staminaPct >= 70 ? styles.staminaHigh
                : staminaPct >= 40 ? styles.staminaMid
                : styles.staminaLow;
              return (
                <li
                  key={r.id}
                  className={styles.selectItem}
                  onClick={() =>
                    onSelect({
                      type: 'pitching_change',
                      newPitcherId: r.id,
                    })
                  }
                >
                  <span className={styles.selectItemName}>{r.name}</span>
                  <span className={`${styles.selectItemDetail} ${staminaCls}`}>
                    スタミナ {staminaPct}%
                  </span>
                </li>
              );
            })}
          </ul>
          <button className={styles.selectCancelBtn} onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    );
  }

  if (mode.type === 'steal') {
    // 盗塁は走者選択（1塁→2塁、2塁→3塁）
    const stealers: { runnerId: string; name: string; from: string }[] = [];
    if (view.bases.first && !view.bases.second) {
      stealers.push({ runnerId: view.bases.first.runnerName, name: view.bases.first.runnerName, from: '1塁→2塁' });
    }
    if (view.bases.second && !view.bases.third) {
      stealers.push({ runnerId: view.bases.second.runnerName, name: view.bases.second.runnerName, from: '2塁→3塁' });
    }

    return (
      <div className={styles.selectOverlay} onClick={onCancel}>
        <div className={styles.selectPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.selectTitle}>盗塁する走者を選択</div>
          <ul className={styles.selectList}>
            {stealers.map((s, i) => (
              <li
                key={i}
                className={styles.selectItem}
                onClick={() =>
                  onSelect({ type: 'steal', runnerId: s.runnerId })
                }
              >
                <span className={styles.selectItemName}>{s.name}</span>
                <span className={styles.selectItemDetail}>{s.from}</span>
              </li>
            ))}
          </ul>
          <button className={styles.selectCancelBtn} onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    );
  }

  if (mode.type === 'bunt') {
    // バントは打者 ID が必要
    return (
      <div className={styles.selectOverlay} onClick={onCancel}>
        <div className={styles.selectPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.selectTitle}>バント指示</div>
          <ul className={styles.selectList}>
            <li
              className={styles.selectItem}
              onClick={() =>
                onSelect({ type: 'bunt', playerId: view.batter.id })
              }
            >
              <span className={styles.selectItemName}>{view.batter.name} にバントを指示</span>
            </li>
          </ul>
          <button className={styles.selectCancelBtn} onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================
// 直近投球ログ
// ============================================================

function RecentLog({ pitches }: { pitches: PitchLogEntry[] }) {
  const recent = pitches.slice(-8).reverse();
  if (recent.length === 0) return null;

  return (
    <div className={styles.logCard}>
      <div className={styles.cardTitle}>直近の投球</div>
      <ul className={styles.logList}>
        {recent.map((e, i) => {
          const { text, cls } = outcomeLabel(e.outcome);
          return (
            <li key={i} className={styles.logItem}>
              <span className={styles.logInning}>{e.inning}回{e.half === 'top' ? '表' : '裏'}</span>
              <span>{e.batterName}</span>
              <span className={`${styles.logOutcome} ${cls}`}>{text}</span>
              <span className={styles.logOutcome}>{e.pitchType}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// 自動進行バー
// ============================================================

interface AutoPlayBarProps {
  enabled: boolean;
  speed: 'slow' | 'normal' | 'fast';
  onToggle: () => void;
  onSetSpeed: (s: 'slow' | 'normal' | 'fast') => void;
  // 進行ボタン (2026-04-19 Issue 進行パネル統合)
  pitchModeEnabled?: boolean;
  canProgress?: boolean;
  onStepOnePitch?: () => void;
  onStepOneAtBat?: () => void;
  onStepOneInning?: () => void;
  onRunToEnd?: () => void;
  isProcessing?: boolean;
  isMatchOver?: boolean;
}

function AutoPlayBar({
  enabled, speed, onToggle, onSetSpeed,
  pitchModeEnabled, canProgress, onStepOnePitch, onStepOneAtBat,
  onStepOneInning, onRunToEnd, isProcessing, isMatchOver,
}: AutoPlayBarProps) {
  // コントロールバー (自動進行 + 進行ボタンを1行に統合)
  // 2026-04-19 Issue #9 + Issue 進行パネル統合
  //
  // 左側: 進行ボタン (1球/1打席/1イニング/最後まで)
  // 右側: 自動進行 (⏸/▶ + 速度3種)
  // 自動進行ONのときは手動進行ボタンを disabled にする
  const stepsDisabled = !canProgress || enabled;
  const showSteps = !isMatchOver && onStepOnePitch && onStepOneAtBat && onStepOneInning && onRunToEnd;

  return (
    <div className={styles.autoPlayBar} data-compact="true">
      {/* 進行ボタン (左寄せ) */}
      {showSteps && (
        <div className={styles.progressBtnGroup} role="group" aria-label="進行ボタン">
          {pitchModeEnabled && (
            <button
              className={styles.progressIconBtn}
              onClick={onStepOnePitch}
              disabled={stepsDisabled}
              title={enabled ? '自動進行ON中は使えません' : '1球進める'}
              aria-label="1球進める"
            >
              ⚾<span className={styles.progressIconLabel}>1球</span>
            </button>
          )}
          <button
            className={`${styles.progressIconBtn} ${styles.progressIconBtnPrimary}`}
            onClick={onStepOneAtBat}
            disabled={stepsDisabled}
            title={enabled ? '自動進行ON中は使えません' : '1打席進める'}
            aria-label="1打席進める"
          >
            👤<span className={styles.progressIconLabel}>1打席</span>
          </button>
          <button
            className={styles.progressIconBtn}
            onClick={onStepOneInning}
            disabled={stepsDisabled}
            title={enabled ? '自動進行ON中は使えません' : '1イニング進める'}
            aria-label="1イニング進める"
          >
            🔔<span className={styles.progressIconLabel}>1回</span>
          </button>
          <button
            className={`${styles.progressIconBtn} ${styles.progressIconBtnDanger}`}
            onClick={onRunToEnd}
            disabled={!canProgress}
            title="試合終了まで自動で進める"
            aria-label="最後まで進める"
          >
            ⏩<span className={styles.progressIconLabel}>最後</span>
          </button>
        </div>
      )}

      {isProcessing && (
        <span className={styles.progressProcessing}>処理中...</span>
      )}

      <div className={styles.autoPlaySpacer} />

      {/* 自動進行 (右寄せ) */}
      <button
        className={`${styles.autoPlayToggle} ${enabled ? styles.autoPlayToggleOn : ''}`}
        onClick={onToggle}
        title={enabled ? '自動進行を停止' : '自動進行を開始'}
        aria-label={enabled ? '自動進行を停止' : '自動進行を開始'}
      >
        {enabled ? '⏸' : '▶'}
      </button>
      <div className={styles.autoPlaySpeedGroup} role="group" aria-label="再生速度">
        <button
          className={`${styles.autoPlaySpeedBtn} ${speed === 'slow' ? styles.autoPlaySpeedBtnActive : ''}`}
          onClick={() => onSetSpeed('slow')}
          title="ゆっくり"
          aria-label="ゆっくり"
        >
          🐢
        </button>
        <button
          className={`${styles.autoPlaySpeedBtn} ${speed === 'normal' ? styles.autoPlaySpeedBtnActive : ''}`}
          onClick={() => onSetSpeed('normal')}
          title="標準速度"
          aria-label="標準速度"
        >
          ▶
        </button>
        <button
          className={`${styles.autoPlaySpeedBtn} ${speed === 'fast' ? styles.autoPlaySpeedBtnActive : ''}`}
          onClick={() => onSetSpeed('fast')}
          title="高速"
          aria-label="高速"
        >
          ⚡
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 実況ログパネル（Phase 7-A-3: アコーディオン化）
// ============================================================

interface NarrationPanelProps {
  entries: import('../../../../ui/narration/buildNarration').NarrationEntry[];
}

/** テキストを指定文字数で切り詰める */
function truncateText(text: string, max = 48): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function NarrationPanel({ entries }: NarrationPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const reversed = [...entries].reverse();
  const recent = reversed.slice(0, 10);
  const older = reversed.slice(10);
  const hasOlder = older.length > 0;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderEntry = (e: import('../../../../ui/narration/buildNarration').NarrationEntry) => {
    const isExpanded = expandedIds.has(e.id);
    const cls =
      e.kind === 'score'     ? styles.narrationEntryScore :
      e.kind === 'highlight' ? styles.narrationEntryHighlight :
      e.kind === 'out'       ? styles.narrationEntryOut :
      e.kind === 'chance'    ? styles.narrationEntryChance :
      styles.narrationEntryNormal;

    return (
      <div
        key={e.id}
        className={`${styles.narrationEntry} ${cls} ${styles.narrationEntryAccordion}`}
        onClick={() => toggleExpand(e.id)}
        role="button"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <span className={styles.narrationFull}>{e.text}</span>
        ) : (
          <span className={styles.narrationSummary}>{truncateText(e.text)}</span>
        )}
        <span className={styles.narrationChevron}>{isExpanded ? '▲' : '▼'}</span>
      </div>
    );
  };

  return (
    <div className={styles.narrationPanel}>
      <div className={styles.narrationTitle}>📻 実況ログ</div>
      {reversed.length === 0 ? (
        <div className={styles.narrationEmpty}>試合開始を待っています…</div>
      ) : (
        <>
          {recent.map((e) => renderEntry(e))}
          {hasOlder && (
            <>
              {showAll && older.map((e) => renderEntry(e))}
              <button
                className={styles.narrationMoreBtn}
                onClick={(ev) => { ev.stopPropagation(); setShowAll((v) => !v); }}
              >
                {showAll ? '▲ 折りたたむ' : `▼ もっと見る（${older.length}件）`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// 試合終了モーダル
// ============================================================

interface ResultModalProps {
  view: MatchViewState;
  onGoHome: () => void;
  onGoTournament: () => void;
}

function ResultModal({ view, onGoHome, onGoTournament }: ResultModalProps) {
  // matchResult はストアから取る
  const matchResult = useMatchStore((s) => s.matchResult);
  if (!matchResult) return null;

  const playerSchoolName = view.homeSchoolName; // 仮（実際はストアから取得すべきだが view から近似）
  const isPlayerHome = true; // TODO: ストアから取得
  const playerScore = isPlayerHome ? matchResult.finalScore.home : matchResult.finalScore.away;
  const opponentScore = isPlayerHome ? matchResult.finalScore.away : matchResult.finalScore.home;
  const playerWon = (isPlayerHome && matchResult.winner === 'home') ||
                    (!isPlayerHome && matchResult.winner === 'away');

  return (
    <div className={styles.resultOverlay}>
      <div className={styles.resultModal}>
        <div className={`${styles.resultTitle} ${playerWon ? styles.resultTitleWin : styles.resultTitleLose}`}>
          {playerWon ? '🎉 勝利！' : '⚾ 試合終了'}
        </div>
        <div className={styles.resultScore}>
          <span className={styles.resultScoreAway}>{matchResult.finalScore.away}</span>
          <span className={styles.resultVs}>-</span>
          <span className={styles.resultScoreHome}>{matchResult.finalScore.home}</span>
        </div>
        <div className={styles.resultOpponent}>
          {view.awaySchoolName} vs {view.homeSchoolName}
        </div>
        <div className={styles.resultMessage}>
          {playerWon
            ? '次の試合も頑張りましょう！'
            : '今回は惜しかった。来年こそ甲子園へ！'
          }
        </div>
        <div className={styles.resultBtns}>
          <button className={styles.resultBtn} onClick={onGoTournament}>
            ブラケットへ
          </button>
          <button
            className={`${styles.resultBtn} ${styles.resultBtnPrimary}`}
            onClick={onGoHome}
          >
            ホームへ戻る
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// メインページ
// ============================================================

export default function MatchPage() {
  const params = useParams();
  const _matchId = params?.matchId ?? 'current';

  const router = useRouter();
  const worldState = useWorldStore((s) => s.worldState);
  const hasHydrated = useWorldStore((s) => s._hasHydrated);
  const finishInteractiveMatch = useWorldStore((s) => s.finishInteractiveMatch);
  const consumePausedMatch = useWorldStore((s) => s.consumePausedMatch);
  const getHomeView = useWorldStore((s) => s.getHomeView);

  const initMatch = useMatchStore((s) => s.initMatch);
  const restoreFromSnapshot = useMatchStore((s) => s.restoreFromSnapshot);
  const resetMatch = useMatchStore((s) => s.resetMatch);
  const getMatchView = useMatchStore((s) => s.getMatchView);
  const matchResult = useMatchStore((s) => s.matchResult);
  const isProcessing = useMatchStore((s) => s.isProcessing);
  const runnerMode = useMatchStore((s) => s.runnerMode);
  const setTimeMode = useMatchStore((s) => s.setTimeMode);
  const setPitchMode = useMatchStore((s) => s.setPitchMode);
  const applyOrder = useMatchStore((s) => s.applyOrder);
  const stepOnePitch = useMatchStore((s) => s.stepOnePitch);
  const stepOneAtBat = useMatchStore((s) => s.stepOneAtBat);
  const stepOneInning = useMatchStore((s) => s.stepOneInning);
  const runToEnd = useMatchStore((s) => s.runToEnd);
  const resumeFromPause = useMatchStore((s) => s.resumeFromPause);
  const pauseReason = useMatchStore((s) => s.pauseReason);
  const pitchLog = useMatchStore((s) => s.pitchLog);
  const narration = useMatchStore((s) => s.narration);
  const autoPlayEnabled = useMatchStore((s) => s.autoPlayEnabled);
  const autoPlaySpeed = useMatchStore((s) => s.autoPlaySpeed);
  const toggleAutoPlay = useMatchStore((s) => s.toggleAutoPlay);
  const setAutoPlaySpeed = useMatchStore((s) => s.setAutoPlaySpeed);

  const [selectMode, setSelectMode] = useState<SelectMode>({ type: 'none' });
  const [initialized, setInitialized] = useState(false);

  // ゲーム初期化
  useEffect(() => {
    // persist の復元が完了するまで何もしない
    // (hydration 前に router.replace すると、リロード時に /play へ飛んでしまう)
    if (!hasHydrated) return;
    if (initialized) return;

    if (!worldState) {
      // ゲーム未開始 → /play に戻せば PlayPage が /new-game にリダイレクトする
      router.replace('/play');
      return;
    }

    // ── 中断中の試合があれば復元 (Issue #8 2026-04-19) ──
    if (worldState.pausedInteractiveMatch) {
      const paused = consumePausedMatch();
      if (paused) {
        restoreFromSnapshot(
          {
            matchStateJson: paused.matchStateJson,
            narrationJson: paused.narrationJson,
            pitchLogJson: paused.pitchLogJson,
          },
          worldState.playerSchoolId,
          worldState.seed,
        );
        setInitialized(true);
        return;
      }
    }

    const pending = worldState.pendingInteractiveMatch;
    if (!pending) {
      // pendingInteractiveMatch がない場合はホームへ
      router.replace('/play');
      return;
    }

    const playerSchool = worldState.schools.find((s) => s.id === worldState.playerSchoolId);
    const opponentSchool = worldState.schools.find((s) => s.id === pending.opponentSchoolId);

    if (!playerSchool || !opponentSchool) {
      router.replace('/play');
      return;
    }

    const homeSchool = pending.playerSide === 'home' ? playerSchool : opponentSchool;
    const awaySchool = pending.playerSide === 'home' ? opponentSchool : playerSchool;

    const homeTeam = buildMatchTeam(homeSchool);
    const awayTeam = buildMatchTeam(awaySchool);

    const initialState: MatchState = {
      config: {
        innings: 9,
        maxExtras: 3,
        useDH: false,
        isTournament: true,
        isKoshien: false,
      },
      homeTeam,
      awayTeam,
      currentInning: 1,
      currentHalf: 'top',
      outs: 0,
      count: { balls: 0, strikes: 0 },
      bases: EMPTY_BASES,
      score: { home: 0, away: 0 },
      inningScores: { home: [], away: [] },
      currentBatterIndex: 0,
      pitchCount: 0,
      log: [],
      isOver: false,
      result: null,
    };

    initMatch(initialState, worldState.playerSchoolId, worldState.seed);
    setInitialized(true);
  }, [hasHydrated, worldState, initialized, initMatch, router, consumePausedMatch, restoreFromSnapshot]);

  // 試合終了後の処理
  const handleGoHome = useCallback(() => {
    if (!matchResult) return;
    finishInteractiveMatch(matchResult);
    resetMatch();
    router.push('/play');
  }, [matchResult, finishInteractiveMatch, resetMatch, router]);

  const handleGoTournament = useCallback(() => {
    if (!matchResult) return;
    finishInteractiveMatch(matchResult);
    resetMatch();
    router.push('/play/tournament');
  }, [matchResult, finishInteractiveMatch, resetMatch, router]);

  // 采配確定
  const handleOrder = useCallback((order: TacticalOrder) => {
    setSelectMode({ type: 'none' });
    applyOrder(order);
    resumeFromPause();
  }, [applyOrder, resumeFromPause]);

  // 進行ボタン
  const handleStepOnePitch = useCallback(() => {
    setSelectMode({ type: 'none' });
    stepOnePitch();
  }, [stepOnePitch]);

  const handleStepOneAtBat = useCallback(() => {
    setSelectMode({ type: 'none' });
    stepOneAtBat();
  }, [stepOneAtBat]);

  const handleStepOneInning = useCallback(() => {
    setSelectMode({ type: 'none' });
    stepOneInning();
  }, [stepOneInning]);

  const handleRunToEnd = useCallback(() => {
    setSelectMode({ type: 'none' });
    runToEnd();
  }, [runToEnd]);

  // 試合を中断してホームに戻る (Issue #8 2026-04-19)
  const dumpSnapshot = useMatchStore((s) => s.dumpSnapshot);
  const pauseInteractiveMatch = useWorldStore((s) => s.pauseInteractiveMatch);
  const handlePauseToHome = useCallback(() => {
    if (matchResult) {
      // 試合終了済みならそのままホームへ
      router.push('/play');
      return;
    }
    const confirmed = window.confirm(
      '試合を一時中断してホームに戻りますか？\n後でホーム画面から再開できます。',
    );
    if (!confirmed) return;
    const snapshot = dumpSnapshot();
    if (snapshot) {
      pauseInteractiveMatch(snapshot);
    }
    router.push('/play');
  }, [dumpSnapshot, pauseInteractiveMatch, router, matchResult]);

  // ── 自動進行タイマー ──
  // narration.length を deps に入れることで、1打席処理後に次の打席タイマーを起動する。
  // 手動ボタンは autoPlayEnabled=true のとき disabled になっている (上の TacticsBar/進行ボタン参照)
  // ので、「手動クリック → 自動進行が続けて動作」の多重進行は発生しない。
  useEffect(() => {
    if (!initialized) return;
    if (!autoPlayEnabled) return;
    if (pauseReason !== null) return;
    if (matchResult !== null) return;
    if (isProcessing) return;
    if (selectMode.type !== 'none') return;

    // 速度に応じたインターバル（ms）: 打席単位の進行
    const intervalMs =
      autoPlaySpeed === 'slow' ? 2000 :
      autoPlaySpeed === 'fast' ? 300 :
      1000;

    const timer = setTimeout(() => {
      stepOneAtBat();
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [
    initialized,
    autoPlayEnabled,
    autoPlaySpeed,
    pauseReason,
    matchResult,
    isProcessing,
    selectMode.type,
    narration.length,
    stepOneAtBat,
  ]);

  const view = getMatchView();

  if (!hasHydrated || !worldState) {
    return <div className={styles.loading}>読み込み中...</div>;
  }

  if (!initialized || !view) {
    return <div className={styles.loading}>試合を準備中...</div>;
  }

  const isPaused = pauseReason !== null;
  const isMatchOver = matchResult !== null;
  const canProgress = !isProcessing && !isMatchOver;

  return (
    <div className={styles.page}>
      {/* スコアボード */}
      <Scoreboard view={view} />

      {/* 中断ボタン (Issue #8 2026-04-19) */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '4px 16px',
        width: '100%', boxSizing: 'border-box',
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <button
          type="button"
          onClick={handlePauseToHome}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            background: 'rgba(255,255,255,0.1)',
            color: '#607d8b',
            border: '1px solid #cfd8dc',
            borderRadius: 4,
            cursor: 'pointer',
          }}
          title={matchResult ? 'ホームへ戻る' : '試合を中断してホームへ戻る（後で再開可）'}
        >
          {matchResult ? '🏠 ホームへ' : '⏸ 中断してホームへ'}
        </button>
      </div>

      {/* イニングスコア */}
      <InningScoreTable view={view} />

      {/* 実況ログ (スコアボード直下に配置 2026-04-19 Issue #10) */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 12px', width: '100%', boxSizing: 'border-box' }}>
        <NarrationPanel entries={narration} />
      </div>

      {/* 心理ウィンドウ (Phase 7-B) — 最新投球のモノローグを表示 */}
      {pitchLog.length > 0 && pitchLog[pitchLog.length - 1].monologues && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 8px', width: '100%', boxSizing: 'border-box' }}>
          <PsycheWindow
            monologues={pitchLog[pitchLog.length - 1].monologues}
            batterName={pitchLog[pitchLog.length - 1].batterName}
            pitcherName={view.pitcher.name}
          />
        </div>
      )}

      {/* コントロールバー (進行ボタン + 自動進行) */}
      <AutoPlayBar
        enabled={autoPlayEnabled}
        speed={autoPlaySpeed}
        onToggle={toggleAutoPlay}
        onSetSpeed={setAutoPlaySpeed}
        pitchModeEnabled={runnerMode.pitch === 'on'}
        canProgress={canProgress}
        onStepOnePitch={handleStepOnePitch}
        onStepOneAtBat={handleStepOneAtBat}
        onStepOneInning={handleStepOneInning}
        onRunToEnd={handleRunToEnd}
        isProcessing={isProcessing}
        isMatchOver={isMatchOver}
      />

      {/* モードバー */}
      <div className={styles.modeBar}>
        <span className={styles.modeLabel}>速度:</span>
        <div className={styles.modeToggleGroup}>
          <button
            className={`${styles.modeToggleBtn} ${runnerMode.time === 'short' ? styles.modeToggleBtnActive : ''}`}
            onClick={() => setTimeMode('short')}
          >
            ⚡短縮
          </button>
          <button
            className={`${styles.modeToggleBtn} ${runnerMode.time === 'standard' ? styles.modeToggleBtnActive : ''}`}
            onClick={() => setTimeMode('standard')}
          >
            🎯標準
          </button>
        </div>
        <span className={styles.modeLabel} style={{ marginLeft: 8 }}>1球モード:</span>
        <div className={styles.modeToggleGroup}>
          <button
            className={`${styles.modeToggleBtn} ${runnerMode.pitch === 'on' ? styles.modeToggleBtnActive : ''}`}
            onClick={() => setPitchMode('on')}
          >
            ON
          </button>
          <button
            className={`${styles.modeToggleBtn} ${runnerMode.pitch === 'off' ? styles.modeToggleBtnActive : ''}`}
            onClick={() => setPitchMode('off')}
          >
            OFF
          </button>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className={styles.main}>
        {/* 采配ボタン (バナー機能を統合: 打席開始等の案内は TacticsBar 内に表示) */}
        {/* (2026-04-19 Issue #采配位置: PauseBanner と TacticsBar を統合して
            画面を上下移動しなくて済むように) */}
        {!isMatchOver && view.isPlayerBatting !== undefined && (
          <div className={styles.mainFull}>
            <TacticsBar
              view={view}
              onOrder={handleOrder}
              selectMode={selectMode}
              setSelectMode={setSelectMode}
              disabled={isProcessing}
              showBanner={isPaused}
            />
          </div>
        )}

        {/* 采配対象外のポーズ (試合終了など) では単体バナー */}
        {isPaused && !isMatchOver && view.isPlayerBatting === undefined && (
          <div className={styles.mainFull}>
            <PauseBanner view={view} />
          </div>
        )}

        {/* ダイヤモンド */}
        <Diamond view={view} />

        {/* 投手パネル */}
        <PitcherPanel view={view} />

        {/* 打者パネル */}
        <BatterPanel view={view} />

        {/* 進行ボタンは上の AutoPlayBar に統合済み (2026-04-19) */}

        {/* 直近ログ (1球ごとの詳細) */}
        <div className={styles.mainFull}>
          <RecentLog pitches={pitchLog} />
        </div>
      </div>

      {/* 采配選択モーダル */}
      {selectMode.type !== 'none' && selectMode.type !== 'detailed_order' && (
        <SelectPanel
          mode={selectMode}
          view={view}
          onSelect={handleOrder}
          onCancel={() => setSelectMode({ type: 'none' })}
        />
      )}

      {/* 詳細采配モーダル (Phase 7-C) */}
      {selectMode.type === 'detailed_order' && (
        <DetailedOrderModal
          mode={selectMode.mode}
          onClose={() => setSelectMode({ type: 'none' })}
          onApply={(order) => {
            handleOrder(order);
            setSelectMode({ type: 'none' });
          }}
        />
      )}

      {/* 試合終了モーダル */}
      {isMatchOver && (
        <ResultModal
          view={view}
          onGoHome={handleGoHome}
          onGoTournament={handleGoTournament}
        />
      )}
    </div>
  );
}
