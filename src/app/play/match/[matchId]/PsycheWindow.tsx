'use client';

/**
 * PsycheWindow.tsx
 *
 * Phase 7-B: 選手心理ウィンドウ
 * Phase 12-I: 3バブル横並び → 1バブル + 1秒ローテーション
 * Phase 12-K: ローテーション間隔 1秒 → 2秒、フェード 200ms → 300ms
 * Phase 12-L: アナリストコメントを同一ウィンドウ内に統合表示
 *
 * 打者→捕手→投手を2秒ごとに切り替えて1つの吹き出しで表示する。
 * アナリストが所属している場合はウィンドウ下部に「📊 アナリスト分析」セクションを追加表示する。
 * null/undefined の役割はスキップする。
 */

import { useState, useEffect, useRef } from 'react';
import type { MonologueEntry } from '../../../../ui/projectors/view-state-types';
import type { AnalystComment } from '../../../../engine/staff/analyst';
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
  /**
   * Phase 12-L: アナリストコメント一覧（存在する場合は下部に統合表示）
   * undefined の場合はアナリストセクションを非表示
   */
  analystComments?: AnalystComment[];
  /**
   * Phase 12-L: アナリストが所属しているかどうか
   * false の場合はアナリストセクションを非表示
   */
  hasAnalyst?: boolean;
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
// Phase 12-L: アナリストコメントセクション
// ============================================================

const ANALYST_KIND_ICON: Record<AnalystComment['kind'], string> = {
  insufficient: '📋',
  pitch_tendency: '⚾',
  location_tendency: '📍',
  count_tendency: '🔢',
  runner_tendency: '🏃',
  noise: '❓',
};

function halfLabel(half: 'top' | 'bottom'): string {
  return half === 'top' ? '表' : '裏';
}

interface AnalystSectionProps {
  comments: AnalystComment[];
}

function AnalystSection({ comments }: AnalystSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新しいコメントが追加されたら自動スクロール
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [comments.length]);

  return (
    <div className={styles.analystSection}>
      <div className={styles.analystSectionTitle}>📊 アナリスト分析</div>
      {comments.length === 0 ? (
        <div className={styles.analystEmpty}>イニング終了時に分析が届きます</div>
      ) : (
        <div ref={scrollRef} className={styles.analystCommentList}>
          {comments.map((c) => {
            const icon = ANALYST_KIND_ICON[c.kind] ?? '📊';
            const levelStars = '★'.repeat(c.analystLevel) + '☆'.repeat(5 - c.analystLevel);
            return (
              <div key={c.id} className={styles.analystCommentItem}>
                <div className={styles.analystCommentHeader}>
                  <span className={styles.analystCommentIcon}>{icon}</span>
                  <span className={styles.analystCommentInning}>
                    {c.inning}回{halfLabel(c.half)}後
                  </span>
                  <span className={styles.analystCommentName}>📊 {c.analystName}</span>
                  <span className={styles.analystCommentLevel} title={`アナリストレベル ${c.analystLevel}`}>
                    {levelStars}
                  </span>
                </div>
                <div className={styles.analystCommentText}>{c.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================

export function PsycheWindow({
  monologues,
  batterName,
  batterSchoolShortName,
  pitcherName,
  pitcherSchoolShortName,
  analystComments,
  hasAnalyst = false,
}: PsycheWindowProps) {
  const [roleIndex, setRoleIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // アクティブなバブルを計算（hooks の前に計算して依存関係を安定させる）
  const batter = monologues?.find((m) => m.role === 'batter');
  const catcher = monologues?.find((m) => m.role === 'catcher');
  const pitcher = monologues?.find((m) => m.role === 'pitcher');

  const activeBubbles = [
    batter  ? { entry: batter,  name: batterSchoolShortName ? `${batterName}(${batterSchoolShortName})` : batterName } : null,
    catcher ? { entry: catcher, name: '捕手' } : null,
    pitcher ? { entry: pitcher, name: pitcherSchoolShortName ? `${pitcherName}(${pitcherSchoolShortName})` : pitcherName } : null,
  ].filter((b): b is NonNullable<typeof b> => b !== null);

  const hasBubble = activeBubbles.length > 0;
  const showAnalyst = hasAnalyst && analystComments !== undefined;

  // Phase 12-L: フック呼び出しはすべて条件チェックの前に置く（rules-of-hooks 準拠）
  useEffect(() => {
    if (activeBubbles.length <= 1) return;
    const interval = setInterval(() => {
      // フェードアウト → インデックス更新 → フェードイン
      setVisible(false);
      setTimeout(() => {
        setRoleIndex((prev) => (prev + 1) % activeBubbles.length);
        setVisible(true);
      }, 300); // Phase 12-K: 200ms → 300ms
    }, 2000); // Phase 12-K: 1000ms → 2000ms
    return () => clearInterval(interval);
  }, [activeBubbles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // どちらのセクションも表示しない場合は null を返す
  if (!hasBubble && !showAnalyst) return null;

  const safeIndex = roleIndex % Math.max(activeBubbles.length, 1);
  const current = hasBubble ? activeBubbles[safeIndex] : null;

  return (
    <div className={styles.psycheWindow}>
      {hasBubble && (
        <>
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
            {current && (
              <Bubble
                role={current.entry.role}
                text={current.entry.text}
                effectSummary={current.entry.effectSummary}
                playerName={current.name}
              />
            )}
          </div>
        </>
      )}

      {/* Phase 12-L: アナリストコメントを同一ウィンドウ内に統合表示 */}
      {showAnalyst && (
        <AnalystSection comments={analystComments!} />
      )}
    </div>
  );
}
