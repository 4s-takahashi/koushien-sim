/**
 * analyst.ts — アナリストマネージャーによる相手投手分析エンジン
 *
 * Phase 12-K: イニング切れ目ごとに投球ログを集計し、
 * マネージャーレベルに応じた精度でコメントを生成する。
 *
 * レベル高: 統計的に有意な傾向を正確に指摘
 * レベル低: 偶然の揺らぎを傾向として誤認し、ノイズが混じる
 */

import type { PitchLogEntry } from '../../ui/projectors/view-state-types';
import type { Manager } from '../types/manager-staff';

// ============================================================
// 型定義
// ============================================================

export interface AnalystComment {
  id: string;
  at: number; // timestamp
  /** コメントを表示するイニング番号 */
  inning: number;
  /** イニングの表/裏終了後 */
  half: 'top' | 'bottom';
  /** マネージャー名（苗字） */
  analystName: string;
  /** コメント本文 */
  text: string;
  /** 分析の種類 */
  kind: 'insufficient' | 'pitch_tendency' | 'location_tendency' | 'count_tendency' | 'runner_tendency' | 'noise';
  /** マネージャーレベル */
  analystLevel: number;
}

/** 球種別カウント */
interface PitchTypeDistribution {
  [pitchType: string]: number;
}

/** コース別カウント（9ゾーン） */
interface LocationDistribution {
  /** inside_high | inside_middle | ... */
  [zone: string]: number;
}

/** カウント別球種傾向 */
interface CountTendency {
  pitchType: string;
  count: number;
  total: number;
}

// ============================================================
// 定数
// ============================================================

/** レベル別ノイズ係数（レベル1=最大ノイズ, レベル5=ほぼ正確） */
const NOISE_BY_LEVEL: Record<number, number> = {
  1: 0.6,
  2: 0.4,
  3: 0.25,
  4: 0.12,
  5: 0.05,
};

/** 最小サンプル数（このイニング終了時点で分析できるか） */
const MIN_PITCHES_FOR_ANALYSIS = 6;

/** コメントを本格化する回数 */
const FULL_ANALYSIS_INNING = 2;

// ============================================================
// ヘルパー: 投球ログをイニング・前半/後半でフィルタ
// ============================================================

/**
 * 特定のイニング終了時点（1〜inning回の表/裏）までの
 * 相手投手（pitchLog全体、全て相手が投手）の投球を集計用に返す。
 * pitchLog には自チームが打席に立ったときの投球が記録されている。
 */
function getPitchesUpToInning(
  pitchLog: PitchLogEntry[],
  throughInning: number,
  throughHalf: 'top' | 'bottom',
): PitchLogEntry[] {
  return pitchLog.filter((entry) => {
    if (entry.inning < throughInning) return true;
    if (entry.inning === throughInning) {
      if (throughHalf === 'bottom') return true; // bottomまでなら表も裏も
      return entry.half === 'top'; // topまでなら表だけ
    }
    return false;
  });
}

// ============================================================
// 分析ロジック
// ============================================================

/** 球種分布を計算する（ノイズ付き） */
function computePitchTypeDistribution(
  pitches: PitchLogEntry[],
  noiseLevel: number,
  rng: () => number,
): PitchTypeDistribution {
  const raw: PitchTypeDistribution = {};
  for (const p of pitches) {
    const type = p.pitchTypeLabel ?? p.pitchType ?? 'fastball';
    raw[type] = (raw[type] ?? 0) + 1;
  }

  // ノイズ: 各カウントにランダム偏差を加算
  if (noiseLevel > 0) {
    const noised: PitchTypeDistribution = {};
    for (const [type, count] of Object.entries(raw)) {
      const noise = (rng() - 0.5) * 2 * noiseLevel * count;
      noised[type] = Math.max(0, count + noise);
    }
    return noised;
  }
  return raw;
}

/** コース分布を計算する（ノイズ付き） */
function computeLocationDistribution(
  pitches: PitchLogEntry[],
  noiseLevel: number,
  rng: () => number,
): LocationDistribution {
  const raw: LocationDistribution = {};
  for (const p of pitches) {
    const zone = p.pitchLocation ?? 'middle_middle';
    raw[zone] = (raw[zone] ?? 0) + 1;
  }

  if (noiseLevel > 0) {
    const noised: LocationDistribution = {};
    for (const [zone, count] of Object.entries(raw)) {
      const noise = (rng() - 0.5) * 2 * noiseLevel * count;
      noised[zone] = Math.max(0, count + noise);
    }
    return noised;
  }
  return raw;
}

/** カウント2-0での球種傾向（ストレート傾向など）を分析 */
function computeCountTendency(
  pitches: PitchLogEntry[],
  _noiseLevel: number,
): CountTendency | null {
  // 2ストライク時のスライダー率など、カウント別配球傾向
  // 簡易実装: 2ストライク時の球種傾向
  const twoStrikePitches: PitchTypeDistribution = {};
  let twoStrikeTotal = 0;

  // PitchLogEntryにはカウント情報が直接ないため、outcomeから推定
  // 2ストライクから: 前2球がstrikeだった投球の次を見る
  for (let i = 2; i < pitches.length; i++) {
    const prev1 = pitches[i - 1];
    const prev2 = pitches[i - 2];
    const isStrike = (o: string) =>
      o === 'called_strike' || o === 'swinging_strike' || o === 'foul' || o === 'foul_bunt';
    if (isStrike(prev1.outcome) && isStrike(prev2.outcome)) {
      const type = pitches[i].pitchTypeLabel ?? pitches[i].pitchType ?? 'fastball';
      twoStrikePitches[type] = (twoStrikePitches[type] ?? 0) + 1;
      twoStrikeTotal++;
    }
  }

  if (twoStrikeTotal < 3) return null;

  // 最頻球種
  let maxType = '';
  let maxCount = 0;
  for (const [type, count] of Object.entries(twoStrikePitches)) {
    if (count > maxCount) {
      maxCount = count;
      maxType = type;
    }
  }
  if (!maxType) return null;
  return { pitchType: maxType, count: maxCount, total: twoStrikeTotal };
}

/** ランナー時の傾向を分析 */
function computeRunnerTendency(
  pitches: PitchLogEntry[],
  _noiseLevel: number,
): { withRunner: PitchTypeDistribution; noRunner: PitchTypeDistribution } {
  const withRunner: PitchTypeDistribution = {};
  const noRunner: PitchTypeDistribution = {};

  // outcomeから推定: 四球=ランナーあり、アウト=ランナーなし（簡略化）
  // より正確にはイニング状態から判断するが、PitchLogEntryにランナー情報はないため
  // 偶数投球インデックスを「ランナーあり」として簡易近似
  pitches.forEach((p, idx) => {
    const type = p.pitchTypeLabel ?? p.pitchType ?? 'fastball';
    if (idx % 3 === 0) {
      withRunner[type] = (withRunner[type] ?? 0) + 1;
    } else {
      noRunner[type] = (noRunner[type] ?? 0) + 1;
    }
  });
  return { withRunner, noRunner };
}

// ============================================================
// 球種ラベル日本語変換
// ============================================================

const PITCH_TYPE_JA: Record<string, string> = {
  fastball: 'ストレート',
  slider: 'スライダー',
  curveball: 'カーブ',
  changeup: 'チェンジアップ',
  splitter: 'スプリット',
};

function pitchTypeJa(type: string): string {
  return PITCH_TYPE_JA[type] ?? type;
}

/** コースゾーンの日本語表現 */
function zoneJa(zone: string): string {
  const map: Record<string, string> = {
    inside_high: '内角高め',
    inside_middle: '内角',
    inside_low: '内角低め',
    middle_high: '高め',
    middle_middle: 'ど真ん中',
    middle_low: '低め',
    outside_high: '外角高め',
    outside_middle: '外角',
    outside_low: '外角低め',
  };
  return map[zone] ?? zone;
}

// ============================================================
// コメント生成
// ============================================================

/**
 * 分布から最頻値と割合を計算
 */
function topEntry(dist: Record<string, number>): { key: string; ratio: number } | null {
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let maxKey = '';
  let maxVal = 0;
  for (const [k, v] of Object.entries(dist)) {
    if (v > maxVal) {
      maxVal = v;
      maxKey = k;
    }
  }
  return { key: maxKey, ratio: maxVal / total };
}

/**
 * シンプルな擬似乱数（ノイズ用、テスト再現性確保のためシード付き）
 */
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

/**
 * アナリストコメントを生成する
 *
 * @param pitchLog 現時点までの投球ログ
 * @param analyst analyticsロールのマネージャー（null=アナリスト不在）
 * @param inning コメントを生成するイニング番号
 * @param half 表/裏終了後
 * @returns コメント（アナリスト不在の場合はnull）
 */
export function generateAnalystComment(
  pitchLog: PitchLogEntry[],
  analyst: Manager | null,
  inning: number,
  half: 'top' | 'bottom',
): AnalystComment | null {
  if (!analyst) return null;

  const analystName = analyst.lastName ?? '分析担当';
  const level = Math.max(1, Math.min(5, Math.round(analyst.level / 20))); // 1-100 → 1-5スケール
  const noiseLevel = NOISE_BY_LEVEL[level] ?? 0.3;

  const relevantPitches = getPitchesUpToInning(pitchLog, inning, half);

  // サンプル不足の場合
  if (relevantPitches.length < MIN_PITCHES_FOR_ANALYSIS) {
    return {
      id: `analyst-${inning}-${half}-${Date.now()}`,
      at: Date.now(),
      inning,
      half,
      analystName,
      text: 'まだサンプルが少なくて読み切れません…。もう少し投球を見てみましょう。',
      kind: 'insufficient',
      analystLevel: level,
    };
  }

  // 1回終了直後（サンプル少）
  if (inning === 1) {
    const rng = makeRng(relevantPitches.length * 31 + inning * 7);
    const pitchDist = computePitchTypeDistribution(relevantPitches, noiseLevel, rng);
    const top = topEntry(pitchDist);
    if (!top) {
      return {
        id: `analyst-${inning}-${half}-${Date.now()}`,
        at: Date.now(),
        inning,
        half,
        analystName,
        text: '1回が終わりましたが、まだ傾向を掴み切れていません。もう少し見ていきます。',
        kind: 'insufficient',
        analystLevel: level,
      };
    }
    const pct = Math.round(top.ratio * 100);
    return {
      id: `analyst-${inning}-${half}-${Date.now()}`,
      at: Date.now(),
      inning,
      half,
      analystName,
      text: `1回の様子では${pitchTypeJa(top.key)}が多めでした（${pct}%程度）。まだ判断は早いですが、頭に入れておきましょう。`,
      kind: 'pitch_tendency',
      analystLevel: level,
    };
  }

  // 2回以降: 本格分析
  const rng = makeRng(relevantPitches.length * 31 + inning * 7 + (half === 'bottom' ? 3 : 0));

  // どの分析を行うかをランダムに決定（レベルが高いほど正確な分析を優先）
  const analysisRoll = rng();

  // レベル低（1-2）: 30%の確率でノイズコメント
  if (level <= 2 && analysisRoll < 0.3) {
    const noiseComments = [
      '投手は外角のスライダーを多用しているような気がします…でも、自信はあまりないです。',
      '低めに集める傾向があるかもしれませんが、まだはっきりとは言えません。',
      '2ストライクからのストレートが少ない気がするんですが…統計の見方が難しくて。',
    ];
    const idx = Math.floor(rng() * noiseComments.length);
    return {
      id: `analyst-${inning}-${half}-${Date.now()}`,
      at: Date.now(),
      inning,
      half,
      analystName,
      text: noiseComments[idx],
      kind: 'noise',
      analystLevel: level,
    };
  }

  // 球種傾向分析（50%）
  if (analysisRoll < 0.5 || inning < FULL_ANALYSIS_INNING + 1) {
    const pitchDist = computePitchTypeDistribution(relevantPitches, noiseLevel, rng);
    const top = topEntry(pitchDist);
    if (!top || top.ratio < 0.3) {
      return {
        id: `analyst-${inning}-${half}-${Date.now()}`,
        at: Date.now(),
        inning,
        half,
        analystName,
        text: `${inning}回終了時点では球種の偏りは特に見当たりません。バランスよく投げ分けている印象です。`,
        kind: 'pitch_tendency',
        analystLevel: level,
      };
    }
    const pct = Math.round(top.ratio * 100);
    const levelComment = level >= 4
      ? `統計的に有意な傾向として`
      : level >= 3
      ? `データ上`
      : `感覚的には`;
    return {
      id: `analyst-${inning}-${half}-${Date.now()}`,
      at: Date.now(),
      inning,
      half,
      analystName,
      text: `${levelComment}、${pitchTypeJa(top.key)}が多めです（${pct}%程度）。次の打席も${pitchTypeJa(top.key)}を頭に入れておきましょう。`,
      kind: 'pitch_tendency',
      analystLevel: level,
    };
  }

  // コース傾向分析（25%）
  if (analysisRoll < 0.75) {
    const locDist = computeLocationDistribution(relevantPitches, noiseLevel, rng);
    const top = topEntry(locDist);
    if (!top || top.ratio < 0.25) {
      return {
        id: `analyst-${inning}-${half}-${Date.now()}`,
        at: Date.now(),
        inning,
        half,
        analystName,
        text: `${inning}回終了時点ではコースの偏りは見られません。まんべんなく投げてきます。`,
        kind: 'location_tendency',
        analystLevel: level,
      };
    }
    const pct = Math.round(top.ratio * 100);
    return {
      id: `analyst-${inning}-${half}-${Date.now()}`,
      at: Date.now(),
      inning,
      half,
      analystName,
      text: `${zoneJa(top.key)}への配球が${pct}%程度あります。そのコースへの対応を意識しましょう。`,
      kind: 'location_tendency',
      analystLevel: level,
    };
  }

  // カウント傾向分析（残り25%）
  const countTend = computeCountTendency(relevantPitches, noiseLevel);
  if (!countTend) {
    // ランナー傾向分析へフォールバック
    const { withRunner } = computeRunnerTendency(relevantPitches, noiseLevel);
    const topRunner = topEntry(withRunner);
    if (topRunner && topRunner.ratio > 0.45) {
      return {
        id: `analyst-${inning}-${half}-${Date.now()}`,
        at: Date.now(),
        inning,
        half,
        analystName,
        text: `ランナーがいる場面では${pitchTypeJa(topRunner.key)}を多投する傾向があります（${Math.round(topRunner.ratio * 100)}%）。揺さぶりに注意しましょう。`,
        kind: 'runner_tendency',
        analystLevel: level,
      };
    }
    return {
      id: `analyst-${inning}-${half}-${Date.now()}`,
      at: Date.now(),
      inning,
      half,
      analystName,
      text: `特定のカウントでの際立った傾向はまだ見えていません。${inning}回の全投球をしっかりスコアブックに記録しました。`,
      kind: 'count_tendency',
      analystLevel: level,
    };
  }

  const pct = Math.round((countTend.count / countTend.total) * 100);
  return {
    id: `analyst-${inning}-${half}-${Date.now()}`,
    at: Date.now(),
    inning,
    half,
    analystName,
    text: `2ストライク後の決め球は${pitchTypeJa(countTend.pitchType)}が多いです（${pct}%、${countTend.count}/${countTend.total}球）。追い込まれたら要注意です。`,
    kind: 'count_tendency',
    analystLevel: level,
  };
}

/**
 * pitchLog からアナリストを使って指定イニング終了後のコメントを生成する。
 * マネージャースタッフの中から analytics ロールのマネージャーを探す。
 *
 * @param pitchLog 現在の投球ログ
 * @param managers マネージャー一覧
 * @param inning イニング番号
 * @param half 終了したイニングの表/裏
 */
export function generateAnalystCommentFromManagers(
  pitchLog: PitchLogEntry[],
  managers: Manager[],
  inning: number,
  half: 'top' | 'bottom',
): AnalystComment | null {
  // analytics ロールのマネージャーを探す（最高レベルを優先）
  const analysts = managers.filter((m) => m.role === 'analytics');
  if (analysts.length === 0) return null;

  // レベル最高のマネージャーを選択
  const best = analysts.reduce((a, b) => (a.level >= b.level ? a : b));
  return generateAnalystComment(pitchLog, best, inning, half);
}
