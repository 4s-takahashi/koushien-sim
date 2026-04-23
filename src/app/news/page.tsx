'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../../stores/world-store';
import type { WorldNewsItem } from '../../engine/world/world-ticker';
import styles from './page.module.css';

// ============================================================
// ニュースアイテムコンポーネント
// ============================================================

function getNewsIcon(type: string, headline: string): string {
  if (type === 'upset') return '🔥';
  if (type === 'draft') return '📋';
  if (type === 'injury') return '🏥';
  if (type === 'no_hitter') return '✨';
  if (type === 'tournament_result') {
    if (headline.includes('甲子園')) return '🏆';
    return '⚾';
  }
  if (type === 'record') {
    if (headline.includes('OB')) return '🏆';
    return '📊';
  }
  if (headline.includes('注目株') || headline.includes('超高校級')) return '⭐';
  return '📰';
}

function getImportanceLabel(importance: string): string {
  if (importance === 'high') return '重要';
  if (importance === 'medium') return '注目';
  return '一般';
}

interface NewsItemViewProps {
  item: WorldNewsItem;
  index: number;
  schoolNameMap: Map<string, string>;
  playerNameMap: Map<string, string>;
  playerSchoolId: string;
}

function NewsItemView({ item, index, schoolNameMap, playerNameMap, playerSchoolId }: NewsItemViewProps) {
  const [expanded, setExpanded] = useState(false);

  const icon = getNewsIcon(item.type, item.headline);
  const importanceClass =
    item.importance === 'high' ? styles.newsHigh
    : item.importance === 'medium' ? styles.newsMedium
    : styles.newsLow;

  const involvedSchools = item.involvedSchoolIds
    .map(id => ({ id, name: schoolNameMap.get(id) ?? id }));

  const involvedPlayers = item.involvedPlayerIds
    .map(pid => ({ id: pid, name: playerNameMap.get(pid) ?? `選手(${pid.slice(0, 6)})` }));

  const hasDetail = involvedSchools.length > 0 || involvedPlayers.length > 0;

  return (
    <li className={`${styles.newsItem} ${importanceClass}`}>
      <div
        className={styles.newsHeader}
        onClick={() => hasDetail && setExpanded(!expanded)}
        style={{ cursor: hasDetail ? 'pointer' : 'default' }}
      >
        <span className={styles.newsIcon}>{icon}</span>
        <div className={styles.newsContent}>
          <span className={styles.newsHeadline}>{item.headline}</span>
          <div className={styles.newsMeta}>
            <span className={`${styles.newsBadge} ${importanceClass}`}>
              {getImportanceLabel(item.importance)}
            </span>
            {hasDetail && (
              <span className={styles.expandHint}>{expanded ? '▲ 閉じる' : '▼ 詳細'}</span>
            )}
          </div>
        </div>
      </div>

      {expanded && hasDetail && (
        <div className={styles.newsDetail}>
          {involvedSchools.length > 0 && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>関連校：</span>
              <div className={styles.detailLinks}>
                {involvedSchools.map(({ id, name }) => (
                  <Link
                    key={id}
                    href={`/school/${id}`}
                    className={styles.schoolLink}
                  >
                    {name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {involvedPlayers.length > 0 && (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>関連選手：</span>
              <div className={styles.detailLinks}>
                {involvedPlayers.map(({ id, name }) => (
                  <Link
                    key={id}
                    href={`/player/${id}`}
                    className={styles.playerLink}
                  >
                    {name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ============================================================
// ニュースページ本体
// ============================================================

export default function NewsPage() {
  const worldState = useWorldStore((s) => s.worldState);
  const recentNews = useWorldStore((s) => s.recentNews);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  // 学校名マップ
  const schoolNameMap = new Map<string, string>();
  for (const school of worldState.schools) {
    schoolNameMap.set(school.id, school.name);
  }

  // Feature #4 Phase 12-M: 選手名マップ（全校の選手をインデックス化）
  const playerNameMap = new Map<string, string>();
  for (const school of worldState.schools) {
    for (const player of school.players) {
      playerNameMap.set(player.id, `${player.lastName}${player.firstName}`);
    }
  }

  const playerSchoolId = worldState.playerSchoolId;

  // ニュースを重要度順でソート
  const sortedNews = [...recentNews].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.importance] - order[b.importance];
  });

  return (
    <div className={styles.page}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>ニュース一覧</span>
          <Link href="/play" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
            ← ホームに戻る
          </Link>
        </div>
      </header>

      {/* ナビゲーション */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/play" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
          <Link href="/news" className={`${styles.navLink} ${styles.navLinkActive}`}>ニュース</Link>
          <Link href="/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/tournament" className={styles.navLink}>大会</Link>
          <Link href="/results" className={styles.navLink}>試合結果</Link>
          <Link href="/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>全ニュース</h2>
            <span className={styles.newsCount}>{sortedNews.length}件</span>
          </div>

          {sortedNews.length === 0 ? (
            <div className={styles.empty}>
              <p>まだニュースはありません。</p>
              <p className={styles.emptyHint}>日を進めるとニュースが集まります。</p>
            </div>
          ) : (
            <ul className={styles.newsList}>
              {sortedNews.map((item, i) => (
                <NewsItemView
                  key={i}
                  item={item}
                  index={i}
                  schoolNameMap={schoolNameMap}
                  playerNameMap={playerNameMap}
                  playerSchoolId={playerSchoolId}
                />
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
