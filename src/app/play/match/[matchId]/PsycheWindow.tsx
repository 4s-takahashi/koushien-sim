'use client';

/**
 * PsycheWindow.tsx
 *
 * Phase 7-B: 選手心理ウィンドウ
 * 直前の投球に紐づくモノローグを吹き出し風に表示する。
 * - 打者は左側
 * - 投手は右側
 * - 捕手は中央下
 */

import type { MonologueEntry } from '../../../../ui/projectors/view-state-types';
import styles from './psycheWindow.module.css';

// ============================================================
// 型
// ============================================================

interface PsycheWindowProps {
  /** 最新投球ログのモノローグエントリ */
  monologues: MonologueEntry[] | undefined;
  /** 打者名 */
  batterName: string;
  /** 投手名 */
  pitcherName: string;
}

// ============================================================
// 吹き出しコンポーネント
// ============================================================

interface BubbleProps {
  role: MonologueEntry['role'];
  text: string;
  effectSummary?: string;
  playerName: string;
}

function Bubble({ role, text, effectSummary, playerName }: BubbleProps) {
  const isBatter = role === 'batter';
  const isPitcher = role === 'pitcher';
  const isCatcher = role === 'catcher';

  let positionCls = styles.bubbleCatcher;
  if (isBatter) positionCls = styles.bubbleBatter;
  if (isPitcher) positionCls = styles.bubblePitcher;

  const roleLabel =
    isBatter ? '打者' :
    isPitcher ? '投手' :
    isCatcher ? '捕手' :
    role === 'runner' ? '走者' : '野手';

  return (
    <div className={`${styles.bubble} ${positionCls}`}>
      <div className={styles.bubbleHeader}>
        <span className={styles.bubbleRole}>{roleLabel}</span>
        <span className={styles.bubbleName}>{playerName}</span>
      </div>
      <div className={styles.bubbleText}>「{text}」</div>
      {effectSummary && (
        <div className={styles.bubbleEffect}>{effectSummary}</div>
      )}
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================

export function PsycheWindow({ monologues, batterName, pitcherName }: PsycheWindowProps) {
  if (!monologues || monologues.length === 0) {
    return null;
  }

  const batter = monologues.find((m) => m.role === 'batter');
  const pitcher = monologues.find((m) => m.role === 'pitcher');
  const catcher = monologues.find((m) => m.role === 'catcher');

  const hasBubble = batter || pitcher || catcher;
  if (!hasBubble) return null;

  const getPlayerName = (role: MonologueEntry['role']) => {
    if (role === 'batter') return batterName;
    if (role === 'pitcher') return pitcherName;
    if (role === 'catcher') return '捕手';
    return role;
  };

  return (
    <div className={styles.psycheWindow}>
      <div className={styles.psycheTitle}>🧠 選手心理</div>
      <div className={styles.bubblesRow}>
        {batter && (
          <Bubble
            role={batter.role}
            text={batter.text}
            effectSummary={batter.effectSummary}
            playerName={getPlayerName(batter.role)}
          />
        )}
        {catcher && (
          <Bubble
            role={catcher.role}
            text={catcher.text}
            effectSummary={catcher.effectSummary}
            playerName={getPlayerName(catcher.role)}
          />
        )}
        {pitcher && (
          <Bubble
            role={pitcher.role}
            text={pitcher.text}
            effectSummary={pitcher.effectSummary}
            playerName={getPlayerName(pitcher.role)}
          />
        )}
      </div>
    </div>
  );
}
