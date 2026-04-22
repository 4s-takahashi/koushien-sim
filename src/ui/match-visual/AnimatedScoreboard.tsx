'use client';
/**
 * Phase 12-A: アニメーション付きスコアボードコンポーネント
 *
 * イニング開始時にスライドイン → 2秒表示 → スライドアウトする
 * 非表示中は MatchHUD がスコア情報を代替表示する
 */

import React from 'react';
import { useScoreboardVisibility } from './useScoreboardVisibility';
import type { MatchViewState } from '../projectors/view-state-types';
import styles from './AnimatedScoreboard.module.css';

interface AnimatedScoreboardProps {
  view: MatchViewState;
  /** クリックで手動再表示できるか */
  allowManualShow?: boolean;
}

export function AnimatedScoreboard({
  view,
  allowManualShow = true,
}: AnimatedScoreboardProps): React.ReactElement {
  const { phase, triggerShow } = useScoreboardVisibility(view.inningLabel);

  // hidden の場合は DOM から除外せず、transform で隠す
  const isHidden = phase === 'hidden';

  const overlayClass = [
    styles.scoreboardOverlay,
    phase === 'sliding_in' ? styles.slidingIn : '',
    phase === 'visible' ? styles.visible : '',
    phase === 'sliding_out' ? styles.slidingOut : '',
    isHidden ? styles.hidden : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inningScores = view.inningScores;
  const totalInnings = Math.max(
    inningScores.home.length,
    inningScores.away.length,
    9,
  );
  const inningCols = Array.from({ length: totalInnings }, (_, i) => i);

  return (
    <>
      {/* スコアボードオーバーレイ */}
      <div
        className={overlayClass}
        aria-hidden={isHidden}
        role="status"
        aria-live="polite"
        aria-label={`スコアボード: ${view.inningLabel}`}
      >
        {/* イニングラベル */}
        <div className={styles.inningBadge}>
          <span className={styles.baseballEmoji}>⚾</span>
          <span className={styles.inningText}>{view.inningLabel}</span>
          {view.outs !== undefined && (
            <span className={styles.outsText}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={
                    i < (view.outs ?? 0)
                      ? styles.outDotFilled
                      : styles.outDotEmpty
                  }
                  aria-hidden="true"
                >
                  ●
                </span>
              ))}
            </span>
          )}
        </div>

        {/* スコア表示 */}
        <div className={styles.scoreRow}>
          <div className={styles.teamSection}>
            <span className={styles.teamLabel}>
              {view.awaySchoolShortName ?? view.awaySchoolName}
            </span>
            <span className={styles.scoreNum}>{view.score.away}</span>
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={styles.teamSection}>
            <span className={styles.scoreNum}>{view.score.home}</span>
            <span className={styles.teamLabel}>
              {view.homeSchoolShortName ?? view.homeSchoolName}
            </span>
          </div>
        </div>

        {/* イニング別スコア表 */}
        <div className={styles.inningTable} aria-label="イニング別スコア">
          <table className={styles.scoreTable}>
            <thead>
              <tr>
                <th className={styles.teamNameCell}></th>
                {inningCols.map((i) => (
                  <th
                    key={i}
                    className={[
                      styles.inningNumCell,
                      i + 1 === view.currentInning
                        ? styles.currentInning
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {i + 1}
                  </th>
                ))}
                <th className={styles.totalCell}>R</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.teamNameCell}>
                  {view.awaySchoolShortName ?? view.awaySchoolName.slice(0, 4)}
                </td>
                {inningCols.map((i) => (
                  <td
                    key={i}
                    className={[
                      styles.scoreCell,
                      i + 1 === view.currentInning
                        ? styles.currentInning
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {inningScores.away[i] ?? '-'}
                  </td>
                ))}
                <td className={styles.totalCell}>{view.score.away}</td>
              </tr>
              <tr>
                <td className={styles.teamNameCell}>
                  {view.homeSchoolShortName ?? view.homeSchoolName.slice(0, 4)}
                </td>
                {inningCols.map((i) => (
                  <td
                    key={i}
                    className={[
                      styles.scoreCell,
                      i + 1 === view.currentInning
                        ? styles.currentInning
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {inningScores.home[i] ?? '-'}
                  </td>
                ))}
                <td className={styles.totalCell}>{view.score.home}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* カウント */}
        <div className={styles.countRow}>
          <span className={styles.countBalls}>B:{view.count.balls}</span>
          <span className={styles.countStrikes}>S:{view.count.strikes}</span>
        </div>
      </div>

      {/* タップで再表示ボタン（スコアボード非表示中のみ表示） */}
      {isHidden && allowManualShow && (
        <button
          className={styles.showScoreboardBtn}
          onClick={triggerShow}
          aria-label="スコアボードを表示"
          type="button"
        >
          📊
        </button>
      )}
    </>
  );
}

