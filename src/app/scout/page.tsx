'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useWorldStore } from '../../stores/world-store';
import type { ScoutViewState, WatchListPlayerView } from '../../ui/projectors/view-state-types';
import styles from './page.module.css';

// ============================================================
// ヘルパー
// ============================================================

function getTierClass(tier: string): string {
  const map: Record<string, string> = {
    S: styles.tierS, A: styles.tierA, B: styles.tierB, C: styles.tierC, D: styles.tierD,
  };
  return map[tier] ?? styles.tierD;
}

function getBadgeClass(badge: WatchListPlayerView['statusBadge']): string {
  switch (badge) {
    case 'confirmed':  return styles.badgeConfirmed;
    case 'competing':  return styles.badgeCompeting;
    case 'recruited':  return styles.badgeRecruited;
    case 'visited':    return styles.badgeVisited;
    case 'unvisited':  return styles.badgeUnvisited;
    default:           return styles.badgeUnvisited;
  }
}

function getBadgeLabel(badge: WatchListPlayerView['statusBadge']): string {
  switch (badge) {
    case 'confirmed':  return '入学確定';
    case 'competing':  return '競合中';
    case 'recruited':  return '勧誘済み';
    case 'visited':    return '視察済み';
    case 'unvisited':  return '未視察';
    default:           return '未視察';
  }
}

// ============================================================
// ウォッチリストカード
// ============================================================

function WatchCard({
  p,
  onVisit,
  onRecruit,
  onRemove,
  budgetRemaining,
  visitingId,
  recruitingId,
}: {
  p: WatchListPlayerView;
  onVisit: (id: string) => void;
  onRecruit: (id: string) => void;
  onRemove: (id: string) => void;
  budgetRemaining: number;
  visitingId: string | null;
  recruitingId: string | null;
}) {
  const isVisiting  = visitingId === p.id;
  const isRecruiting = recruitingId === p.id;

  return (
    <div className={`${styles.watchCard} ${
      p.statusBadge === 'confirmed' ? styles.watchCardConfirmed
      : p.statusBadge === 'competing' ? styles.watchCardCompeting
      : ''
    }`}>
      {/* ヘッダー行 */}
      <div className={styles.watchCardHeader}>
        <div className={styles.watchCardName}>
          <span className={`${styles.tierBadge} ${getTierClass(p.qualityTier)}`}>
            {p.qualityTier}
          </span>
          <strong>{p.lastName}{p.firstName}</strong>
          <span className={styles.watchCardGrade}>{p.gradeLabel}</span>
        </div>
        <span className={`${styles.statusBadge} ${getBadgeClass(p.statusBadge)}`}>
          {getBadgeLabel(p.statusBadge)}
        </span>
      </div>

      {/* 詳細行 */}
      <div className={styles.watchCardDetail}>
        <span>{p.prefecture} / {p.middleSchoolName}</span>
        <span className={styles.watchCardOverall}>評価: {p.estimatedOverall}</span>
      </div>

      {/* スカウトコメント */}
      {p.scoutCommentBrief && (
        <div className={styles.watchCardComment}>
          💬 {p.scoutCommentBrief}
        </div>
      )}

      {/* アクションボタン */}
      <div className={styles.watchCardActions}>
        <button
          className={`${styles.btn} ${styles.btnVisit} ${
            (budgetRemaining <= 0 || isVisiting) ? styles.btnDisabled : ''
          }`}
          onClick={() => onVisit(p.id)}
          disabled={budgetRemaining <= 0 || isVisiting}
        >
          {isVisiting ? '視察中...' : '🔍 視察'}
        </button>
        <button
          className={`${styles.btn} ${styles.btnRecruit} ${
            (p.statusBadge === 'confirmed' || isRecruiting) ? styles.btnDisabled : ''
          }`}
          onClick={() => onRecruit(p.id)}
          disabled={p.statusBadge === 'confirmed' || isRecruiting}
        >
          {isRecruiting ? '交渉中...' : '📝 勧誘'}
        </button>
        <button
          className={`${styles.btn} ${styles.btnRemove}`}
          onClick={() => onRemove(p.id)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ============================================================
// スカウト画面本体
// ============================================================

function ScoutContent({ view }: { view: ScoutViewState }) {
  const scoutVisit = useWorldStore((s) => s.scoutVisit);
  const recruitPlayerAction = useWorldStore((s) => s.recruitPlayerAction);
  const addToWatch = useWorldStore((s) => s.addToWatch);
  const removeFromWatch = useWorldStore((s) => s.removeFromWatch);

  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [visitingId, setVisitingId] = useState<string | null>(null);
  const [recruitingId, setRecruitingId] = useState<string | null>(null);

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleVisit = useCallback((id: string) => {
    setVisitingId(id);
    try {
      const result = scoutVisit(id);
      showMsg(result.message, result.success);
    } finally {
      setVisitingId(null);
    }
  }, [scoutVisit]);

  const handleRecruit = useCallback((id: string) => {
    setRecruitingId(id);
    try {
      const result = recruitPlayerAction(id);
      showMsg(result.message, result.success);
    } finally {
      setRecruitingId(null);
    }
  }, [recruitPlayerAction]);

  const budgetUsed = view.budgetTotal - view.budgetRemaining;

  // 検索結果をフィルタ
  const filteredResults = view.searchResults.filter((p) => {
    if (gradeFilter && p.grade !== Number(gradeFilter)) return false;
    if (tierFilter && p.qualityTier !== tierFilter) return false;
    return true;
  });

  return (
    <>
      {/* 予算バー（目立つ位置に） */}
      <div className={styles.budgetBar}>
        <div className={styles.budgetLeft}>
          <span className={styles.budgetLabel}>今月の視察予算</span>
          <span className={styles.budgetValue}>
            <strong className={styles.budgetNum}>{view.budgetRemaining}</strong>
            <span className={styles.budgetSep}> / </span>
            {view.budgetTotal} 回
          </span>
        </div>
        <div className={styles.budgetDots}>
          {Array.from({ length: view.budgetTotal }, (_, i) => (
            <div
              key={i}
              className={`${styles.dot} ${i < budgetUsed ? styles.dotUsed : styles.dotFree}`}
            />
          ))}
        </div>
        {view.budgetRemaining > 0 && (
          <span className={styles.budgetHint}>💡 {view.budgetRemaining}回視察できます</span>
        )}
      </div>

      {/* メッセージ */}
      {message && (
        <div className={message.ok ? styles.msgSuccess : styles.msgFail}>
          {message.ok ? '✓ ' : '✗ '}{message.text}
        </div>
      )}

      <div className={styles.grid}>
        {/* ウォッチリスト（カード形式） */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            注目リスト
            <span className={styles.sectionCount}>{view.watchList.length}人</span>
          </div>
          {view.watchList.length === 0 ? (
            <p className={styles.noData}>
              ウォッチリストに選手がいません。<br />
              中学生検索で「☆注目」を押して追加してください。
            </p>
          ) : (
            <div className={styles.watchCardList}>
              {view.watchList.map((p) => (
                <WatchCard
                  key={p.id}
                  p={p}
                  onVisit={handleVisit}
                  onRecruit={handleRecruit}
                  onRemove={(id) => removeFromWatch(id)}
                  budgetRemaining={view.budgetRemaining}
                  visitingId={visitingId}
                  recruitingId={recruitingId}
                />
              ))}
            </div>
          )}
        </div>

        {/* スカウトレポート */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            スカウトレポート
            <span className={styles.sectionCount}>{view.scoutReports.length}件</span>
          </div>
          {view.scoutReports.length === 0 ? (
            <p className={styles.noData}>まだレポートがありません。視察を行ってください。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {view.scoutReports.map((r) => (
                <div key={r.playerId} className={`${styles.reportCard} ${
                  r.estimatedQuality === 'S' ? styles.reportCardS
                  : r.estimatedQuality === 'A' ? styles.reportCardA
                  : ''
                }`}>
                  <div className={styles.reportHeader}>
                    <strong className={styles.reportName}>{r.playerName}</strong>
                    <span className={`${styles.tierBadge} ${getTierClass(r.estimatedQuality)}`}>
                      {r.estimatedQuality}
                    </span>
                    <span className={styles.reportConf}>{r.confidenceLabel}</span>
                  </div>
                  <div className={styles.reportStats}>
                    <span>スタ {r.observedStats.stamina}</span>
                    <span>速 {r.observedStats.speed}</span>
                    <span>肩 {r.observedStats.armStrength}</span>
                    <span>守 {r.observedStats.fielding}</span>
                    <span>打 {r.observedStats.contact}</span>
                    <span>パ {r.observedStats.power}</span>
                  </div>
                  <p className={styles.reportComment}>{r.scoutComment}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 中学生検索 */}
        <div className={`${styles.section} ${styles.sectionFull}`}>
          <div className={styles.sectionTitle}>中学生検索</div>
          <div className={styles.filterBar}>
            <span className={styles.filterLabel}>学年：</span>
            <select
              className={styles.filterSelect}
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
            >
              <option value="">すべて</option>
              <option value="3">中学3年</option>
              <option value="2">中学2年</option>
              <option value="1">中学1年</option>
            </select>
            <span className={styles.filterLabel}>評価：</span>
            <select
              className={styles.filterSelect}
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="">すべて</option>
              <option value="S">Sランク</option>
              <option value="A">Aランク</option>
              <option value="B">Bランク</option>
              <option value="C">Cランク</option>
              <option value="D">Dランク</option>
            </select>
            <span style={{ color: 'var(--color-text-sub)', fontSize: 11 }}>
              {filteredResults.length}名表示
            </span>
          </div>
          <table className={styles.scoutTable}>
            <thead>
              <tr>
                <th>名前</th>
                <th>学年</th>
                <th>出身</th>
                <th>中学校</th>
                <th>推定評価</th>
                <th>進学先</th>
                <th>コメント</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.slice(0, 50).map((p) => {
                // 検索結果のコメントはスカウトレポートから引く
                const report = view.scoutReports.find((r) => r.playerId === p.id);
                return (
                  <tr key={p.id}>
                    <td className={styles.tdName}>{p.lastName}{p.firstName}</td>
                    <td>{p.gradeLabel}</td>
                    <td style={{ fontSize: 11 }}>{p.prefecture}</td>
                    <td style={{ fontSize: 11 }}>{p.middleSchoolName}</td>
                    <td className={getTierClass(p.qualityTier)}>
                      {p.qualityTier}（{p.estimatedOverall}）
                    </td>
                    <td style={{ fontSize: 11, color: p.targetSchoolName ? 'var(--color-text-sub)' : 'var(--color-accent)' }}>
                      {p.targetSchoolName ?? '未決定'}
                    </td>
                    <td className={styles.tdComment}>
                      {report ? report.scoutComment.slice(0, 20) + (report.scoutComment.length > 20 ? '…' : '') : '—'}
                    </td>
                    <td>
                      <button
                        className={`${styles.btn} ${p.isOnWatchList ? styles.btnWatched : styles.btnWatch}`}
                        onClick={() => p.isOnWatchList ? removeFromWatch(p.id) : addToWatch(p.id)}
                      >
                        {p.isOnWatchList ? '★注目中' : '☆注目'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredResults.length > 50 && (
            <p style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 8 }}>
              ※上位50名を表示（全{filteredResults.length}名）
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// ページエントリポイント
// ============================================================

export default function ScoutPage() {
  const worldState = useWorldStore((s) => s.worldState);
  const getScoutView = useWorldStore((s) => s.getScoutView);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const view = getScoutView();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>スカウト</span>
        </div>
      </header>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/play" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
          <Link href="/news" className={styles.navLink}>ニュース</Link>
          <Link href="/scout" className={`${styles.navLink} ${styles.navLinkActive}`}>スカウト</Link>
          <Link href="/tournament" className={styles.navLink}>大会</Link>
          <Link href="/results" className={styles.navLink}>試合結果</Link>
          <Link href="/ob" className={styles.navLink}>OB</Link>
        </div>
      </nav>
      <main className={styles.main}>
        {view ? <ScoutContent view={view} /> : <p className={styles.noData}>読み込み中...</p>}
      </main>
    </div>
  );
}
