/**
 * scouting-narrative.ts — スカウティングレポート言葉化 (Phase 11.5-F)
 */

import type { Player } from '../../engine/types/player';
import type { EvaluatorRank } from '../../engine/types/evaluator';
import type { ScoutingEvaluation } from '../../engine/types/manager-staff';

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

// マネージャーランクから評価項目数と誤差率を返す
function getRankCapacity(rank: EvaluatorRank): { maxItems: number; errorRate: number } {
  const table: Record<EvaluatorRank, { maxItems: number; errorRate: number }> = {
    F: { maxItems: 1, errorRate: 0.40 },
    E: { maxItems: 2, errorRate: 0.30 },
    D: { maxItems: 3, errorRate: 0.20 },
    C: { maxItems: 4, errorRate: 0.15 },
    B: { maxItems: 5, errorRate: 0.10 },
    A: { maxItems: 6, errorRate: 0.05 },
    S: { maxItems: 7, errorRate: 0.02 },
    SS: { maxItems: 8, errorRate: 0.01 },
    SSS: { maxItems: 9, errorRate: 0.005 },
  };
  return table[rank] ?? table['C'];
}

interface EvalItem {
  label: string;
  accurateText: string;
  invertedText: string;
  priority: number;
}

function collectPitcherEvaluations(player: Player): EvalItem[] {
  const p = player.stats.pitching;
  if (!p) return [];
  const items: EvalItem[] = [];

  // 球速
  if (p.velocity >= 75) {
    items.push({ label: '球速', accurateText: '速球が脅威', invertedText: '球速は平凡', priority: 1 });
  } else if (p.velocity < 55) {
    items.push({ label: '球速', accurateText: '球速は遅め', invertedText: '速球に注意', priority: 2 });
  }

  // 制球
  if (p.control >= 70) {
    items.push({ label: '制球', accurateText: '制球が安定している', invertedText: '制球に不安がある', priority: 1 });
  } else if (p.control < 45) {
    items.push({ label: '制球', accurateText: '制球に不安がある', invertedText: '制球は安定している', priority: 2 });
  }

  // スタミナ
  if (p.pitchStamina < 45) {
    items.push({ label: 'スタミナ', accurateText: '後半スタミナ切れに注意', invertedText: 'スタミナは問題なし', priority: 2 });
  }

  // 変化球
  const maxBreak = Math.max(
    p.pitches?.slider ?? 0,
    p.pitches?.curve ?? 0,
    p.pitches?.changeup ?? 0,
    p.pitches?.fork ?? 0,
    p.pitches?.cutter ?? 0,
    p.pitches?.sinker ?? 0,
  );
  if (maxBreak >= 65) {
    items.push({ label: '変化球', accurateText: '切れのある変化球を持つ', invertedText: '変化球は大したことない', priority: 1 });
  } else if (maxBreak < 30) {
    items.push({ label: '変化球', accurateText: '変化球は少ない（直球主体）', invertedText: 'バラエティ豊かな変化球を持つ', priority: 3 });
  }

  return items;
}

function collectBatterEvaluations(player: Player): EvalItem[] {
  const bat = player.stats.batting;
  const base = player.stats.base;
  const items: EvalItem[] = [];

  // パワー
  if (bat.power >= 70) {
    items.push({ label: 'パワー', accurateText: 'パワーヒッター、長打に注意', invertedText: 'パワーは並み', priority: 1 });
  } else if (bat.power < 40) {
    items.push({ label: 'パワー', accurateText: '長打力は低め', invertedText: '長打に警戒が必要', priority: 2 });
  }

  // ミート
  if (bat.contact >= 70) {
    items.push({ label: 'ミート', accurateText: 'バットコントロールが優れている', invertedText: 'コンタクト率は平凡', priority: 1 });
  } else if (bat.contact < 40) {
    items.push({ label: 'ミート', accurateText: '三振を奪いやすい', invertedText: 'なかなかの当て感を持つ', priority: 2 });
  }

  // 走力
  if (base.speed >= 70) {
    items.push({ label: '走力', accurateText: '足が速い、走塁に注意', invertedText: '走力は目立たない', priority: 2 });
  }

  // 守備
  if (base.fielding >= 70) {
    items.push({ label: '守備', accurateText: '守備が堅い', invertedText: '守備に不安あり', priority: 3 });
  }

  return items;
}

export interface GeneratedScoutingReport {
  evaluations: ScoutingEvaluation[];
  informationDepth: 'shallow' | 'medium' | 'deep';
}

export function generatePlayerScoutingReport(
  player: Player,
  managerRank: EvaluatorRank,
  seed: string,
): GeneratedScoutingReport {
  const { maxItems, errorRate } = getRankCapacity(managerRank);
  const isPitcher = player.position === 'pitcher';

  // 評価項目を収集
  const items = isPitcher
    ? collectPitcherEvaluations(player)
    : collectBatterEvaluations(player);

  // 優先度順でソート
  items.sort((a, b) => a.priority - b.priority);

  // 上限に絞り込み
  const selected = items.slice(0, maxItems);

  // 誤差モデルで一部反転
  const evaluations: ScoutingEvaluation[] = selected.map((item, i) => {
    const hashVal = simpleHash(seed + item.label + i) / 0x7FFFFFFF;
    const isAccurate = hashVal > errorRate;
    return {
      label: item.label,
      text: isAccurate ? item.accurateText : item.invertedText,
      isAccurate,
    };
  });

  const depth: 'shallow' | 'medium' | 'deep' =
    maxItems <= 2 ? 'shallow' : maxItems <= 5 ? 'medium' : 'deep';

  return { evaluations, informationDepth: depth };
}

export function getRankLabel(rank: EvaluatorRank): string {
  const labels: Record<EvaluatorRank, string> = {
    SSS: '伝説級',
    SS: '超一流',
    S: 'プロ並み',
    A: '高精度',
    B: '信頼できる',
    C: '標準的',
    D: 'おぼろげ',
    E: '運次第',
    F: 'ほぼ参考外',
  };
  return labels[rank] ?? '不明';
}

export function getDepthLabel(depth: 'shallow' | 'medium' | 'deep'): string {
  const labels = { shallow: '概略', medium: '標準', deep: '詳細' };
  return labels[depth];
}
