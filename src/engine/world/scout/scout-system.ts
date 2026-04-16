/**
 * scout-system — 中学生スカウトシステム
 *
 * プレイヤーが中学生を視察・注目登録・勧誘するための操作を提供する。
 * AIによる他校スカウト活動も同じロジックで扱う。
 */

import type { RNG } from '../../core/rng';
import type { Position } from '../../types/player';
import type {
  WorldState,
  MiddleSchoolPlayer,
  ScoutSearchFilter,
  ScoutReport,
  RecruitResult,
} from '../world-state';

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * 中学生の総合力を算出（0-100 スケール）。
 * 高校の computeOverall と別設計（中学生は pitching なし前提）。
 */
export function computeMiddleSchoolOverall(ms: MiddleSchoolPlayer): number {
  const b = ms.currentStats.base;
  const bat = ms.currentStats.batting;
  const baseAvg = (b.stamina + b.speed + b.armStrength + b.fielding + b.focus + b.mental) / 6;
  const batAvg  = (bat.contact + bat.power + bat.eye + bat.technique) / 4;
  // 中学生の能力値は 0-50 スケール → 2倍して 0-100 に正規化
  return Math.round((baseAvg * 0.5 + batAvg * 0.5) * 2);
}

/**
 * 総合力からクオリティティアを推定する。
 */
function overallToQualityTier(overall: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (overall >= 70) return 'S';
  if (overall >= 55) return 'A';
  if (overall >= 40) return 'B';
  if (overall >= 25) return 'C';
  return 'D';
}

/**
 * スカウトコメントを生成する。
 * confidence と observedStats から評価文を作る。
 */
function generateScoutComment(
  ms: MiddleSchoolPlayer,
  confidence: number,
  estimatedQuality: 'S' | 'A' | 'B' | 'C' | 'D',
): string {
  const b = ms.currentStats.base;
  const bat = ms.currentStats.batting;

  const strengths: string[] = [];
  if (b.speed >= 30)       strengths.push('俊足が目立つ');
  if (b.armStrength >= 30) strengths.push('強肩素材');
  if (b.fielding >= 30)    strengths.push('守備センスが高い');
  if (bat.power >= 30)     strengths.push('パワーが目立つ');
  if (bat.contact >= 30)   strengths.push('バットコントロールが優秀');
  if (bat.eye >= 30)       strengths.push('選球眼が鋭い');
  if (b.mental >= 30)      strengths.push('精神的な安定感がある');

  const qualityComments: Record<string, string> = {
    S: '将来のエース・4番候補。即戦力にもなりうる逸材。',
    A: '確実な成長が見込める有望株。',
    B: '着実に伸びている中堅素材。',
    C: 'まだ粗削りだが伸びしろが感じられる。',
    D: '現時点では平凡。環境次第で化けるかもしれない。',
  };

  const baseComment = qualityComments[estimatedQuality];
  const strengthText = strengths.length > 0
    ? `${strengths.slice(0, 2).join('、')}。`
    : '';
  const confidenceNote = confidence < 0.5
    ? '（視察回数が少なく精度は低め）'
    : confidence >= 0.8 ? '（確度の高い評価）' : '';

  return `${strengthText}${baseComment}${confidenceNote}`.trim();
}

// ============================================================
// 公開 API
// ============================================================

/**
 * スカウト対象の中学生を条件フィルタで検索する。
 */
export function searchMiddleSchoolers(
  pool: MiddleSchoolPlayer[],
  filters: ScoutSearchFilter,
): MiddleSchoolPlayer[] {
  return pool.filter((ms) => {
    if (filters.grade !== undefined && ms.middleSchoolGrade !== filters.grade) {
      return false;
    }
    if (filters.prefecture !== undefined && ms.prefecture !== filters.prefecture) {
      return false;
    }
    if (filters.minReputation !== undefined) {
      const overall = computeMiddleSchoolOverall(ms);
      if (overall < filters.minReputation) return false;
    }
    if (filters.qualityTier !== undefined) {
      const overall = computeMiddleSchoolOverall(ms);
      const tier = overallToQualityTier(overall);
      if (tier !== filters.qualityTier) return false;
    }
    // position フィルタは今後 Blueprint 統合後に精度が上がる
    // 現時点ではポジション情報は MiddleSchoolPlayer に持っていないためスキップ
    return true;
  });
}

/**
 * 注目登録（ウォッチリストに追加）。
 * 既に登録済みの場合はそのまま返す。
 */
export function addToWatchList(
  world: WorldState,
  playerId: string,
): WorldState {
  const { scoutState } = world;
  if (scoutState.watchList.includes(playerId)) {
    return world;
  }
  return {
    ...world,
    scoutState: {
      ...scoutState,
      watchList: [...scoutState.watchList, playerId],
    },
  };
}

/**
 * ウォッチリストから削除。
 */
export function removeFromWatchList(
  world: WorldState,
  playerId: string,
): WorldState {
  return {
    ...world,
    scoutState: {
      ...world.scoutState,
      watchList: world.scoutState.watchList.filter((id) => id !== playerId),
    },
  };
}

/**
 * スカウト視察を実施する。
 *
 * - 月次予算（monthlyScoutBudget）が残っていなければエラー
 * - 実際の能力値に誤差を加えた observedStats を ScoutReport に記録
 * - 視察回数が多いほど confidence が上がる（最大 0.95）
 * - 予算を 1 消費する
 */
export function conductScoutVisit(
  world: WorldState,
  playerId: string,
  rng: RNG,
): { world: WorldState; scoutReport: ScoutReport } {
  const { scoutState, middleSchoolPool } = world;

  if (scoutState.usedScoutThisMonth >= scoutState.monthlyScoutBudget) {
    throw new Error(
      `今月のスカウト予算（${scoutState.monthlyScoutBudget}回）を使い切りました。`
    );
  }

  const ms = middleSchoolPool.find((p) => p.id === playerId);
  if (!ms) {
    throw new Error(`中学生 ${playerId} が見つかりません。`);
  }

  // 既存レポートがあれば視察回数を増やして confidence を高める
  const existing = scoutState.scoutReports.get(playerId);
  const previousVisits = existing ? 1 : 0; // 簡易カウント（将来は visits フィールドで管理）
  const baseConfidence = 0.4 + previousVisits * 0.2;
  const confidence = Math.min(0.95, baseConfidence + rng.next() * 0.2);

  // 誤差付き能力値観測
  function observeStat(actual: number, conf: number): number {
    const maxError = Math.round((1 - conf) * 10);
    const error = rng.intBetween(-maxError, maxError);
    return Math.max(1, Math.min(50, actual + error));
  }

  const b = ms.currentStats.base;
  const bat = ms.currentStats.batting;

  const observedStats = {
    base: {
      stamina:     observeStat(b.stamina,     confidence),
      speed:       observeStat(b.speed,       confidence),
      armStrength: observeStat(b.armStrength, confidence),
      fielding:    observeStat(b.fielding,    confidence),
      focus:       observeStat(b.focus,       confidence),
      mental:      observeStat(b.mental,      confidence),
    },
    batting: {
      contact:   observeStat(bat.contact,   confidence),
      power:     observeStat(bat.power,     confidence),
      eye:       observeStat(bat.eye,       confidence),
      technique: observeStat(bat.technique, confidence),
    },
    pitching: null as null,
  };

  // 観測値から品質を推定
  const observedOverall = computeMiddleSchoolOverall({ ...ms, currentStats: observedStats });
  const estimatedQuality = overallToQualityTier(observedOverall);
  const scoutComment = generateScoutComment(ms, confidence, estimatedQuality);

  const scoutReport: ScoutReport = {
    playerId,
    observedStats,
    confidence,
    scoutComment,
    estimatedQuality,
  };

  // 更新されたスカウトレポートMap（不変）
  const newReports = new Map(scoutState.scoutReports);
  newReports.set(playerId, scoutReport);

  const newWorld: WorldState = {
    ...world,
    scoutState: {
      ...scoutState,
      scoutReports: newReports,
      usedScoutThisMonth: scoutState.usedScoutThisMonth + 1,
    },
  };

  return { world: newWorld, scoutReport };
}

/**
 * スカウト勧誘を実施する。
 *
 * 勧誘成功の確率は以下の要素で決まる:
 * 1. 学校評判（高いほど有利）
 * 2. 既にスカウト済みかどうか（スカウト済みで確率上昇）
 * 3. 地元（同県）かどうか（地元なら有利）
 * 4. 他校の競合状況（scoutedBy の数が多いほど難化）
 * 5. 選手の質（S/A 級は名門を好む傾向）
 *
 * 成功時: ms.targetSchoolId にプレイヤー校IDをセット + scoutedBy に追加
 * 失敗時: scoutedBy のみ更新（視察は済んでいるので）
 */
export function recruitPlayer(
  world: WorldState,
  playerId: string,
  rng: RNG,
): { world: WorldState; success: boolean; reason: string } {
  const { scoutState, middleSchoolPool, schools, playerSchoolId } = world;

  const msIndex = middleSchoolPool.findIndex((p) => p.id === playerId);
  if (msIndex === -1) {
    return { world, success: false, reason: `中学生 ${playerId} が見つかりません。` };
  }

  const ms = middleSchoolPool[msIndex];
  const playerSchool = schools.find((s) => s.id === playerSchoolId);
  if (!playerSchool) {
    return { world, success: false, reason: 'プレイヤー校が見つかりません。' };
  }

  // 既に他校に確定している場合は失敗
  if (ms.targetSchoolId && ms.targetSchoolId !== playerSchoolId) {
    const rivalSchool = schools.find((s) => s.id === ms.targetSchoolId);
    const rivalName = rivalSchool ? rivalSchool.name : ms.targetSchoolId;
    return {
      world,
      success: false,
      reason: `すでに ${rivalName} への入学が決まっています。`,
    };
  }

  const overall = computeMiddleSchoolOverall(ms);
  const quality = overallToQualityTier(overall);

  // --- 成功確率の計算 ---
  let successProb = 0.3; // ベース確率

  // 1. 学校評判（最大 +0.3）
  successProb += (playerSchool.reputation / 100) * 0.3;

  // 2. スカウト済みボーナス
  if (ms.scoutedBy.includes(playerSchoolId)) {
    successProb += 0.15;
  }
  // 視察レポートありなら追加ボーナス
  if (scoutState.scoutReports.has(playerId)) {
    successProb += 0.1;
  }

  // 3. 地元志向
  if (ms.prefecture === playerSchool.prefecture) {
    successProb += 0.1;
  }

  // 4. 競合校が多いと難化
  const rivals = ms.scoutedBy.filter((id) => id !== playerSchoolId).length;
  successProb -= rivals * 0.08;

  // 5. 選手の品質と学校評判の相性
  if (quality === 'S' || quality === 'A') {
    // 有力選手は名門志向 → 評判が低いとペナルティ
    if (playerSchool.reputation < 50) {
      successProb -= 0.2;
    }
  }

  successProb = Math.max(0.05, Math.min(0.95, successProb));

  const roll = rng.next();
  const success = roll < successProb;

  // scoutedBy に追加（まだ入っていなければ）
  const updatedScoutedBy = ms.scoutedBy.includes(playerSchoolId)
    ? ms.scoutedBy
    : [...ms.scoutedBy, playerSchoolId];

  const updatedMs: MiddleSchoolPlayer = {
    ...ms,
    scoutedBy: updatedScoutedBy,
    targetSchoolId: success ? playerSchoolId : ms.targetSchoolId,
  };

  const updatedPool = [
    ...middleSchoolPool.slice(0, msIndex),
    updatedMs,
    ...middleSchoolPool.slice(msIndex + 1),
  ];

  // 勧誘結果を記録
  const recruitResult: RecruitResult = {
    playerId,
    success,
    reason: success
      ? `勧誘成功（確率 ${Math.round(successProb * 100)}%）`
      : `勧誘失敗（確率 ${Math.round(successProb * 100)}%、ロール ${Math.round(roll * 100)}%）`,
    attemptDate: world.currentDate,
  };

  const newAttempts = new Map(scoutState.recruitAttempts);
  newAttempts.set(playerId, recruitResult);

  const newWorld: WorldState = {
    ...world,
    middleSchoolPool: updatedPool,
    scoutState: {
      ...scoutState,
      recruitAttempts: newAttempts,
    },
  };

  return {
    world: newWorld,
    success,
    reason: recruitResult.reason,
  };
}

/**
 * 他校AIのスカウト活動を実行する。
 *
 * 各 AI 校は reputation に応じて 1-5 人の中学3年生をスカウトし、
 * 有力選手を優先的に確保しようとする。
 * プレイヤー校の勧誘済み選手とは競合する。
 */
export function runAISchoolScouting(
  world: WorldState,
  rng: RNG,
): WorldState {
  const { schools, middleSchoolPool, playerSchoolId } = world;

  // 中学3年生のみが勧誘対象
  const grade3 = middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3);
  if (grade3.length === 0) return world;

  // 中学生の現在の割り当て状況をコピーして更新
  const poolMap = new Map<string, MiddleSchoolPlayer>(
    middleSchoolPool.map((ms) => [ms.id, ms])
  );

  for (const school of schools) {
    // プレイヤー校はスキップ（プレイヤーが手動で操作）
    if (school.id === playerSchoolId) continue;

    // 評判に応じたスカウト数（1-5 人）
    const scoutCount = Math.min(
      grade3.length,
      Math.max(1, Math.round(1 + (school.reputation / 100) * 4))
    );

    const aiRng = rng.derive(`ai-scout:${school.id}`);

    // 有力選手を優先的にスコアリング
    const candidates = grade3
      .map((ms) => {
        const poolMs = poolMap.get(ms.id) ?? ms;
        // 既に targetSchoolId が決定済みならスキップ
        if (poolMs.targetSchoolId) return null;

        const overall = computeMiddleSchoolOverall(ms);
        let score = overall;

        // 地元志向
        if (ms.prefecture === school.prefecture) score += 20;

        // ランダム要素
        score += aiRng.next() * 30;

        return { ms: poolMs, score };
      })
      .filter((c): c is { ms: MiddleSchoolPlayer; score: number } => c !== null)
      .sort((a, b) => b.score - a.score);

    // 上位 scoutCount 人を確保
    const targets = candidates.slice(0, scoutCount);

    for (const { ms } of targets) {
      const updatedMs: MiddleSchoolPlayer = {
        ...ms,
        scoutedBy: ms.scoutedBy.includes(school.id)
          ? ms.scoutedBy
          : [...ms.scoutedBy, school.id],
        targetSchoolId: ms.targetSchoolId ?? school.id,
      };
      poolMap.set(ms.id, updatedMs);
    }
  }

  const updatedPool = middleSchoolPool.map((ms) => poolMap.get(ms.id) ?? ms);

  return {
    ...world,
    middleSchoolPool: updatedPool,
  };
}
