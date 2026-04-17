'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../../../stores/world-store';
import type { PracticeViewState } from '../../../ui/projectors/view-state-types';
import type { GameDate } from '../../../engine/types/calendar';

// ============================================================
// 日付選択ユーティリティ
// ============================================================

function addDays(date: GameDate, days: number): GameDate {
  const d = new Date(2000 + date.year, date.month - 1, date.day);
  d.setDate(d.getDate() + days);
  return {
    year: d.getFullYear() - 2000,
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

function gameDateToInputValue(d: GameDate): string {
  // We use a simple display-only representation
  return `${d.month}月${d.day}日`;
}

// ============================================================
// 予約済み一覧
// ============================================================

function ScheduledList({
  items,
  onCancel,
}: {
  items: PracticeViewState['scheduleItems'];
  onCancel: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>予約なし</p>;
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item) => (
        <li
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: '1px solid var(--color-border)',
            fontSize: 13,
            gap: 8,
          }}
        >
          <span style={{ color: 'var(--color-accent)', fontWeight: 600, minWidth: 52 }}>
            {item.dateLabel}
          </span>
          <span style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 11,
                background: item.type === 'scrimmage' ? 'var(--color-accent)' : '#555',
                color: '#fff',
                borderRadius: 3,
                padding: '1px 5px',
                marginRight: 6,
              }}
            >
              {item.typeLabel}
            </span>
            {item.opponentName}
          </span>
          <button
            onClick={() => onCancel(item.id)}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 3,
              padding: '2px 8px',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--color-text-muted)',
            }}
          >
            キャンセル
          </button>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// 対戦相手候補
// ============================================================

function OpponentList({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: PracticeViewState['opponentCandidates'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (candidates.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>候補校なし（同都道府県・評判差±30以内）</p>;
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {candidates.map((c) => (
        <li
          key={c.schoolId}
          onClick={() => onSelect(c.schoolId)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 10px',
            marginBottom: 4,
            borderRadius: 4,
            border: selectedId === c.schoolId
              ? '2px solid var(--color-accent)'
              : '1px solid var(--color-border)',
            cursor: 'pointer',
            background: selectedId === c.schoolId ? 'rgba(0,120,212,0.08)' : 'var(--color-bg)',
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: selectedId === c.schoolId ? 700 : 400 }}>{c.schoolName}</span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            評判 {c.reputation}
            {c.reputationDiff > 0 ? ` (+${c.reputationDiff})` : c.reputationDiff < 0 ? ` (${c.reputationDiff})` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// 履歴リスト
// ============================================================

function HistoryList({ items }: { items: PracticeViewState['historyItems'] }) {
  if (items.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>まだ実施履歴がありません</p>;
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((h) => (
        <li
          key={h.id}
          style={{
            padding: '8px 0',
            borderBottom: '1px solid var(--color-border)',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-muted)', minWidth: 48 }}>{h.dateLabel}</span>
            <span
              style={{
                color: h.result === 'win' ? '#4caf50' : h.result === 'loss' ? '#f44336' : '#999',
                fontWeight: 700,
                minWidth: 52,
              }}
            >
              {h.resultLabel}
            </span>
            <span style={{ flex: 1, paddingLeft: 8 }}>{h.opponentName}</span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{h.scoreLabel}</span>
          </div>
          {h.highlights.length > 0 && (
            <div style={{ marginTop: 2, color: 'var(--color-text-muted)', fontSize: 11 }}>
              {h.highlights[0]}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// 日付オフセット選択
// ============================================================

function DateOffsetSelector({
  currentDate,
  selected,
  onSelect,
}: {
  currentDate: GameDate;
  selected: GameDate | null;
  onSelect: (d: GameDate) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[1, 2, 3, 4, 5, 6, 7].map((offset) => {
        const d = addDays(currentDate, offset);
        const isSelected = selected && selected.month === d.month && selected.day === d.day;
        return (
          <button
            key={offset}
            onClick={() => onSelect(d)}
            style={{
              padding: '5px 12px',
              borderRadius: 4,
              border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
              background: isSelected ? 'var(--color-accent)' : 'var(--color-bg)',
              color: isSelected ? '#fff' : 'var(--color-text)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: isSelected ? 700 : 400,
            }}
          >
            {d.month}/{d.day}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function PracticePage() {
  const router = useRouter();
  const worldState = useWorldStore((s) => s.worldState);
  const getPracticeView = useWorldStore((s) => s.getPracticeView);
  const schedulePracticeGame = useWorldStore((s) => s.schedulePracticeGame);
  const scheduleIntraSquadGame = useWorldStore((s) => s.scheduleIntraSquadGame);
  const cancelPracticeGameAction = useWorldStore((s) => s.cancelPracticeGameAction);

  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<GameDate | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play">ホームに戻る</Link>
      </div>
    );
  }

  const view = getPracticeView();
  if (!view) return <div style={{ padding: 40 }}>読み込み中...</div>;

  const currentDate = worldState.currentDate;

  function showFeedback(msg: string, ok: boolean) {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 3000);
  }

  function handleScheduleScrimmage() {
    if (!selectedOpponentId) {
      showFeedback('相手校を選択してください', false);
      return;
    }
    if (!selectedDate) {
      showFeedback('試合日を選択してください', false);
      return;
    }
    const res = schedulePracticeGame(selectedOpponentId, selectedDate);
    showFeedback(res.message, res.success);
    if (res.success) {
      setSelectedOpponentId(null);
      setSelectedDate(null);
    }
  }

  function handleScheduleIntraSquad() {
    if (!selectedDate) {
      showFeedback('試合日を選択してください', false);
      return;
    }
    const res = scheduleIntraSquadGame(selectedDate);
    showFeedback(res.message, res.success);
    if (res.success) {
      setSelectedDate(null);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Link href="/play" style={{ fontSize: 13, color: 'var(--color-accent)' }}>
          ← ホーム
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>練習試合・紅白戦</h1>
      </div>

      {/* フィードバック */}
      {feedback && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 6,
            background: feedback.ok ? 'rgba(76,175,80,0.12)' : 'rgba(244,67,54,0.12)',
            border: `1px solid ${feedback.ok ? '#4caf50' : '#f44336'}`,
            color: feedback.ok ? '#4caf50' : '#f44336',
            fontSize: 13,
          }}
        >
          {feedback.msg}
        </div>
      )}

      {/* 予約不可メッセージ */}
      {!view.canSchedule && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'rgba(255,152,0,0.1)',
            border: '1px solid #ff9800',
            color: '#ff9800',
            fontSize: 13,
          }}
        >
          {view.cannotScheduleReason}
        </div>
      )}

      {/* 予約済み一覧 */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
          予約済み（{view.scheduledCount}/{view.maxScheduled}）
        </h2>
        <ScheduledList
          items={view.scheduleItems}
          onCancel={(id) => {
            cancelPracticeGameAction(id);
            showFeedback('予約をキャンセルしました', true);
          }}
        />
      </section>

      {/* 予約フォーム */}
      {view.canSchedule && view.scheduledCount < view.maxScheduled && (
        <section
          style={{
            marginBottom: 24,
            padding: '16px',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            background: 'var(--color-surface)',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 14 }}>
            新しい試合を予約
          </h2>

          {/* 日付選択 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              試合日（今日から最大7日先）
            </div>
            <DateOffsetSelector
              currentDate={currentDate}
              selected={selectedDate}
              onSelect={setSelectedDate}
            />
            {selectedDate && (
              <div style={{ fontSize: 12, color: 'var(--color-accent)', marginTop: 4 }}>
                選択中: {gameDateToInputValue(selectedDate)}
              </div>
            )}
          </div>

          {/* 練習試合（相手選択） */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              練習試合の相手を選ぶ
            </div>
            <OpponentList
              candidates={view.opponentCandidates}
              selectedId={selectedOpponentId}
              onSelect={setSelectedOpponentId}
            />
            <button
              onClick={handleScheduleScrimmage}
              disabled={!selectedOpponentId || !selectedDate}
              style={{
                marginTop: 10,
                padding: '8px 18px',
                background: selectedOpponentId && selectedDate ? 'var(--color-accent)' : '#555',
                color: '#fff',
                border: 'none',
                borderRadius: 5,
                cursor: selectedOpponentId && selectedDate ? 'pointer' : 'default',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              練習試合を予約する
            </button>
          </div>

          {/* 紅白戦 */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>紅白戦（自校内）</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              相手不要。自校選手を2チームに分けて対戦します（疲労少なめ）。
            </div>
            <button
              onClick={handleScheduleIntraSquad}
              disabled={!selectedDate}
              style={{
                padding: '7px 16px',
                background: selectedDate ? '#555' : '#333',
                color: '#ccc',
                border: '1px solid var(--color-border)',
                borderRadius: 5,
                cursor: selectedDate ? 'pointer' : 'default',
                fontSize: 13,
              }}
            >
              紅白戦を予約する
            </button>
          </div>
        </section>
      )}

      {/* 通算成績 */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>通算成績</h2>
        <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
          <span>
            <strong style={{ color: '#4caf50', fontSize: 18 }}>{view.totalWins}</strong> 勝
          </span>
          <span>
            <strong style={{ color: '#f44336', fontSize: 18 }}>{view.totalLosses}</strong> 敗
          </span>
          <span>
            <strong style={{ color: '#999', fontSize: 18 }}>{view.totalDraws}</strong> 分
          </span>
        </div>
      </section>

      {/* 履歴 */}
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>実施履歴</h2>
        <HistoryList items={view.historyItems} />
      </section>
    </div>
  );
}
