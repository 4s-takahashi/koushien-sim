'use client';

import Link from 'next/link';
import { useWorldStore } from '../../stores/world-store';
import type { OBViewState, OBPlayerView } from '../../ui/projectors/view-state-types';
import styles from './page.module.css';

function getRankClass(rank: string): string {
  const map: Record<string, string> = {
    S: styles.rankS, A: styles.rankA, B: styles.rankB,
    C: styles.rankC, D: styles.rankD, E: styles.rankE,
  };
  return map[rank] ?? styles.rankE;
}

function getCareerClass(type: string): string {
  if (type === 'pro') return styles.careerPro;
  if (type === 'university') return styles.careerUniv;
  if (type === 'corporate') return styles.careerCorp;
  return styles.careerRetire;
}

function OBContent({ view }: { view: OBViewState }) {
  return (
    <>
      {/* 統計バー */}
      <div className={styles.statsBar}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>総卒業生</div>
          <div className={styles.statValue}>{view.totalGraduates}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>プロ入り</div>
          <div className={`${styles.statValue} ${styles.rankA}`}>{view.proCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>大学進学</div>
          <div className={`${styles.statValue} ${styles.rankB}`}>{view.universityCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>社会人野球</div>
          <div className={styles.statValue}>{view.corporateCount}</div>
        </div>
      </div>

      {/* 自校OB */}
      {view.playerSchoolGraduates.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>自校のOB</div>
          <OBTable players={view.playerSchoolGraduates} />
        </div>
      )}

      {/* 全OB */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          OB一覧（{view.totalGraduates}名）
        </div>
        {view.graduates.length === 0 ? (
          <p className={styles.noData}>
            まだ卒業生はいません。年度が進むと選手が卒業します。
          </p>
        ) : (
          <OBTable players={view.graduates} />
        )}
      </div>
    </>
  );
}

function OBTable({ players }: { players: OBPlayerView[] }) {
  return (
    <table className={styles.obTable}>
      <thead>
        <tr>
          <th>名前</th>
          <th>卒業</th>
          <th>学校</th>
          <th>総合力</th>
          <th>進路</th>
          <th>実績</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.personId}>
            <td>
              <strong>{p.name}</strong>
            </td>
            <td style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
              {p.graduationYearLabel}
            </td>
            <td style={{ fontSize: 11 }}>{p.schoolName}</td>
            <td>
              <span className={getRankClass(p.overallRank)}>
                {p.finalOverall} <span style={{ fontSize: 10 }}>{p.overallRank}</span>
              </span>
            </td>
            <td>
              <span className={`${styles.careerBadge} ${getCareerClass(p.careerPathType)}`}>
                {p.careerPathLabel}
              </span>
            </td>
            <td style={{ fontSize: 11 }}>
              {p.achievements.length > 0 ? p.achievements.join('・') : '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function OBPage() {
  const worldState = useWorldStore((s) => s.worldState);
  const getOBView = useWorldStore((s) => s.getOBView);

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  const view = getOBView();
  if (!view) return <div style={{ padding: 40 }}>読み込み中...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerTitle}>OB・卒業生一覧</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
            総卒業生：{view.totalGraduates}名
          </span>
        </div>
      </header>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.navLink}>ホーム</Link>
          <Link href="/team" className={styles.navLink}>チーム</Link>
          <Link href="/news" className={styles.navLink}>ニュース</Link>
          <Link href="/scout" className={styles.navLink}>スカウト</Link>
          <Link href="/tournament" className={styles.navLink}>大会</Link>
          <Link href="/results" className={styles.navLink}>試合結果</Link>
          <Link href="/ob" className={`${styles.navLink} ${styles.navLinkActive}`}>OB</Link>
        </div>
      </nav>
      <main className={styles.main}>
        <OBContent view={view} />
      </main>
    </div>
  );
}
