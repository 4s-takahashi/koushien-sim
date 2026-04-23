'use client';
/**
 * Phase 12-A/C: 試合中常時表示HUD（左上オーバーレイ）
 *
 * スコアボードが非表示の間、コンパクトにスコア・カウント・イニングを表示する
 *
 * Phase 12-M/hotfix-5.1: カウント表示を実物のカウンターパネル模倣に変更
 *   B (緑3個) / S (黄2個) / O (赤2個) のドット表示
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
  const balls = view.count.balls;
  const strikes = view.count.strikes;

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
      {/* BSO カウントパネル（実物カウンター模倣） */}
      <div
        className={styles.bsoPanel}
        aria-label={`B ${balls}, S ${strikes}, O ${outs}`}
      >
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
