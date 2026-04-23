'use client';

/**
 * PsycheWindow.tsx
 *
 * Phase 7-B: 選手心理ウィンドウ
 * Phase 12-I: 3バブル横並び → 1バブル + 1秒ローテーション
 *
 * 打者→捕手→投手を1秒ごとに切り替えて1つの吹き出しで表示する。
 * null/undefined の役割はスキップする。
 */

import { useState, useEffect } from 'react';
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
  /** 打者の所属チーム短縮名（v0.23.0） */
  batterSchoolShortName?: string;
  /** 投手名 */
  pitcherName: string;
  /** 投手の所属チーム短縮名（v0.23.0） */
  pitcherSchoolShortName?: string;
}

// ============================================================
// 吹き出しコンポーネント（1バブル）
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
    <div className={`${styles.bubble} ${positionCls} ${styles.bubbleSingle}`}>
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

export function PsycheWindow({ monologues, batterName, batterSchoolShortName, pitcherName, pitcherSchoolShortName }: PsycheWindowProps) {
  const [roleIndex, setRoleIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  if (!monologues || monologues.length === 0) {
    return null;
  }

  const batter = monologues.find((m) => m.role === 'batter');
  const catcher = monologues.find((m) => m.role === 'catcher');
  const pitcher = monologues.find((m) => m.role === 'pitcher');

  // null でないロールを順番に並べる（打者→捕手→投手）
  const activeBubbles = [
    batter  ? { entry: batter,  name: batterSchoolShortName ? `${batterName}(${batterSchoolShortName})` : batterName } : null,
    catcher ? { entry: catcher, name: '捕手' } : null,
    pitcher ? { entry: pitcher, name: pitcherSchoolShortName ? `${pitcherName}(${pitcherSchoolShortName})` : pitcherName } : null,
  ].filter((b): b is NonNullable<typeof b> => b !== null);

  const hasBubble = activeBubbles.length > 0;
  if (!hasBubble) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (activeBubbles.length <= 1) return;
    const interval = setInterval(() => {
      // フェードアウト → インデックス更新 → フェードイン
      setVisible(false);
      setTimeout(() => {
        setRoleIndex((prev) => (prev + 1) % activeBubbles.length);
        setVisible(true);
      }, 200);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeBubbles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const safeIndex = roleIndex % activeBubbles.length;
  const current = activeBubbles[safeIndex];

  return (
    <div className={styles.psycheWindow}>
      <div className={styles.psycheTitle}>
        🧠 選手心理
        {activeBubbles.length > 1 && (
          <span className={styles.psycheRotateDots}>
            {activeBubbles.map((_, i) => (
              <span
                key={i}
                className={i === safeIndex ? styles.psycheRotateDotActive : styles.psycheRotateDot}
              />
            ))}
          </span>
        )}
      </div>
      <div className={`${styles.bubbleFade} ${visible ? styles.bubbleFadeIn : styles.bubbleFadeOut}`}>
        <Bubble
          role={current.entry.role}
          text={current.entry.text}
          effectSummary={current.entry.effectSummary}
          playerName={current.name}
        />
      </div>
    </div>
  );
}
