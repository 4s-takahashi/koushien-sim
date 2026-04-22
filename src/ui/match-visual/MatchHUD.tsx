'use client';
/**
 * Phase 12-A/C: 試合中常時表示HUD（左上オーバーレイ）
 *
 * スコアボードが非表示の間、コンパクトにスコア・カウント・イニングを表示する
 */

import React from 'react';
import type { MatchViewState } from '../projectors/view-state-types';
import styles from './MatchHUD.module.css';

interface MatchHUDProps {
  view: MatchViewState;
  /** スコアボードが表示中かどうか（表示中は HUD を薄くする） */
  scoreboardVisible?: boolean;
}

export function MatchHUD({
  view,
  scoreboardVisible = false,
}: MatchHUDProps): React.ReactElement {
  const outs = (view as MatchViewState & { outs?: number }).outs ?? 0;

  return (
    <div
      className={[
        styles.hud,
        scoreboardVisible ? styles.hudDimmed : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="試合情報HUD"
      role="complementary"
    >
      {/* カウント行 */}
      <div className={styles.hudCount}>
        <span className={styles.hudBalls} title="ボール">
          B:{view.count.balls}
        </span>
        <span className={styles.hudSep}> </span>
        <span className={styles.hudStrikes} title="ストライク">
          S:{view.count.strikes}
        </span>
        <span className={styles.hudSep}> </span>
        {/* アウト表示 */}
        <span className={styles.hudOuts} aria-label={`${outs}アウト`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={
                i < outs ? styles.hudOutDotFilled : styles.hudOutDotEmpty
              }
              aria-hidden="true"
            />
          ))}
        </span>
      </div>

      {/* イニング行 */}
      <div className={styles.hudInning}>{view.inningLabel}</div>

      {/* スコア行 */}
      <div className={styles.hudScore}>
        <span className={styles.hudTeamName} title={view.awaySchoolName}>
          {view.awaySchoolShortName ?? view.awaySchoolName.slice(0, 4)}
        </span>
        <span className={styles.hudScoreNum}>{view.score.away}</span>
        <span className={styles.hudScoreSep}>-</span>
        <span className={styles.hudScoreNum}>{view.score.home}</span>
        <span className={styles.hudTeamName} title={view.homeSchoolName}>
          {view.homeSchoolShortName ?? view.homeSchoolName.slice(0, 4)}
        </span>
      </div>
    </div>
  );
}
