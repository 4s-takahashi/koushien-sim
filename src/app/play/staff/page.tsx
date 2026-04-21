'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useWorldStore } from '../../../stores/world-store';
import type { ManagerRole } from '../../../engine/types/manager-staff';
import type { EvaluatorRank } from '../../../engine/types/evaluator';

// ============================================================
// ヘルパー
// ============================================================

const ROLE_LABELS: Record<ManagerRole, string> = {
  scout: '🔍 スカウト',
  mental: '💬 メンタルコーチ',
  analytics: '📊 アナリスト',
  pr: '📣 広報',
};

const ROLE_DESCRIPTIONS: Record<ManagerRole, string> = {
  scout: '他校選手の分析精度が上がる',
  mental: '選手のモチベーション回復を助ける',
  analytics: '練習効率と戦術分析を強化する',
  pr: 'スカウト範囲と評判向上を支援する',
};

const RANK_COLORS: Record<EvaluatorRank, string> = {
  SSS: '#f5c518',
  SS: '#f5c518',
  S: '#f5c518',
  A: '#4caf50',
  B: '#2196f3',
  C: '#9e9e9e',
  D: '#9e9e9e',
  E: '#9e9e9e',
  F: '#9e9e9e',
};

const RANK_ORDER: EvaluatorRank[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

function getRankNextLabel(rank: EvaluatorRank): string {
  const idx = RANK_ORDER.indexOf(rank);
  if (idx < 0 || idx >= RANK_ORDER.length - 1) return '最大ランク';
  return `次: ${RANK_ORDER[idx + 1]}`;
}

function ExpBar({ exp, max = 100 }: { exp: number; max?: number }) {
  const pct = Math.min(100, (exp / max) * 100);
  return (
    <div style={{
      height: 6,
      background: 'rgba(255,255,255,0.1)',
      borderRadius: 3,
      overflow: 'hidden',
      width: '100%',
    }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: 'var(--color-accent)',
        borderRadius: 3,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

// ============================================================
// コンポーネント
// ============================================================

export default function StaffPage() {
  const worldState = useWorldStore((s) => s.worldState);
  const initDefaultManagerStaff = useWorldStore((s) => s.initDefaultManagerStaff);
  const hireManager = useWorldStore((s) => s.hireManager);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<ManagerRole>('scout');

  if (!worldState) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>ゲームが開始されていません。</p>
        <Link href="/play" style={{ color: 'var(--color-primary)' }}>ホームへ戻る</Link>
      </div>
    );
  }

  // staffが未初期化なら自動初期化
  if (!worldState.managerStaff) {
    initDefaultManagerStaff();
  }

  const staff = worldState.managerStaff;
  const playerSchool = worldState.schools.find((s) => s.id === worldState.playerSchoolId);
  const reputation = playerSchool?.reputation ?? 50;

  const reputationLabel =
    reputation >= 80 ? '名門'
    : reputation >= 65 ? '強豪'
    : reputation >= 50 ? '中堅'
    : reputation >= 35 ? '新興'
    : '弱小';

  function handleHire() {
    const result = hireManager(selectedRole);
    setMessage(result.message);
    setTimeout(() => setMessage(null), 3000);
  }

  const members = staff?.members ?? [];
  const maxMembers = staff?.maxMembers ?? 1;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* サブヘッダー */}
      <header style={{
        background: 'linear-gradient(180deg, rgba(46,125,50,0.06), transparent)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        padding: '8px 12px',
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          width: '100%',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#2e7d32' }}>
            スタッフ管理
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>
            {playerSchool?.name} — {reputationLabel}
          </span>
        </div>
      </header>

      {/* ナビゲーション */}
      <nav style={{ background: 'var(--color-accent)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex' }}>
          {[
            { href: '/play', label: 'ホーム' },
            { href: '/play/team', label: 'チーム' },
            { href: '/play/news', label: 'ニュース' },
            { href: '/play/scout', label: 'スカウト' },
            { href: '/play/tournament', label: '大会' },
            { href: '/play/results', label: '試合結果' },
            { href: '/play/ob', label: 'OB' },
            { href: '/play/staff', label: 'スタッフ' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: item.href === '/play/staff' ? '#fff' : 'rgba(255,255,255,0.85)',
                padding: '9px 18px',
                fontSize: 13,
                display: 'inline-block',
                textDecoration: 'none',
                background: item.href === '/play/staff' ? 'rgba(255,255,255,0.18)' : undefined,
                fontWeight: item.href === '/play/staff' ? 'bold' : undefined,
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '16px 12px' }}>

        {/* フラッシュメッセージ */}
        {message && (
          <div style={{
            marginBottom: 12,
            padding: '8px 14px',
            background: 'rgba(46,125,50,0.15)',
            border: '1px solid rgba(46,125,50,0.3)',
            borderRadius: 6,
            fontSize: 13,
            color: '#2e7d32',
          }}>
            {message}
          </div>
        )}

        {/* スタッフ概要 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text)' }}>
            マネージャー一覧
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 12 }}>
            雇用中: <strong style={{ color: 'var(--color-text)' }}>{members.length}</strong> / {maxMembers}人
            <span style={{ marginLeft: 12 }}>
              （{reputationLabel}校 — 最大{maxMembers}人まで雇用可）
            </span>
          </div>

          {members.length === 0 ? (
            <p style={{ color: 'var(--color-text-sub)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>
              まだマネージャーがいません。「新規採用」から採用してください。
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members.map((m) => (
                <div key={m.id} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
                      {m.lastName}{m.firstName}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                      {m.grade}年生
                    </span>
                    <span style={{
                      fontSize: 11,
                      padding: '1px 8px',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      color: 'var(--color-text-sub)',
                    }}>
                      {ROLE_LABELS[m.role]}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 16,
                      fontWeight: 700,
                      color: RANK_COLORS[m.rank] ?? '#9e9e9e',
                    }}>
                      {m.rank}
                    </span>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: 'var(--color-text-sub)',
                      marginBottom: 3,
                    }}>
                      <span>経験値 {m.exp} / 100</span>
                      <span>{getRankNextLabel(m.rank)}</span>
                    </div>
                    <ExpBar exp={m.exp} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                    Lv.{m.level} — {ROLE_DESCRIPTIONS[m.role]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新規採用 */}
        {members.length < maxMembers ? (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--color-text)' }}>
              新規マネージャー採用
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 6 }}>役割を選択</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(Object.keys(ROLE_LABELS) as ManagerRole[]).map((role) => (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: selectedRole === role
                        ? '2px solid var(--color-accent)'
                        : '1px solid rgba(255,255,255,0.15)',
                      background: selectedRole === role
                        ? 'rgba(46,125,50,0.2)'
                        : 'rgba(255,255,255,0.04)',
                      color: selectedRole === role ? 'var(--color-accent)' : 'var(--color-text)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
              {selectedRole && (
                <p style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 6 }}>
                  {ROLE_DESCRIPTIONS[selectedRole]}
                </p>
              )}
            </div>
            <button
              onClick={handleHire}
              style={{
                padding: '8px 20px',
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              採用する
            </button>
          </div>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: '14px 16px',
            textAlign: 'center',
          }}>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 13, margin: 0 }}>
              雇用上限に達しています（{maxMembers}人）。<br />
              <span style={{ fontSize: 12 }}>評判を上げることで雇用枠が増えます。</span>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
