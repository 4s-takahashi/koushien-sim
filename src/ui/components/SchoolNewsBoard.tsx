'use client';

/**
 * SchoolNewsBoard.tsx — 自校ニュース枠コンポーネント
 * Phase S1-C C2 (2026-04-29)
 *
 * 自校タブに表示する「〇〇高校野球部ニュース」ボード。
 * WorldState.eventLog から直近30件のニュースを表示する。
 */

import type { SchoolNewsItem, SchoolNewsGenre } from '../../engine/news/school-news';

// ============================================================
// Props
// ============================================================

export interface SchoolNewsBoardProps {
  /** 自校 ID (現在は 'user' 相当) */
  schoolId: string;
  /** ニュースアイテム一覧（日付降順・最大30件）*/
  items: SchoolNewsItem[];
  /** 学校名（タイトル表示用） */
  schoolName?: string;
}

// ============================================================
// ジャンル別スタイル
// ============================================================

const GENRE_STYLE: Record<SchoolNewsGenre, { bg: string; border: string; label: string }> = {
  growth:  { bg: '#e8f5e9', border: '#43a047', label: '成長' },
  record:  { bg: '#fff3e0', border: '#fb8c00', label: '記録' },
  injury:  { bg: '#ffebee', border: '#e53935', label: '怪我' },
  mental:  { bg: '#e3f2fd', border: '#1e88e5', label: '心境' },
  general: { bg: '#f5f5f5', border: '#9e9e9e', label: '情報' },
};

// ============================================================
// 日付フォーマット
// ============================================================

function formatDate(date: SchoolNewsItem['date']): string {
  return `${date.year}年目 ${date.month}/${date.day}`;
}

// ============================================================
// ニュース1件コンポーネント
// ============================================================

function NewsRow({ item }: { item: SchoolNewsItem }) {
  const style = GENRE_STYLE[item.genre] ?? GENRE_STYLE.general;

  return (
    <li
      data-testid="school-news-item"
      data-genre={item.genre}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        padding: '7px 10px',
        marginBottom: 4,
        background: style.bg,
        borderRadius: 5,
        borderLeft: `3px solid ${style.border}`,
        listStyle: 'none',
      }}
    >
      <span
        data-testid="news-icon"
        style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.4 }}
        aria-label={style.label}
      >
        {item.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#333', lineHeight: 1.4 }}>
          {item.headline}
        </div>
        {item.detail && (
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            {item.detail}
          </div>
        )}
      </div>
      <span
        data-testid="news-date"
        style={{
          fontSize: 10,
          color: '#888',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {formatDate(item.date)}
      </span>
    </li>
  );
}

// ============================================================
// SchoolNewsBoard 本体
// ============================================================

/**
 * 自校ニュースボード。
 * - 直近30件を日付降順で表示
 * - 各アイテムにジャンル別アイコンと日付を付与
 * - items が空のときは「ニュースはまだありません」を表示
 */
export function SchoolNewsBoard({ schoolId: _schoolId, items, schoolName }: SchoolNewsBoardProps) {
  return (
    <div
      data-testid="school-news-board"
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 7,
        padding: '12px 14px',
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1565c0' }}>
          📋 {schoolName ? `${schoolName} ニュース` : '自校ニュース'}
        </div>
        <span style={{ fontSize: 11, color: '#888' }}>
          直近 {Math.min(items.length, 30)} 件
        </span>
      </div>

      {/* ニュースリスト */}
      {items.length === 0 ? (
        <div
          data-testid="school-news-empty"
          style={{
            padding: '16px 0',
            textAlign: 'center',
            color: '#9e9e9e',
            fontSize: 12,
          }}
        >
          まだニュースはありません。日を進めると成長記録が集まります。
        </div>
      ) : (
        <ul
          data-testid="school-news-list"
          style={{ margin: 0, padding: 0 }}
        >
          {items.slice(0, 30).map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default SchoolNewsBoard;
