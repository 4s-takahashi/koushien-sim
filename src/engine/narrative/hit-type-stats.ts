/**
 * src/engine/narrative/hit-type-stats.ts — 21種打球分類統計集計
 *
 * Phase R6-1: 試合成績集計テーブルへの21種統計追加。
 *
 * 設計方針:
 * - 既存 MatchBatterStat / MatchPitcherStat は変更しない（後方互換）
 * - 21種分布の集計は新しい型 DetailedHitStats / MatchHitTypeStats で管理
 * - AtBatResult[] から導出する純粋集計関数
 */

import type { DetailedHitType } from '../physics/types';
import { DETAILED_HIT_TYPE_LABEL, DETAILED_HIT_TYPE_SHORT, DETAILED_HIT_TYPE_CATEGORY } from './types';

// ============================================================
// 21種統計型
// ============================================================

/**
 * 21種打球分類の出現カウント
 * DetailedHitType ごとの出現回数を記録する。
 */
export type DetailedHitCounts = Readonly<Record<DetailedHitType, number>>;

/**
 * 空の21種カウントオブジェクト
 */
export function emptyDetailedHitCounts(): Record<DetailedHitType, number> {
  return {
    first_line_grounder:   0,
    right_side_grounder:   0,
    left_side_grounder:    0,
    third_line_grounder:   0,
    comebacker:            0,
    infield_liner:         0,
    high_infield_fly:      0,
    over_infield_hit:      0,
    right_gap_hit:         0,
    up_the_middle_hit:     0,
    left_gap_hit:          0,
    shallow_fly:           0,
    medium_fly:            0,
    deep_fly:              0,
    line_drive_hit:        0,
    wall_ball:             0,
    line_drive_hr:         0,
    high_arc_hr:           0,
    fence_close_call:      0,
    foul_fly:              0,
    check_swing_dribbler:  0,
  };
}

/**
 * 打者の21種打球統計（試合単位）
 */
export interface BatterHitTypeStats {
  readonly playerId: string;
  /** 21種ごとの出現カウント */
  readonly hitTypeCounts: DetailedHitCounts;
  /** 総打球数（ファウル含む） */
  readonly totalBattedBalls: number;
  /** 引っ張り打球率（right_side/right_gap/line_drive_hr系） */
  readonly pullRatio: number;
  /** センター返し率 */
  readonly centerRatio: number;
  /** 流し打ち率 */
  readonly oppositeRatio: number;
  /** 強打球率（exit velocity相当; wall_ball/line_drive系） */
  readonly hardHitRatio: number;
}

/**
 * 試合全体の21種統計（チーム別集計）
 */
export interface MatchHitTypeStats {
  readonly byBatter: ReadonlyArray<BatterHitTypeStats>;
  /** チーム合計 */
  readonly teamTotals: DetailedHitCounts;
  /** 全打球数 */
  readonly totalBattedBalls: number;
  /** カテゴリ別出現数 */
  readonly majorTypeTotal: number;
  readonly mediumTypeTotal: number;
  readonly rareTypeTotal: number;
}

// ============================================================
// 21種統計の集計（AtBatResult ベース）
// ============================================================

/**
 * AtBatResult の形式（21種情報を含む拡張版）
 * 既存 AtBatResult に detailedHitType を追加したユニオン型
 */
export interface AtBatResultWithHitType {
  readonly batterId: string;
  readonly detailedHitType?: DetailedHitType;
  /** R8-3: ファウル球の detailedHitType (foul_fly) 追跡用 */
  readonly pitches?: ReadonlyArray<{ outcome: string; detailedHitType?: DetailedHitType }>;
}

/**
 * AtBatResult[] から21種統計を集計する
 *
 * @param atBatResults - detailedHitType を含む打席結果配列
 * @param allBatterIds - 集計対象の打者 ID 一覧
 * @returns MatchHitTypeStats
 */
export function collectHitTypeStats(
  atBatResults: ReadonlyArray<AtBatResultWithHitType>,
  allBatterIds: string[],
): MatchHitTypeStats {
  const batterMap = new Map<string, Record<DetailedHitType, number>>();

  // 全打者を初期化
  for (const pid of allBatterIds) {
    batterMap.set(pid, emptyDetailedHitCounts());
  }

  // 21種カウント集計
  for (const ab of atBatResults) {
    const counts = batterMap.get(ab.batterId);
    if (!counts) continue;

    // インプレー打球の21種
    if (ab.detailedHitType) {
      counts[ab.detailedHitType]++;
    }

    // R8-3: ファウル球の foul_fly 集計（pitches 配列から）
    // foul_fly は process-pitch.ts でファウル球に対して設定される
    if (ab.pitches) {
      for (const pitch of ab.pitches) {
        if (
          pitch.outcome === 'foul' &&
          pitch.detailedHitType === 'foul_fly'
        ) {
          counts['foul_fly']++;
        }
      }
    }
  }

  // チーム合計
  const teamTotals = emptyDetailedHitCounts();
  for (const counts of batterMap.values()) {
    for (const [k, v] of Object.entries(counts) as Array<[DetailedHitType, number]>) {
      teamTotals[k] += v;
    }
  }

  // 打者別統計の計算
  const byBatter: BatterHitTypeStats[] = [];
  for (const [pid, counts] of batterMap) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) continue;

    const pullCount = (counts.right_side_grounder ?? 0) + (counts.right_gap_hit ?? 0)
      + (counts.line_drive_hr ?? 0) + (counts.first_line_grounder ?? 0);
    const centerCount = (counts.up_the_middle_hit ?? 0) + (counts.comebacker ?? 0)
      + (counts.high_arc_hr ?? 0) + (counts.medium_fly ?? 0);
    const oppositeCount = (counts.left_side_grounder ?? 0) + (counts.left_gap_hit ?? 0)
      + (counts.third_line_grounder ?? 0) + (counts.deep_fly ?? 0);
    const hardHitCount = (counts.wall_ball ?? 0) + (counts.line_drive_hit ?? 0)
      + (counts.infield_liner ?? 0) + (counts.line_drive_hr ?? 0) + (counts.high_arc_hr ?? 0);

    byBatter.push({
      playerId: pid,
      hitTypeCounts: { ...counts } as DetailedHitCounts,
      totalBattedBalls: total,
      pullRatio: total > 0 ? pullCount / total : 0,
      centerRatio: total > 0 ? centerCount / total : 0,
      oppositeRatio: total > 0 ? oppositeCount / total : 0,
      hardHitRatio: total > 0 ? hardHitCount / total : 0,
    });
  }

  const totalBattedBalls = Object.values(teamTotals).reduce((a, b) => a + b, 0);

  // カテゴリ別合計
  let majorTotal = 0;
  let mediumTotal = 0;
  let rareTotal = 0;
  for (const [k, v] of Object.entries(teamTotals) as Array<[DetailedHitType, number]>) {
    const cat = DETAILED_HIT_TYPE_CATEGORY[k];
    if (cat === 'major') majorTotal += v;
    else if (cat === 'medium') mediumTotal += v;
    else if (cat === 'rare') rareTotal += v;
  }

  return {
    byBatter,
    teamTotals: { ...teamTotals } as DetailedHitCounts,
    totalBattedBalls,
    majorTypeTotal: majorTotal,
    mediumTypeTotal: mediumTotal,
    rareTypeTotal: rareTotal,
  };
}

// ============================================================
// 21種統計の表示フォーマット
// ============================================================

/**
 * 21種統計をテキスト形式にフォーマットする（ログ・デバッグ用）
 *
 * @param stats - MatchHitTypeStats
 * @returns フォーマット済みテキスト
 */
export function formatHitTypeStats(stats: MatchHitTypeStats): string {
  const lines: string[] = [
    '=== 打球分類統計（21種） ===',
    `総打球数: ${stats.totalBattedBalls}`,
    `主要分類: ${stats.majorTypeTotal} / 中頻度: ${stats.mediumTypeTotal} / 希少: ${stats.rareTypeTotal}`,
    '',
    '--- チーム合計 ---',
  ];

  // 出現回数が0以外の分類のみ表示
  for (const [k, v] of Object.entries(stats.teamTotals) as Array<[DetailedHitType, number]>) {
    if (v > 0) {
      const label = DETAILED_HIT_TYPE_LABEL[k];
      const short = DETAILED_HIT_TYPE_SHORT[k];
      const cat = DETAILED_HIT_TYPE_CATEGORY[k];
      lines.push(`  [${short}] ${label}: ${v}回 (${cat})`);
    }
  }

  return lines.join('\n');
}

/**
 * 出現した21種の一覧を取得する
 * §8.3.A の存在確認テストで使用する。
 *
 * @param counts - DetailedHitCounts
 * @returns 1回以上出現した DetailedHitType の配列
 */
export function getAppearedHitTypes(counts: DetailedHitCounts): DetailedHitType[] {
  return (Object.entries(counts) as Array<[DetailedHitType, number]>)
    .filter(([, v]) => v > 0)
    .map(([k]) => k);
}

/**
 * 全21種が出現しているか確認する（§8.3.A）
 *
 * @param counts - DetailedHitCounts
 * @returns 全21種出現済みなら true
 */
export function areAll21TypesPresent(counts: DetailedHitCounts): boolean {
  return (Object.values(counts) as number[]).every(v => v > 0);
}

/**
 * 主要8種がすべて出現しているか確認する（§8.3.C）
 *
 * 主要8種: right_side_grounder, left_side_grounder, right_gap_hit,
 *         up_the_middle_hit, left_gap_hit, shallow_fly, medium_fly, deep_fly
 *
 * @param counts - DetailedHitCounts
 * @returns 主要8種すべて出現済みなら true
 */
export function areMajor8TypesPresent(counts: DetailedHitCounts): boolean {
  const MAJOR_8: DetailedHitType[] = [
    'right_side_grounder',
    'left_side_grounder',
    'right_gap_hit',
    'up_the_middle_hit',
    'left_gap_hit',
    'shallow_fly',
    'medium_fly',
    'deep_fly',
  ];
  return MAJOR_8.every(t => counts[t] > 0);
}
