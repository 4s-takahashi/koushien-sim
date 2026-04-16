/**
 * draft-system — ドラフト・進路分岐システム
 *
 * 3年生の引退時に:
 * 1. ドラフト候補を識別する
 * 2. ドラフトを実行し、各選手のプロ入り可否を決める
 * 3. プロ以外の選手に大学/社会人/引退の進路を決定する
 */

import type { RNG } from '../../core/rng';
import type { Player } from '../../types/player';
import type { WorldState, HighSchool } from '../world-state';
import type { CareerPath } from '../person-state';

// ============================================================
// 型定義
// ============================================================

export interface DraftCandidate {
  playerId: string;
  playerName: string;
  schoolId: string;
  schoolName: string;
  position: string;
  overallRating: number;
  scoutRating: 'S' | 'A' | 'B' | 'C' | 'D';
  highlights: string[];
}

export interface DraftResult {
  playerId: string;
  picked: boolean;
  team: string | null;
  round: number | null;
  negotiationSuccess: boolean;
}

// ============================================================
// 定数
// ============================================================

const PRO_TEAMS = [
  '読売巨人軍', '阪神タイガース', '横浜DeNAベイスターズ',
  '広島東洋カープ', '中日ドラゴンズ', '東京ヤクルトスワローズ',
  '北海道日本ハムファイターズ', 'オリックスバファローズ',
  '福岡ソフトバンクホークス', '東北楽天ゴールデンイーグルス',
  '千葉ロッテマリーンズ', '埼玉西武ライオンズ',
];

const UNIVERSITIES = [
  '慶應義塾大学', '早稲田大学', '明治大学', '法政大学',
  '青山学院大学', '立命館大学', '同志社大学', '関西大学',
  '東海大学', '亜細亜大学', '国際武道大学', '日本体育大学',
];

const CORPORATE_TEAMS = [
  'トヨタ自動車', '日本生命', '三菱重工', 'JR東日本',
  'Honda', 'パナソニック', 'NTT東日本', '日立製作所',
  'ENEOS', '東芝', 'JFE東日本', '三菱日立パワーシステムズ',
];

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * 選手の総合力を計算（0-100）。
 */
export function computePlayerOverall(player: Player): number {
  const b = player.stats.base;
  const bat = player.stats.batting;
  const baseAvg = (b.stamina + b.speed + b.armStrength + b.fielding + b.focus + b.mental) / 6;
  const batAvg  = (bat.contact + bat.power + bat.eye + bat.technique) / 4;
  return Math.round(baseAvg * 0.5 + batAvg * 0.5);
}

/**
 * 総合力からスカウトティアを返す。
 * ゲーム序盤（選手の平均overall 30〜40）でも適切に機能するよう閾値を調整。
 */
function overallToScoutRating(overall: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (overall >= 60) return 'S';
  if (overall >= 45) return 'A';
  if (overall >= 30) return 'B';
  if (overall >= 15) return 'C';
  return 'D';
}

/**
 * 選手のハイライトを生成する（文字列のリスト）。
 */
function generateHighlights(player: Player, school: HighSchool): string[] {
  const highlights: string[] = [];
  const b = player.stats.base;
  const bat = player.stats.batting;

  if (bat.contact >= 80) highlights.push(`打率4割超え候補`);
  if (bat.power >= 80)   highlights.push(`本塁打30本ペース`);
  if (b.speed >= 80)     highlights.push(`俊足トップクラス`);
  if (b.armStrength >= 80) highlights.push(`強肩外野手`);

  if (player.stats.pitching) {
    const p = player.stats.pitching;
    if (p.velocity >= 80) highlights.push(`最速${Math.round(135 + p.velocity * 0.15)}km/h`);
    if (p.control >= 80)  highlights.push(`制球力に優れた本格派`);
  }

  if (school.yearResults?.koshienAppearance) {
    highlights.push(`甲子園出場経験`);
  }
  if (school.yearResults?.summerBestRound >= 3) {
    highlights.push(`県大会ベスト8以上`);
  }

  return highlights.slice(0, 3); // 最大3件
}

// ============================================================
// 公開 API
// ============================================================

/**
 * ドラフト候補を識別する。
 * 全高校の3年生から overall > 30（B 下位以上）の選手をリストアップ。
 * 閾値を下げることで、成長途上のゲーム初期でもドラフト候補が出るようにする。
 */
export function identifyDraftCandidates(
  world: WorldState,
  currentYear: number,
): DraftCandidate[] {
  const candidates: DraftCandidate[] = [];

  for (const school of world.schools) {
    const seniors = school.players.filter((p) => {
      const grade = currentYear - p.enrollmentYear + 1;
      return grade >= 3;
    });

    for (const player of seniors) {
      const overall = computePlayerOverall(player);
      if (overall < 30) continue; // 底辺はドラフト対象外（閾値を40→30に緩和）

      const scoutRating = overallToScoutRating(overall);
      const highlights = generateHighlights(player, school);

      candidates.push({
        playerId: player.id,
        playerName: `${player.lastName}${player.firstName}`,
        schoolId: school.id,
        schoolName: school.name,
        position: player.position,
        overallRating: overall,
        scoutRating,
        highlights,
      });
    }
  }

  // 総合力の高い順にソート
  return candidates.sort((a, b) => b.overallRating - a.overallRating);
}

/**
 * ドラフトを実行する。
 *
 * - S/A 級（overall >= 55）がプロ指名対象
 * - 各プロ球団が 1-3 人を指名
 * - 入団交渉は別途ロール
 */
export function executeDraft(
  world: WorldState,
  currentYear: number,
  rng: RNG,
): { world: WorldState; results: DraftResult[] } {
  const candidates = identifyDraftCandidates(world, currentYear);

  // S/A/B 級をプロ指名対象とする（B 級は後半指名枠）
  // 序盤のゲームで A/S 候補が少なくても最低限のドラフトが機能するよう B 級を含める
  const proCandidates = candidates.filter(
    (c) => c.scoutRating === 'S' || c.scoutRating === 'A' || c.scoutRating === 'B'
  );

  const results: DraftResult[] = [];
  const pickedIds = new Set<string>();

  // 各球団が指名（簡易モデル: 12球団 × 最大3指名 = 36枠）
  const draftRng = rng.derive('draft');
  let round = 1;

  for (const team of PRO_TEAMS) {
    const teamRng = draftRng.derive(team);
    const picksThisTeam = Math.max(1, teamRng.intBetween(1, 3));

    for (let i = 0; i < picksThisTeam; i++) {
      // まだ指名されていない候補から選ぶ
      const available = proCandidates.filter((c) => !pickedIds.has(c.playerId));
      if (available.length === 0) break;

      // 確率的に選択（上位ほど選ばれやすい）
      const totalWeight = available.reduce((sum, _, idx) => sum + (available.length - idx), 0);
      let pick = teamRng.next() * totalWeight;
      let selected: DraftCandidate | null = null;

      for (let j = 0; j < available.length; j++) {
        pick -= (available.length - j);
        if (pick <= 0) {
          selected = available[j];
          break;
        }
      }
      if (!selected) selected = available[0];

      pickedIds.add(selected.playerId);

      // 入団交渉（S 級はほぼ成功、A 級は 80%、B 級は 60%）
      const negotiationRoll = teamRng.next();
      const negotiationProb =
        selected.scoutRating === 'S' ? 0.95 :
        selected.scoutRating === 'A' ? 0.80 : 0.60;
      const negotiationSuccess = negotiationRoll < negotiationProb;

      results.push({
        playerId: selected.playerId,
        picked: true,
        team,
        round,
        negotiationSuccess,
      });

      round++;
    }
  }

  // 指名されなかった候補には picked=false の結果を追加
  for (const candidate of proCandidates) {
    if (!pickedIds.has(candidate.playerId)) {
      results.push({
        playerId: candidate.playerId,
        picked: false,
        team: null,
        round: null,
        negotiationSuccess: false,
      });
    }
  }

  return { world, results };
}

/**
 * 選手の進路を詳細に決定する。
 *
 * 優先順位:
 * 1. ドラフト指名 + 交渉成功 → プロ
 * 2. overall >= 55 + mental 高め → 大学（有望株の進学）
 * 3. overall >= 40 + mental 低め → 社会人野球
 * 4. その他 → 引退
 *
 * @param draftResult null の場合はドラフト対象外
 */
export function determineCareerPath(
  player: Player,
  school: HighSchool,
  draftResult: DraftResult | null,
  rng: RNG,
): CareerPath {
  const careerRng = rng.derive(`career:${player.id}`);
  const overall = computePlayerOverall(player);
  const mental = player.stats.base.mental;

  // 1. プロ入り（ドラフト指名 + 交渉成功）
  if (draftResult && draftResult.picked && draftResult.negotiationSuccess && draftResult.team) {
    return {
      type: 'pro',
      team: draftResult.team,
      pickRound: draftResult.round ?? 1,
    };
  }

  // 2. 大学進学判定
  // - overall >= 40（実力者）
  // - mental >= 30（勉強意欲あり）
  // - ドラフト落ちでも有望なら大学→再挑戦ルート
  // 閾値をゲーム序盤の能力値レンジに合わせて引き下げ
  const universityProb = (() => {
    if (overall >= 50 && draftResult?.picked && !draftResult.negotiationSuccess) {
      // ドラフト指名されたが入団拒否 → 大学へ
      return 0.85;
    }
    if (overall >= 45 && mental >= 40) return 0.6;
    if (overall >= 35 && mental >= 50) return 0.4;
    if (mental >= 45)                  return 0.25;
    return 0.10;
  })();

  if (careerRng.next() < universityProb) {
    return {
      type: 'university',
      school: careerRng.pick(UNIVERSITIES),
      hasScholarship: overall >= 45 && careerRng.chance(0.5),
    };
  }

  // 3. 社会人野球判定
  // - overall >= 20
  // - mental が中程度
  const corporateProb = (() => {
    if (overall >= 35) return 0.5;
    if (overall >= 25) return 0.35;
    return 0.15;
  })();

  if (careerRng.next() < corporateProb) {
    return {
      type: 'corporate',
      company: careerRng.pick(CORPORATE_TEAMS),
    };
  }

  // 4. 引退
  return { type: 'retire' };
}
