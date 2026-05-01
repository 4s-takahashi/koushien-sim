'use client';

/**
 * /play/match/[matchId] — インタラクティブ試合画面
 *
 * Phase 10-B: 1球 / 1打席 / 1イニング / 試合終了まで采配しながら観戦できる。
 * Phase 10-C: WorldState.pendingInteractiveMatch からゲームを初期化し、
 *             試合終了後にブラケット更新してホームへ戻る。
 * Phase 7-F: 高校名・選手名クリックで詳細画面へ遷移。
 */

import { useEffect, useState, useCallback, useRef } from 'react';
// Phase S1-A: 試合演出タイミング制御
import {
  getPlayBallDelayMs,
  getChangeDelayMs,
  getStrikeoutDelay1Ms,
  getStrikeoutDelay2Ms,
  isChangeNarration,
  isStrikeoutNarration,
  buildNextBatterLog,
} from '../../../../ui/match-visual/MatchPlayerHooks';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useWorldStore } from '../../../../stores/world-store';
import { useMatchStore } from '../../../../stores/match-store';
import { useMatchVisualStore } from '../../../../stores/match-visual-store';
import { buildMatchTeam } from '../../../../engine/world/match-team-builder';
import type { MatchState } from '../../../../engine/match/types';
import { EMPTY_BASES } from '../../../../engine/match/types';
import type { TacticalOrder } from '../../../../engine/match/types';
import type { MatchViewState, PitchLogEntry } from '../../../../ui/projectors/view-state-types';
import { PITCH_LABELS } from '../../../../ui/labels/pitch-labels';
import styles from './match.module.css';
import { PsycheWindow } from './PsycheWindow';
import { AnalystPanel } from './AnalystPanel';
import { DetailedOrderModal } from './DetailedOrderModal';
// Phase 12: ビジュアルコンポーネント
import { AnimatedScoreboard } from '../../../../ui/match-visual/AnimatedScoreboard';
import { Ballpark } from '../../../../ui/match-visual/Ballpark';
import { StrikeZone } from '../../../../ui/match-visual/StrikeZone';
import { useBallAnimation } from '../../../../ui/match-visual/useBallAnimation';
import { computeTrajectory, buildPlaySequence, buildHomeRunSequence } from '../../../../ui/match-visual/useBallAnimation';
import { pitchLocationToUV, getBreakDirection, isFastballClass } from '../../../../ui/match-visual/pitch-marker-types';
import type { AtBatMarkerHistory } from '../../../../ui/match-visual/pitch-marker-types';
// v0.34.0: 効果音
import { useSound, hitContactToBatSoundId, pitchSpeedToCatchSoundId } from '../../../../ui/sound/useSound';
import { SoundControl } from './SoundControl';
import visualStyles from './match-visual.module.css';

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

function Scoreboard({ view, matchId }: { view: MatchViewState; matchId: string }) {
  const outs = view.count; // Use count from view
  const stateOuts = (view as MatchViewState & { _outs?: number })._outs ?? 0;

  const handleSchoolClick = useCallback((schoolId: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('returnMatchId', matchId);
    }
  }, [matchId]);

  return (
    <div className={styles.scoreboard}>
      <div className={styles.scoreboardMain}>
        <div className={styles.scoreboardTeams}>
          <Link
            href={`/play/school/${view.awaySchoolId}`}
            className={styles.teamNameLink}
            onClick={() => handleSchoolClick(view.awaySchoolId)}
          >
            {view.awaySchoolName}
          </Link>
          <div className={styles.scoreDisplay}>
            <span className={styles.scoreAway}>{view.score.away}</span>
            <span className={styles.scoreDash}>-</span>
            <span className={styles.scoreHome}>{view.score.home}</span>
          </div>
          <Link
            href={`/play/school/${view.homeSchoolId}`}
            className={styles.teamNameLink}
            onClick={() => handleSchoolClick(view.homeSchoolId)}
          >
            {view.homeSchoolName}
          </Link>
        </div>

        <div className={styles.scoreboardInfo}>
          <span className={styles.inningLabel}>{view.inningLabel}</span>
          {/* Phase 12-M/hotfix-5: 実物カウンター模倣の BSO ドット表示 */}
          <BSOPanel
            balls={view.count.balls}
            strikes={view.count.strikes}
            outs={parseInt(view.outsLabel) || 0}
            compact
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BSO カウントパネル（実物の野球カウンター模倣）
// B: 緑 3 個 / S: 黄 2 個 / O: 赤 2 個
// ============================================================
function BSOPanel({
  balls,
  strikes,
  outs,
  compact,
}: {
  balls: number;
  strikes: number;
  outs: number;
  compact?: boolean;
}) {
  return (
    <div className={`${styles.bsoPanel} ${compact ? styles.bsoPanelCompact : ''}`}>
      <div className={styles.bsoLabel}>B</div>
      <div className={styles.bsoDots}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`${styles.bsoDot} ${i < balls ? styles.bsoDotBallOn : ''}`}
          />
        ))}
      </div>
      <div className={styles.bsoLabel}>S</div>
      <div className={styles.bsoDots}>
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`${styles.bsoDot} ${i < strikes ? styles.bsoDotStrikeOn : ''}`}
          />
        ))}
      </div>
      <div className={styles.bsoLabel}>O</div>
      <div className={styles.bsoDots}>
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`${styles.bsoDot} ${i < outs ? styles.bsoDotOutOn : ''}`}
          />
        ))}
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

function PitcherPanel({ view, matchId }: { view: MatchViewState; matchId: string }) {
  const p = view.pitcher;
  const staminaCls =
    p.staminaClass === 'fresh' ? styles.staminaFresh
    : p.staminaClass === 'normal' ? styles.staminaNormal
    : p.staminaClass === 'tired' ? styles.staminaTired
    : styles.staminaExhausted;

  const handlePlayerClick = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('returnMatchId', matchId);
    }
  }, [matchId]);

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelHeader}>投手</div>
      <div className={styles.panelName}>
        <Link
          href={`/play/player/${p.id}`}
          className={styles.playerNameLink}
          onClick={handlePlayerClick}
        >
          {p.name}{p.schoolShortName ? <span className={styles.schoolShortName}>({p.schoolShortName})</span> : null}
        </Link>
      </div>

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
            <span key={pitch.type} className={styles.pitchBadge}>
              {PITCH_LABELS[pitch.type] ?? pitch.type}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 打者パネル
// ============================================================

function BatterPanel({ view, matchId }: { view: MatchViewState; matchId: string }) {
  const b = view.batter;

  const handlePlayerClick = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('returnMatchId', matchId);
    }
  }, [matchId]);

  return (
    <div className={styles.panelCard}>
      <div className={styles.panelHeader}>{view.isPlayerBatting ? '打者（自校）' : '打者'}</div>
      <div className={styles.panelName}>
        <Link
          href={`/play/player/${b.id}`}
          className={styles.playerNameLink}
          onClick={handlePlayerClick}
        >
          {b.lineupNumber}番：{b.name}{b.schoolShortName ? <span className={styles.schoolShortName}>({b.schoolShortName})</span> : null}
        </Link>
      </div>

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
  /** Phase 12-M/hotfix-4: 継続中の詳細采配（新打者までは継続） */
  lastOrder?: TacticalOrder | null;
}

function TacticsBar({ view, onOrder, selectMode, setSelectMode, disabled, showBanner, lastOrder }: TacticsBtnProps) {
  const isPlayerBatting = view.isPlayerBatting;
  const bannerInfo = showBanner && view.pauseReason ? pauseKindLabel(view) : null;

  // Phase 12-M/hotfix-4: 継続中の詳細采配ラベル
  const hasContinuingDetailedOrder =
    lastOrder !== undefined &&
    lastOrder !== null &&
    (lastOrder.type === 'batter_detailed' || lastOrder.type === 'pitcher_detailed');

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
      {/* Phase 12-M/hotfix-4: 継続中の詳細采配バッジ */}
      {hasContinuingDetailedOrder && (
        <div style={{
          margin: '4px 0 8px',
          padding: '4px 8px',
          background: 'rgba(33, 150, 243, 0.15)',
          border: '1px solid rgba(33, 150, 243, 0.4)',
          borderRadius: 4,
          fontSize: 12,
          color: '#64b5f6',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <span>
            継続中の詳細采配：<strong>
              {lastOrder?.type === 'batter_detailed' ? '打者への指示' : '投手への指示'}
            </strong>（打者交代まで維持）
          </span>
        </div>
      )}
      <div className={styles.tacticsGrid}>
        {/* 何もしない */}
        <button
          className={`${styles.tacticsBtn} ${selectMode.type === 'none' ? styles.tacticsBtnActive : ''}`}
          onClick={handleNone}
          disabled={disabled}
        >
          そのまま
          <span className={styles.tacticsBtnLabel}>
            {hasContinuingDetailedOrder ? '前回の指示を継続' : 'サインなし'}
          </span>
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
          <div className={styles.selectTitle}>代打を選択（現在: {view.batter.name}{view.batter.schoolShortName ? `(${view.batter.schoolShortName})` : ''}）</div>
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
                <span className={styles.selectItemName}>
                  {ph.name}{ph.schoolShortName ? <span className={styles.schoolShortName}>({ph.schoolShortName})</span> : null}
                </span>
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
                  <span className={styles.selectItemName}>
                    {r.name}{r.schoolShortName ? <span className={styles.schoolShortName}>({r.schoolShortName})</span> : null}
                  </span>
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
    // v0.24.1: runnerId は必ず playerId を使う（以前は runnerName を渡して engine 側で照合失敗していた）
    const stealers: { runnerId: string; name: string; from: string }[] = [];
    if (view.bases.first && !view.bases.second) {
      const r = view.bases.first;
      const label = `${r.runnerName}${r.schoolShortName ? `(${r.schoolShortName})` : ''}`;
      stealers.push({ runnerId: r.playerId, name: label, from: '1塁→2塁' });
    }
    if (view.bases.second && !view.bases.third) {
      const r = view.bases.second;
      const label = `${r.runnerName}${r.schoolShortName ? `(${r.schoolShortName})` : ''}`;
      stealers.push({ runnerId: r.playerId, name: label, from: '2塁→3塁' });
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
              <span className={styles.selectItemName}>
                {view.batter.name}{view.batter.schoolShortName ? `(${view.batter.schoolShortName})` : ''} にバントを指示
              </span>
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
              <span>{e.batterName}{e.batterSchoolShortName ? `(${e.batterSchoolShortName})` : ''}</span>
              <span className={`${styles.logOutcome} ${cls}`}>{text}</span>
              <span className={styles.logOutcome}>{PITCH_LABELS[e.pitchType] ?? e.pitchType}</span>
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

      {/* 自動進行 (右寄せ、旧UIを残す) */}
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
// Phase 12-H: 新自動進行コントロールバー
// ============================================================

/**
 * TimeMode の遅延マッピング (ms)
 */
const DELAY_MS: Record<import('../../../../engine/match/runner-types').TimeMode, number> = {
  slow:     10000,
  standard:  5000,
  fast:      3000,
};

interface AutoAdvanceBarProps {
  autoAdvance: boolean;
  timeMode: import('../../../../engine/match/runner-types').TimeMode;
  pitchMode: import('../../../../engine/match/runner-types').PitchMode;
  onToggleAutoAdvance: () => void;
  onSetTimeMode: (t: import('../../../../engine/match/runner-types').TimeMode) => void;
  /** 残り時間 (ms)。null = タイマー未稼働 */
  remainingMs: number | null;
  /** 停止中かどうか (pauseReason が non-null) */
  isPaused: boolean;
  /** 今すぐ進める */
  onAdvanceNow: () => void;
  /** 指示なしで進める (Phase 12-I: 後方互換のため残す) */
  onSkipOrder: () => void;
  /** Phase 12-I: 継続中の采配（lastOrder）。null = 指示なし */
  continuingOrder: TacticalOrder | null;
}

/** Phase 12-I: TacticalOrder を日本語ラベルに変換する */
function tacticalOrderLabel(order: TacticalOrder | null): string {
  if (!order || order.type === 'none') return '指示なし';
  switch (order.type) {
    case 'bunt': return 'バント';
    case 'steal': return '盗塁';
    case 'hit_and_run': return 'ヒットエンドラン';
    case 'intentional_walk': return '申告敬遠';
    case 'batter_detailed': return '打者詳細采配';
    case 'pitcher_detailed': return '投手詳細采配';
    default: return '指示なし';
  }
}

function AutoAdvanceBar({
  autoAdvance, timeMode, pitchMode,
  onToggleAutoAdvance, onSetTimeMode,
  remainingMs, isPaused,
  onAdvanceNow,
  continuingOrder,
}: AutoAdvanceBarProps) {
  const modeLabel = pitchMode === 'on' ? '次の1球' : '次の打席';
  const delayLabel = DELAY_MS[timeMode] / 1000;

  const countdownText =
    remainingMs !== null && autoAdvance && !isPaused
      ? `${modeLabel}まで 残り ${(remainingMs / 1000).toFixed(1)}秒`
      : null;

  // Phase 12-I: 継続中の指示ラベル
  const continuingLabel = tacticalOrderLabel(continuingOrder);
  const hasContinuingOrder = continuingOrder !== null && continuingOrder.type !== 'none';

  return (
    <div className={styles.autoAdvanceBar}>
      {/* 自動進行トグル */}
      <button
        className={`${styles.autoAdvanceToggle} ${autoAdvance ? styles.autoAdvanceToggleOn : ''}`}
        onClick={onToggleAutoAdvance}
        title={autoAdvance ? '自動進行を停止' : '自動進行を開始'}
      >
        {autoAdvance ? '⏸' : '🔁'} 自動進行: {autoAdvance ? 'ON' : 'OFF'}
      </button>

      {/* TimeMode セレクタ (3段階) */}
      <div className={styles.autoAdvanceTimeModeGroup} role="group" aria-label="テンポ">
        <button
          className={`${styles.autoAdvanceTimeModeBtn} ${timeMode === 'slow' ? styles.autoAdvanceTimeModeBtnActive : ''}`}
          onClick={() => onSetTimeMode('slow')}
          title="ゆっくり 10秒"
        >
          ⏮ ゆっくり 10秒
        </button>
        <button
          className={`${styles.autoAdvanceTimeModeBtn} ${timeMode === 'standard' ? styles.autoAdvanceTimeModeBtnActive : ''}`}
          onClick={() => onSetTimeMode('standard')}
          title="標準 5秒"
        >
          ▶ 標準 5秒
        </button>
        <button
          className={`${styles.autoAdvanceTimeModeBtn} ${timeMode === 'fast' ? styles.autoAdvanceTimeModeBtnActive : ''}`}
          onClick={() => onSetTimeMode('fast')}
          title="高速 3秒"
        >
          ⏭ 高速 3秒
        </button>
      </div>

      {/* カウントダウン・操作ボタン（自動進行ON かつ タイマー稼働中のみ表示）
           S1-D bugfix: isStagingDelay 中（remainingMs=null）は非表示にして
           「今すぐ進める」が常時表示されるバグを修正 */}
      {autoAdvance && !isPaused && remainingMs !== null && (
        <>
          {countdownText && (
            <span className={`${styles.autoAdvanceCountdown} ${remainingMs !== null && remainingMs < 2000 ? styles.autoAdvanceCountdownHighlight : ''}`}>
              {countdownText}
            </span>
          )}
          <div className={styles.autoAdvanceNextOrderSection}>
            {/* Phase 12-I: 「指示なし」ボタンの代わりに継続中の指示を表示 */}
            <span className={styles.autoAdvanceNextOrderLabel}>継続中の指示:</span>
            <span className={hasContinuingOrder ? styles.autoAdvanceContinueOrderActive : styles.autoAdvanceContinueOrderNone}>
              {continuingLabel}
            </span>
            <button className={styles.autoAdvanceNowBtn} onClick={onAdvanceNow}>
              今すぐ進める
            </button>
          </div>
        </>
      )}
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

  // Phase 12-F: デフォルトは最新 2 件のみ表示（高橋さん指示 2026-04-22）
  const reversed = [...entries].reverse();
  const recent = reversed.slice(0, 2);
  const older = reversed.slice(2);
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
    <div className={`${styles.narrationPanel} ${showAll ? styles.narrationPanelExpanded : ''}`}>
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
// Phase 12-H: PLAY BALL 演出オーバーレイ
// ============================================================

function PlayBallOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className={styles.playBallOverlay}>
      <div className={styles.playBallBand}>
        <div className={styles.playBallAccent} />
        <div className={styles.playBallAccentBottom} />
        <span className={styles.playBallText}>PLAY BALL</span>
      </div>
    </div>
  );
}

/**
 * v0.35.0: CHANGE 演出オーバーレイ
 * ハーフイニング切替時（3アウト後）に PLAY BALL と同じ帯デザインで "CHANGE" を表示
 */
function ChangeOverlay({ visible, nextHalf }: { visible: boolean; nextHalf: string }) {
  if (!visible) return null;
  return (
    <div className={styles.changeOverlay}>
      <div className={styles.changeBand}>
        <div className={styles.changeAccent} />
        <div className={styles.changeAccentBottom} />
        <span className={styles.changeText}>CHANGE</span>
        <span className={styles.changeSubText}>{nextHalf}</span>
      </div>
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

  const matchStoreHasHydrated = useMatchStore((s) => s._hasHydrated);
  const matchStoreRunner = useMatchStore((s) => s.runner);
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
  const lastOrder = useMatchStore((s) => s.lastOrder);
  const autoAdvance = useMatchStore((s) => s.autoAdvance);
  const setAutoAdvance = useMatchStore((s) => s.setAutoAdvance);
  const pendingNextOrder = useMatchStore((s) => s.pendingNextOrder);
  const consumeNextOrder = useMatchStore((s) => s.consumeNextOrder);
  const analystComments = useMatchStore((s) => s.analystComments);
  const addAnalystComment = useMatchStore((s) => s.addAnalystComment);
  // v0.33.0: アナリスト未読管理
  const lastReadAnalystId = useMatchStore((s) => s.lastReadAnalystId);
  const markAnalystRead = useMatchStore((s) => s.markAnalystRead);

  const [selectMode, setSelectMode] = useState<SelectMode>({ type: 'none' });
  const [initialized, setInitialized] = useState(false);
  // Phase 12-H: PLAY BALL 演出
  const [showPlayBall, setShowPlayBall] = useState(false);
  // Phase 12-H: カウントダウン用タイムスタンプ
  const [nextAutoAdvanceAt, setNextAutoAdvanceAt] = useState<number | null>(null);
  // Phase 12-H: カウントダウン表示用の再描画トリガー
  const [_countdownTick, setCountdownTick] = useState(0);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase S1-A: 演出ディレイ中かどうか (A1/A2/A5 の待機中フラグ)
  const [isStagingDelay, setIsStagingDelay] = useState(false);
  const stagingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNarrationLengthRef = useRef(0);
  // Phase S1-A: アンマウント時にステージングタイマーをクリア
  useEffect(() => {
    return () => {
      if (stagingTimerRef.current !== null) {
        clearTimeout(stagingTimerRef.current);
        stagingTimerRef.current = null;
      }
    };
  }, []);

  // Phase 12-L: hydration タイムアウト
  // match-store の persist が 3 秒以内に完了しない場合、強制的に _hasHydrated を true に設定する。
  // localStorage が破損・ロックされているときに「読み込み中...」で固まるバグを防ぐ。
  useEffect(() => {
    if (matchStoreHasHydrated) return;
    const timeout = setTimeout(() => {
      useMatchStore.setState({ _hasHydrated: true, isProcessing: false });
    }, 3000);
    return () => clearTimeout(timeout);
  }, [matchStoreHasHydrated]);

  // ゲーム初期化
  useEffect(() => {
    // world-store と match-store 両方の persist 復元が完了するまで何もしない
    // (hydration 前に router.replace すると、リロード時に /play へ飛んでしまう)
    if (!hasHydrated) return;
    if (!matchStoreHasHydrated) return;
    if (initialized) return;

    if (!worldState) {
      // ゲーム未開始 → /play に戻せば PlayPage が /new-game にリダイレクトする
      router.replace('/play');
      return;
    }

    // ── match-store の persist から runner が復元済みの場合（リロード対応）──
    // 画面リロードや選手/高校詳細へ遷移後に戻ってきたときに、
    // localStorage から runner が復元されていれば、そのまま試合を継続する。
    if (matchStoreRunner !== null && !worldState.pausedInteractiveMatch) {
      setInitialized(true);
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
    // Phase 12-H: 新規試合開始 → PLAY BALL 演出を表示
    setShowPlayBall(true);
    // 2.8秒後に演出終了 (CSSアニメーションと同期)
    setTimeout(() => setShowPlayBall(false), 2800);
    // Phase S1-A A1: プレイボール後3秒（autoSpeedMultiplier 連動）の遅延
    setIsStagingDelay(true);
    const playBallDelay = getPlayBallDelayMs(runnerMode.time);
    const playBallTimer = setTimeout(() => {
      setIsStagingDelay(false);
    }, playBallDelay);
    stagingTimerRef.current = playBallTimer;
    setInitialized(true);
  }, [hasHydrated, matchStoreHasHydrated, matchStoreRunner, worldState, initialized, initMatch, router, consumePausedMatch, restoreFromSnapshot]);

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

  // ── 旧自動進行タイマー (autoPlayEnabled) ──
  // 後方互換: autoAdvance が OFF のときは旧ロジックで動作
  // A3: チャンス/ピンチでないのに止まるバグ修正: routine な pauseReason は無視して進行
  useEffect(() => {
    if (!initialized) return;
    if (!autoPlayEnabled) return;
    if (autoAdvance) return; // 新自動進行が ON なら旧ロジックは動かない
    // A3: 非 routine な pauseReason のみ停止（match_end / scoring_chance）
    if (pauseReason !== null) {
      const routineKinds: string[] = ['pitch_start', 'at_bat_start', 'inning_end'];
      if (!routineKinds.includes(pauseReason.kind)) return;
      // routine pause（pitch_start/at_bat_start/inning_end）は無視して自動進行継続
    }
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
    autoAdvance,
    autoPlaySpeed,
    pauseReason,
    matchResult,
    isProcessing,
    selectMode.type,
    stepOneAtBat,
    // S1-F bugfix: narration.length を削除（同上の理由）
  ]);

  // ── Phase S1-A: ステージングディレイ (A1/A2/A5) ──
  // narration の最新エントリを監視し、チェンジ/三振後に追加の遅延を挿入する
  const appendNarration = useMatchStore((s) => s.appendNarration);
  useEffect(() => {
    if (!initialized) return;
    if (matchResult !== null) return;
    // ナレーションが増えていない場合はスキップ
    const len = narration.length;
    const prevLen = prevNarrationLengthRef.current;
    if (len === prevLen) return;
    prevNarrationLengthRef.current = len;

    // S1-E bugfix: buildNarrationForPitch は1回の stepOnePitch で複数エントリを追加する
    // （例: 打者登場 + 三振 + アウト数 + チェンジ + 新イニング開始）。
    // 最終エントリだけを見ると CHANGE/STRIKEOUT を見逃すため、全新規エントリを検索する。
    const newEntries = narration.slice(prevLen);
    const hasChange = newEntries.some((e) => isChangeNarration(e.text));
    const hasStrikeout = newEntries.some((e) => isStrikeoutNarration(e.text));

    // 前のステージングタイマーをクリア
    // S1-D bugfix: クリア時に isStagingDelay を解除する（永続フリーズ防止）
    // S1-E 補足: CHANGE/STRIKEOUT が新規エントリに含まれる場合は直後に再セットするので問題なし
    if (stagingTimerRef.current !== null) {
      clearTimeout(stagingTimerRef.current);
      stagingTimerRef.current = null;
      setIsStagingDelay(false);
    }

    // A2: チェンジイベント検出 → CHANGE_DELAY_MS 遅延
    if (hasChange) {
      const changeDelay = getChangeDelayMs(runnerMode.time);
      setIsStagingDelay(true);
      stagingTimerRef.current = setTimeout(() => {
        stagingTimerRef.current = null;
        setIsStagingDelay(false);
      }, changeDelay);
      return;
    }

    // A5: 三振イベント検出 → 1.5秒待機 → 次打者ログ → 0.5秒待機
    if (hasStrikeout) {
      const delay1 = getStrikeoutDelay1Ms(runnerMode.time);
      const delay2 = getStrikeoutDelay2Ms(runnerMode.time);
      setIsStagingDelay(true);

      stagingTimerRef.current = setTimeout(() => {
        // 1.5秒後: 次打者ログを追加
        // S1-E bugfix: appendNarration を呼ぶ前に stagingTimerRef を null にクリアしておく。
        // appendNarration が narration.length を変化させ、staging useEffect が再起動されるが、
        // その時点で stagingTimerRef.current が null であれば delay2 タイマーを誤って
        // クリアしない（isStagingDelay=true のまま維持される）。
        stagingTimerRef.current = null;
        const currentView = useMatchStore.getState().runner?.getState();
        if (currentView) {
          const battingTeam = currentView.currentHalf === 'top'
            ? currentView.awayTeam
            : currentView.homeTeam;
          const nextBatterId = battingTeam.battingOrder[currentView.currentBatterIndex];
          const nextBatterMP = battingTeam.players.find((p) => p.player.id === nextBatterId);
          if (nextBatterMP) {
            const posJP: Record<string, string> = {
              pitcher: '投手', catcher: '捕手', first: '一塁手', second: '二塁手',
              third: '三塁手', shortstop: '遊撃手', left: '左翼手', center: '中堅手', right: '右翼手',
            };
            const pos = posJP[nextBatterMP.player.position ?? ''] ?? nextBatterMP.player.position ?? '';
            const order = currentView.currentBatterIndex + 1;
            const logText = buildNextBatterLog(nextBatterMP.player.lastName, order, pos);
            appendNarration({
              id: `next-batter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: logText,
              kind: 'normal',
              inning: currentView.currentInning,
              half: currentView.currentHalf,
              at: Date.now(),
            });
          }
        }
        // さらに 0.5秒後に staging 解除
        stagingTimerRef.current = setTimeout(() => {
          stagingTimerRef.current = null;
          setIsStagingDelay(false);
        }, delay2);
      }, delay1);
      return;
    }
  }, [narration.length, initialized, matchResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase S1-G: 新自動進行 — setInterval ベースの独立ポーリングループ ──
  //
  // 【設計の意図】
  // useEffect の依存配列パズルでは「タイマーが消えて再起動されない」フリーズが
  // S1-D/E/F と何度も発生したため、根本的に方針転換：
  //   - 100ms ごとに setInterval で「自動進行可能か？」をポーリング
  //   - 可能なら fireAt をセット（既存があれば触らない）
  //   - fireAt 到達したら stepOnePitch / stepOneAtBat を実行
  //   - 中断条件（pause/processing/staging/match_end）になったら fireAt クリア
  // これにより React 状態変化トリガーへの依存が消え、必ず動き出すことを保証する。
  //
  // 【最新の参照を ref で持つ】
  // setInterval コールバックから最新の状態を見るために、すべての関連する変数を
  // ref に同期する。
  const autoAdvanceStateRef = useRef({
    initialized: false,
    autoAdvance: false,
    runnerMode,
    pauseReason: null as typeof pauseReason,
    matchResult: null as typeof matchResult,
    isProcessing: false,
    selectMode: selectMode,
    isStagingDelay: false,
  });
  autoAdvanceStateRef.current = {
    initialized,
    autoAdvance,
    runnerMode,
    pauseReason,
    matchResult,
    isProcessing,
    selectMode,
    isStagingDelay,
  };
  // 関数 ref（最新を維持）
  const autoAdvanceFnRef = useRef({ consumeNextOrder, applyOrder, stepOnePitch, stepOneAtBat });
  autoAdvanceFnRef.current = { consumeNextOrder, applyOrder, stepOnePitch, stepOneAtBat };

  useEffect(() => {
    // ポーリングループ — マウント時に1回だけセットアップ、アンマウント時に1回だけクリア
    const tick = () => {
      const s = autoAdvanceStateRef.current;
      const fn = autoAdvanceFnRef.current;

      // 自動進行不可能な状態 → タイマーをクリア
      const cannotAdvance =
        !s.initialized ||
        !s.autoAdvance ||
        s.matchResult !== null ||
        s.isProcessing ||
        s.selectMode.type !== 'none' ||
        s.isStagingDelay ||
        // pauseReason: 非 routine（勝負所・試合終了）なら停止
        (s.pauseReason !== null &&
          !['pitch_start', 'at_bat_start', 'inning_end'].includes(s.pauseReason.kind));

      if (cannotAdvance) {
        if (autoAdvanceTimerRef.current !== null) {
          clearTimeout(autoAdvanceTimerRef.current);
          autoAdvanceTimerRef.current = null;
        }
        setNextAutoAdvanceAt((prev) => (prev !== null ? null : prev));
        return;
      }

      // 自動進行可能 → タイマーがなければセット
      if (autoAdvanceTimerRef.current === null) {
        const delayMs = DELAY_MS[s.runnerMode.time];
        const fireAt = Date.now() + delayMs;
        setNextAutoAdvanceAt(fireAt);

        autoAdvanceTimerRef.current = setTimeout(() => {
          autoAdvanceTimerRef.current = null;
          setNextAutoAdvanceAt(null);
          // 発火直前にもう一度ガードチェック（中断条件が後から成立した場合の保険）
          const s2 = autoAdvanceStateRef.current;
          const cantNow =
            !s2.initialized ||
            !s2.autoAdvance ||
            s2.matchResult !== null ||
            s2.isProcessing ||
            s2.selectMode.type !== 'none' ||
            s2.isStagingDelay ||
            (s2.pauseReason !== null &&
              !['pitch_start', 'at_bat_start', 'inning_end'].includes(s2.pauseReason.kind));
          if (cantNow) return;

          // pendingNextOrder を消費して adopt する
          const fn2 = autoAdvanceFnRef.current;
          const pending = fn2.consumeNextOrder();
          if (pending && pending.type !== 'none') {
            fn2.applyOrder(pending);
          }
          if (s2.runnerMode.pitch === 'on') {
            fn2.stepOnePitch();
          } else {
            fn2.stepOneAtBat();
          }
        }, delayMs);
      }
    };

    // 最初のチェックは即座に + その後 100ms ごとにポーリング
    tick();
    const intervalId = setInterval(tick, 100);

    return () => {
      clearInterval(intervalId);
      if (autoAdvanceTimerRef.current !== null) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← 依存配列は空。マウント時1回のみセットアップ

  // ── Phase 12-H: カウントダウン表示 (100msごとに再描画) ──
  useEffect(() => {
    if (!autoAdvance || nextAutoAdvanceAt === null) return;
    const interval = setInterval(() => {
      setCountdownTick((t) => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, [autoAdvance, nextAutoAdvanceAt]);

  // 今すぐ進めるハンドラ
  const handleAdvanceNow = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setNextAutoAdvanceAt(null);
    const pending = consumeNextOrder();
    if (pending && pending.type !== 'none') {
      applyOrder(pending);
    }
    if (runnerMode.pitch === 'on') {
      stepOnePitch();
    } else {
      stepOneAtBat();
    }
  }, [consumeNextOrder, applyOrder, runnerMode.pitch, stepOnePitch, stepOneAtBat]);

  // 指示なしで進めるハンドラ（pendingNextOrder をクリア → タイマーリセット）
  const handleSkipOrder = useCallback(() => {
    // pendingNextOrder をクリアするだけ。タイマーは継続
    // ここでは applyOrder({ type: 'none' }) は不要。タイマーが発火したとき pending=null で進む
  }, []);

  // ── Phase 12-K: イニング終了時にアナリストコメントを生成 ──
  const prevInningRef = useRef<{ inning: number; half: 'top' | 'bottom' } | null>(null);
  useEffect(() => {
    if (!initialized) return;
    // pitchLog が空なら何もしない
    if (pitchLog.length === 0) return;
    // 現在のイニング・表裏を取得（最新エントリから）
    const lastPitch = pitchLog[pitchLog.length - 1];
    if (!lastPitch) return;
    // Phase 12-M/hotfix-2: ハーフイニング切替を検出する
    // 直前のエントリと比較して inning or half が変化した場合、
    // 「直前の half が終了した」とみなして addAnalystComment を呼ぶ
    const prevPitch = pitchLog[pitchLog.length - 2];
    if (!prevPitch) return;
    // 同じイニング・同じ表裏なら何もしない（打席内の投球）
    if (prevPitch.inning === lastPitch.inning && prevPitch.half === lastPitch.half) return;
    // 直前のエントリの inning/half が「終了した half」
    const endedInning = prevPitch.inning;
    const endedHalf = prevPitch.half;
    // 同じハーフを二重生成しない
    const key = `${endedInning}-${endedHalf}`;
    const prevKey = prevInningRef.current
      ? `${prevInningRef.current.inning}-${prevInningRef.current.half}`
      : null;
    if (key === prevKey) return;
    prevInningRef.current = { inning: endedInning, half: endedHalf };
    // プレイヤー校のマネージャーを取得
    const managers = worldState?.managerStaff?.members ?? [];
    // v0.33.0: 相手投手名（現在の view から取得）を主語として渡す
    const currentView = getMatchView();
    const pitcherName = currentView?.pitcher?.name ?? undefined;
    addAnalystComment(endedInning, endedHalf, managers, pitcherName);
  }, [pitchLog, initialized]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = getMatchView();

  if (!hasHydrated || !matchStoreHasHydrated || !worldState) {
    return <div className={styles.loading}>読み込み中...</div>;
  }

  if (!initialized || !view) {
    return <div className={styles.loading}>試合を準備中...</div>;
  }

  const isPaused = pauseReason !== null;
  const isMatchOver = matchResult !== null;
  const canProgress = !isProcessing && !isMatchOver;

  const matchId = typeof _matchId === 'string' ? _matchId : 'current';

  const remainingMs = nextAutoAdvanceAt !== null ? Math.max(0, nextAutoAdvanceAt - Date.now()) : null;

  return (
    <MatchPageInner
      view={view}
      matchId={matchId}
      playerSchoolId={worldState.playerSchoolId}
      pitchLog={pitchLog}
      narration={narration}
      autoPlayEnabled={autoPlayEnabled}
      autoPlaySpeed={autoPlaySpeed}
      toggleAutoPlay={toggleAutoPlay}
      setAutoPlaySpeed={setAutoPlaySpeed}
      runnerMode={runnerMode}
      setTimeMode={setTimeMode}
      setPitchMode={setPitchMode}
      isPaused={isPaused}
      isMatchOver={isMatchOver}
      canProgress={canProgress}
      isProcessing={isProcessing}
      lastOrder={lastOrder}
      handleGoHome={handleGoHome}
      handleGoTournament={handleGoTournament}
      handleOrder={handleOrder}
      handleStepOnePitch={handleStepOnePitch}
      handleStepOneAtBat={handleStepOneAtBat}
      handleStepOneInning={handleStepOneInning}
      handleRunToEnd={handleRunToEnd}
      handlePauseToHome={handlePauseToHome}
      showPlayBall={showPlayBall}
      autoAdvance={autoAdvance}
      onToggleAutoAdvance={() => setAutoAdvance(!autoAdvance)}
      nextAutoAdvanceAt={remainingMs}
      onAdvanceNow={handleAdvanceNow}
      onSkipOrder={handleSkipOrder}
      continuingOrder={lastOrder}
      analystComments={analystComments}
      hasAnalyst={(worldState.managerStaff?.members ?? []).some((m) => m.role === 'analytics')}
      lastReadAnalystId={lastReadAnalystId}
      onAnalystRead={markAnalystRead}
    />
  );
}

// ============================================================
// MatchPageInner — Phase 12 ビジュアル統合コンポーネント
// ============================================================

interface MatchPageInnerProps {
  view: MatchViewState;
  matchId: string;
  playerSchoolId: string;
  pitchLog: PitchLogEntry[];
  narration: import('../../../../ui/narration/buildNarration').NarrationEntry[];
  autoPlayEnabled: boolean;
  autoPlaySpeed: 'slow' | 'normal' | 'fast';
  toggleAutoPlay: () => void;
  setAutoPlaySpeed: (s: 'slow' | 'normal' | 'fast') => void;
  runnerMode: import('../../../../engine/match/runner-types').RunnerMode;
  setTimeMode: (t: import('../../../../engine/match/runner-types').TimeMode) => void;
  setPitchMode: (p: 'on' | 'off') => void;
  isPaused: boolean;
  isMatchOver: boolean;
  canProgress: boolean;
  isProcessing: boolean;
  lastOrder: TacticalOrder | null;
  handleGoHome: () => void;
  handleGoTournament: () => void;
  handleOrder: (o: TacticalOrder) => void;
  handleStepOnePitch: () => void;
  handleStepOneAtBat: () => void;
  handleStepOneInning: () => void;
  handleRunToEnd: () => void;
  handlePauseToHome: () => void;
  // Phase 12-H
  showPlayBall: boolean;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  nextAutoAdvanceAt: number | null;
  onAdvanceNow: () => void;
  onSkipOrder: () => void;
  // Phase 12-I: 継続中の采配
  continuingOrder: TacticalOrder | null;
  // Phase 12-K: アナリストコメント
  analystComments: import('../../../../engine/staff/analyst').AnalystComment[];
  hasAnalyst: boolean;
  // v0.33.0: アナリスト未読管理
  lastReadAnalystId: string | null;
  onAnalystRead: () => void;
}

function MatchPageInner({
  view,
  matchId,
  playerSchoolId,
  pitchLog,
  narration,
  autoPlayEnabled,
  autoPlaySpeed,
  toggleAutoPlay,
  setAutoPlaySpeed,
  runnerMode,
  setTimeMode,
  setPitchMode,
  isPaused,
  isMatchOver,
  canProgress,
  isProcessing,
  lastOrder,
  handleGoHome,
  handleGoTournament,
  handleOrder,
  handleStepOnePitch,
  handleStepOneAtBat,
  handleStepOneInning,
  handleRunToEnd,
  handlePauseToHome,
  showPlayBall,
  autoAdvance,
  onToggleAutoAdvance,
  nextAutoAdvanceAt,
  onAdvanceNow,
  onSkipOrder,
  continuingOrder,
  analystComments,
  hasAnalyst,
  lastReadAnalystId,
  onAnalystRead,
}: MatchPageInnerProps) {
  const [selectMode, setSelectMode] = useState<SelectMode>({ type: 'none' });
  const matchResult = useMatchStore((s) => s.matchResult);

  // ===== Phase 12: ボールアニメーション =====
  const { ballState, triggerPitchAnimation, triggerHitAnimation, triggerHomeRunEffect, triggerPlaySequence, resetBall } = useBallAnimation();

  // ===== v0.34.0: 効果音 =====
  const sound = useSound();

  // ===== v0.35.0: CHANGE 帯表示（ハーフイニング切替時） =====
  const [showChangeOverlay, setShowChangeOverlay] = useState(false);
  const [changeOverlayNextHalf, setChangeOverlayNextHalf] = useState<string>('');
  const prevInningLabelForChangeRef = useRef<string>(view.inningLabel);
  useEffect(() => {
    if (prevInningLabelForChangeRef.current === view.inningLabel) return;
    // 初期マウント時は CHANGE を出さない（PLAY BALL と被るため）
    // prevInningLabelForChange が空文字の場合もスキップ
    const prev = prevInningLabelForChangeRef.current;
    prevInningLabelForChangeRef.current = view.inningLabel;
    if (!prev) return;
    // PLAY BALL 演出中（showPlayBall=true）はスキップ
    if (showPlayBall) return;

    // CHANGE 帯を表示（1.5秒後にスコアボードが出る）
    setChangeOverlayNextHalf(view.inningLabel);
    setShowChangeOverlay(true);
    const timer = setTimeout(() => setShowChangeOverlay(false), 1700);
    return () => clearTimeout(timer);
  }, [view.inningLabel, showPlayBall]);

  // ===== Phase 12: マーカーストア =====
  const addPitchMarker = useMatchVisualStore((s) => s.addPitchMarker);
  const setSwingMarker = useMatchVisualStore((s) => s.setSwingMarker);
  const clearForNextBatter = useMatchVisualStore((s) => s.clearForNextBatter);
  const currentAtBatMarkers = useMatchVisualStore((s) => s.currentAtBatMarkers);
  const swingMarker = useMatchVisualStore((s) => s.swingMarker);
  const prevBatterIdRef = useCallback(
    () => pitchLog.length > 0 ? pitchLog[pitchLog.length - 1]?.batterId : null,
    [pitchLog]
  );
  const lastBatterIdRef = { current: '' };

  // ===== Phase 12-M/hotfix-2: 最後に処理したピッチを識別するための ref =====
  // pitchLog.length 単体では 50件 cap で増加が止まるため、
  // アニメーション useEffect が 2回目以降のイニングで発火しなくなる。
  // 最新エントリを参照比較（オブジェクト同一性）で検出する。
  const lastProcessedPitchRef = useRef<PitchLogEntry | null>(null);

  // ===== Phase 12: 投球ログ変化を検出してマーカー・アニメーションを更新 =====
  useEffect(() => {
    const latest = pitchLog[pitchLog.length - 1];
    const prev = pitchLog[pitchLog.length - 2];

    if (!latest) return;
    // Phase 12-M/hotfix-2: 同じエントリへの再発火を防止
    if (lastProcessedPitchRef.current === latest) return;
    lastProcessedPitchRef.current = latest;

    // 打者交代検出
    if (prev && prev.batterId !== latest.batterId) {
      clearForNextBatter();
      resetBall();
    }

    // ストライクゾーンマーカー追加
    const uv = pitchLocationToUV(latest.location.row, latest.location.col);
    const pitchClass = isFastballClass(latest.pitchType) ? 'fastball' as const : 'breaking' as const;
    const result: 'strike' | 'ball' | 'foul' | 'in_play' =
      latest.outcome === 'called_strike' || latest.outcome === 'swinging_strike'
        ? 'strike'
        : latest.outcome === 'ball'
        ? 'ball'
        : latest.outcome === 'foul' || latest.outcome === 'foul_bunt'
        ? 'foul'
        : 'in_play';

    addPitchMarker({
      position: uv,
      pitchClass,
      breakDirection: latest.breakDirection ?? null,
      result,
    });

    // スイング位置マーカー
    if (latest.swingLocation) {
      const swingRes: 'miss' | 'foul' | 'in_play' =
        latest.outcome === 'swinging_strike' ? 'miss'
        : latest.outcome === 'foul' || latest.outcome === 'foul_bunt' ? 'foul'
        : 'in_play';
      setSwingMarker({ position: latest.swingLocation, swingResult: swingRes });
    }

    // ボールアニメーション（投球）
    if (latest.pitchSpeed !== undefined) {
      triggerPitchAnimation({
        actualLocation: latest.location,
        speedKmh: latest.pitchSpeed,
        pitchType: latest.pitchType,
      });
      // v0.34.0: 投球音（すぐ鳴らす）
      sound.play('pitch_throw', { volume: 0.7 });

      // v0.34.0: 捕球音は「打球が発生しない場合」のみ（ball / called_strike / swinging_strike）
      // ミット到達タイミングに合わせて遅延再生
      const isInPlay = latest.outcome === 'in_play';
      const isFoul = latest.outcome === 'foul' || latest.outcome === 'foul_bunt';
      if (!isInPlay && !isFoul) {
        const catchSoundId = pitchSpeedToCatchSoundId(latest.pitchSpeed);
        const catchDelay = Math.min(450, 60000 / latest.pitchSpeed); // 球速が速いほど早い
        setTimeout(() => sound.play(catchSoundId, { volume: 0.9 }), catchDelay);
      }
    }

    // 打球アニメーション
    const batContact = latest.batContact;
    if (batContact) {
      // v0.34.0: 打球音（バット→ボール）
      const batSoundId = hitContactToBatSoundId(batContact.speed, batContact.contactType);
      // 投球から少し遅れてインパクト音
      const batDelay = latest.pitchSpeed ? Math.min(250, 80000 / latest.pitchSpeed) : 250;
      setTimeout(() => sound.play(batSoundId, { volume: 1.0 }), batDelay);
      // v0.35.0: ホームラン判定は fieldResult.type を最優先（engine の結果を信用する）
      const fieldResultType = batContact.fieldResult?.type ?? undefined;
      const isHomeRun = fieldResultType === 'home_run';
      // v0.36.0: ファール判定
      const isFoul = fieldResultType === 'foul';

      // ホームラン時はフライ扱いで十分距離を取った trajectory を生成（contactType が ground_ball でも場外へ）
      const trajectory = computeTrajectory({
        contactType: isHomeRun ? 'fly_ball' : batContact.contactType,
        direction: batContact.direction,
        speed: isHomeRun ? 'bullet' : batContact.speed,
        distance: isHomeRun ? Math.max(380, batContact.distance) : batContact.distance,
      });
      const delay = latest.pitchSpeed ? Math.min(300, 100000 / latest.pitchSpeed) : 300;

      // fieldResult.fielder は view-state-types では定義されていないためオプション
      const fielderPosition: string | undefined = undefined;

      const timer = setTimeout(() => {
        if (isFoul) {
          // v0.36.0: ファール打球 — 軌跡だけ表示（外野手は動かない、結果表示なし）
          // direction は engine 側でファールゾーンにずらし済み（-25°〜-5° or 95°〜115°）
          // triggerHitAnimation で弧を描いて飛んで落ちる
          triggerHitAnimation(trajectory);
          return;
        }
        if (isHomeRun) {
          // v0.36.0: ホームラン
          //   triggerPlaySequence 1 本で以下を同時再生:
          //     - 打球が弧を描いて場外へ飛んでいく (flyBall, 2400ms, peakHeight=1.4)
          //     - 外野手が追いかけるがフェンスで停止 (fielderMove, noCatch=true)
          //     - バッターが一塁へ走る (batterRun)
          //     - 着弾後に "ホームラン！" 表示
          //   飛距離の終盤でホームランエフェクト（花火）を発火
          triggerPlaySequence(
            buildHomeRunSequence({
              contactType: 'fly_ball',
              direction: batContact.direction,
              speed: 'hard',
              distance: Math.max(380, batContact.distance),
            }),
          );
          // 打球が着弾する少し前にホームラン演出
          setTimeout(() => triggerHomeRunEffect(), 2200);
        } else {
          // Phase 12-J: buildPlaySequence 統一API で打球種類・守備結果に応じたアニメーション
          triggerPlaySequence(
            buildPlaySequence({
              contactType: batContact.contactType,
              direction: batContact.direction,
              speed: batContact.speed,
              distance: batContact.distance,
              fieldResultType,
              fielderPosition,
              runnersOnBase: [], // 走者情報は将来拡張
            }),
          );
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [pitchLog]); // Phase 12-M/hotfix-2: pitchLog (reference equality) に変更

  // スコアボードの表示状態（HUDの薄さ制御用）
  const [scoreboardPhaseVisible, setScoreboardPhaseVisible] = useState(false);

  const markerHistory: AtBatMarkerHistory = {
    pitchMarkers: currentAtBatMarkers,
    swingMarker,
  };

  return (
    <div className={styles.page}>
      {/* Phase 12-H: PLAY BALL 演出 */}
      <PlayBallOverlay visible={showPlayBall} />

      {/* v0.35.0: CHANGE 帯（ハーフイニング切替時） */}
      <ChangeOverlay visible={showChangeOverlay} nextHalf={changeOverlayNextHalf} />

      {/* v0.34.0: 効果音コントロール（右上固定） */}
      <SoundControl
        volume={sound.volume}
        muted={sound.muted}
        onSetVolume={sound.setVolume}
        onToggleMuted={sound.toggleMuted}
      />

      {/* Phase 12-A: アニメーション付きスコアボード */}
      <AnimatedScoreboard view={view} />

      {/* 中断ボタン */}
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

      {/* Phase 12-G: グラウンド(縮小) + ストライクゾーン(縮小) + 情報パネル 3カラム */}
      <div className={visualStyles.visualArea}>
        {/* 左カラム: グラウンド鳥瞰 (40%縮小) */}
        <div className={visualStyles.ballparkColumn}>
          <Ballpark
            view={view}
            playerSchoolId={playerSchoolId}
            ballAnimState={ballState}
            scoreboardVisible={scoreboardPhaseVisible}
          />
        </div>

        {/* 中カラム: ストライクゾーン (40%縮小) */}
        <div className={visualStyles.strikeZoneColumn}>
          <div className={visualStyles.strikeZoneLabel}>
            <span>投手：{view.pitcher.name}{view.pitcher.schoolShortName ? `(${view.pitcher.schoolShortName})` : ''}</span>
            <span>打者：{view.batter.lineupNumber}番：{view.batter.name}{view.batter.schoolShortName ? `(${view.batter.schoolShortName})` : ''}</span>
          </div>
          <StrikeZone history={markerHistory} />
        </div>

        {/* 右カラム: 情報パネル（縮小分の余白を活用） */}
        <div className={visualStyles.infoColumn}>
          <NarrationPanel entries={narration} />
          {/* Phase 12-L: PsycheWindow にアナリストコメントを統合表示 */}
          {(pitchLog.length > 0 && pitchLog[pitchLog.length - 1].monologues) || hasAnalyst ? (
            <PsycheWindow
              monologues={pitchLog.length > 0 ? pitchLog[pitchLog.length - 1].monologues : undefined}
              batterName={pitchLog.length > 0 ? pitchLog[pitchLog.length - 1].batterName : ''}
              batterSchoolShortName={pitchLog.length > 0 ? pitchLog[pitchLog.length - 1].batterSchoolShortName : undefined}
              pitcherName={view.pitcher.name}
              pitcherSchoolShortName={view.pitcher.schoolShortName}
              analystComments={analystComments}
              hasAnalyst={hasAnalyst}
              lastReadAnalystId={lastReadAnalystId}
              onAnalystRead={onAnalystRead}
            />
          ) : null}
        </div>
      </div>

      {/* コントロールバー */}
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

      {/* Phase 12-H/I: 新自動進行コントロールバー */}
      <AutoAdvanceBar
        autoAdvance={autoAdvance}
        timeMode={runnerMode.time}
        pitchMode={runnerMode.pitch}
        onToggleAutoAdvance={onToggleAutoAdvance}
        onSetTimeMode={setTimeMode}
        remainingMs={nextAutoAdvanceAt}
        isPaused={isPaused}
        onAdvanceNow={onAdvanceNow}
        onSkipOrder={onSkipOrder}
        continuingOrder={continuingOrder}
      />

      {/* モードバー */}
      <div className={styles.modeBar}>
        <span className={styles.modeLabel}>1球モード:</span>
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
        {!isMatchOver && view.isPlayerBatting !== undefined && (
          <div className={styles.mainFull}>
            <TacticsBar
              view={view}
              onOrder={handleOrder}
              selectMode={selectMode}
              setSelectMode={setSelectMode}
              disabled={isProcessing}
              showBanner={isPaused}
              lastOrder={lastOrder}
            />
          </div>
        )}

        {isPaused && !isMatchOver && view.isPlayerBatting === undefined && (
          <div className={styles.mainFull}>
            <PauseBanner view={view} />
          </div>
        )}

        {/* 投手パネル */}
        <PitcherPanel view={view} matchId={matchId} />

        {/* 打者パネル */}
        <BatterPanel view={view} matchId={matchId} />

        {/* 直近ログ */}
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

      {/* 詳細采配モーダル */}
      {selectMode.type === 'detailed_order' && (
        <DetailedOrderModal
          mode={selectMode.mode}
          lastOrder={lastOrder}
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
