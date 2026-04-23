'use client';

/**
 * AnalystPanel.tsx
 *
 * Phase 12-K: アナリストマネージャーによる相手投手分析コメントパネル
 *
 * イニング切れ目で生成されたコメントをスクロール可能な吹き出しで表示する。
 * 実況ログとは別枠で表示（infoColumn の中に配置）。
 */

import { useRef, useEffect } from 'react';
import type { AnalystComment } from '../../../../engine/staff/analyst';
import styles from './analystPanel.module.css';

// ============================================================
// 型
// ============================================================

interface AnalystPanelProps {
  comments: AnalystComment[];
  /** パネルを表示するか（analyticsマネージャーが存在するか） */
  visible: boolean;
}

// ============================================================
// 定数
// ============================================================

const KIND_LABEL: Record<AnalystComment['kind'], string> = {
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

// ============================================================
// コメントアイテム
// ============================================================

interface CommentItemProps {
  comment: AnalystComment;
}

function CommentItem({ comment }: CommentItemProps) {
  const icon = KIND_LABEL[comment.kind] ?? '📊';
  const levelStars = '★'.repeat(comment.analystLevel) + '☆'.repeat(5 - comment.analystLevel);

  return (
    <div className={styles.commentItem}>
      <div className={styles.commentHeader}>
        <span className={styles.commentIcon}>{icon}</span>
        <span className={styles.commentInning}>
          {comment.inning}回{halfLabel(comment.half)}終了後
        </span>
        <span className={styles.commentName}>
          📊 {comment.analystName}
        </span>
        <span className={styles.commentLevel} title={`アナリストレベル ${comment.analystLevel}`}>
          {levelStars}
        </span>
      </div>
      <div className={styles.commentText}>{comment.text}</div>
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================

export function AnalystPanel({ comments, visible }: AnalystPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新しいコメントが追加されたら自動スクロール
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [comments.length]);

  if (!visible) return null;

  return (
    <div className={styles.analystPanel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>📊 投手分析レポート</span>
        {comments.length === 0 && (
          <span className={styles.panelEmpty}>イニング終了時に分析が届きます</span>
        )}
      </div>
      {comments.length > 0 && (
        <div ref={scrollRef} className={styles.commentList}>
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </div>
      )}
    </div>
  );
}
