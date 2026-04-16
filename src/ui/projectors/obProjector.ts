/**
 * obProjector — OB（卒業生）画面用 ViewState 生成
 *
 * (worldState: WorldState) => OBViewState
 */

import type { WorldState } from '../../engine/world/world-state';
import type { CareerPath } from '../../engine/world/person-state';
import type { OBViewState, OBPlayerView, AbilityRank } from './view-state-types';
import { overallToRank } from './teamProjector';

// ============================================================
// 内部ヘルパー
// ============================================================

function careerPathToLabel(path: CareerPath): string {
  switch (path.type) {
    case 'pro':
      return `プロ（${path.team}）${path.pickRound}位指名`;
    case 'university':
      return `大学進学（${path.school}）${path.hasScholarship ? '・奨学金' : ''}`;
    case 'corporate':
      return `社会人野球（${path.company}）`;
    case 'retire':
      return '引退（野球以外へ進路）';
    default:
      return '不明';
  }
}

// ============================================================
// 公開 API
// ============================================================

/**
 * OB 画面の ViewState を生成する。
 */
export function projectOB(worldState: WorldState): OBViewState {
  const { personRegistry, playerSchoolId, schools } = worldState;

  const playerSchool = schools.find((s) => s.id === playerSchoolId);
  const playerSchoolName = playerSchool?.name ?? '';

  const allGraduates: OBPlayerView[] = [];

  for (const [personId, entry] of personRegistry.entries) {
    const summary = entry.graduateSummary;
    const archive = entry.archive;

    if (summary) {
      // retention='tracked': GraduateSummary から情報取得
      const isFromPlayerSchool = summary.schoolId === playerSchoolId;
      allGraduates.push({
        personId,
        name: summary.name,
        schoolName: summary.schoolName,
        graduationYear: summary.graduationYear,
        graduationYearLabel: `Year ${summary.graduationYear} 卒`,
        careerPathLabel: careerPathToLabel(summary.careerPath),
        careerPathType: summary.careerPath.type === 'retire' ? 'retire' : summary.careerPath.type,
        finalOverall: summary.finalOverall,
        overallRank: overallToRank(summary.finalOverall),
        achievements: summary.achievements,
        isFromPlayerSchool,
      });
    } else if (archive) {
      // retention='archived': GraduateArchive から簡易情報取得
      const isFromPlayerSchool = archive.schoolName === playerSchoolName;
      const overallByRank: Record<string, number> = { S: 80, A: 65, B: 50, C: 35, D: 20 };
      const finalOverall = overallByRank[archive.overallRank] ?? 50;

      allGraduates.push({
        personId,
        name: archive.name,
        schoolName: archive.schoolName,
        graduationYear: archive.graduationYear,
        graduationYearLabel: `Year ${archive.graduationYear} 卒`,
        careerPathLabel: archive.careerPathType === 'pro' ? 'プロ'
          : archive.careerPathType === 'university' ? '大学進学'
          : archive.careerPathType === 'corporate' ? '社会人野球'
          : '引退',
        careerPathType: archive.careerPathType,
        finalOverall,
        overallRank: archive.overallRank as AbilityRank,
        achievements: archive.bestAchievement ? [archive.bestAchievement] : [],
        isFromPlayerSchool,
      });
    }
  }

  // 卒業年度順（新しい順）にソート
  allGraduates.sort((a, b) => b.graduationYear - a.graduationYear);

  // 統計
  const proCount = allGraduates.filter((g) => g.careerPathType === 'pro').length;
  const universityCount = allGraduates.filter((g) => g.careerPathType === 'university').length;
  const corporateCount = allGraduates.filter((g) => g.careerPathType === 'corporate').length;
  const retiredCount = allGraduates.filter((g) => g.careerPathType === 'retire').length;

  const playerSchoolGraduates = allGraduates.filter((g) => g.isFromPlayerSchool);

  return {
    graduates: allGraduates,
    totalGraduates: allGraduates.length,
    proCount,
    universityCount,
    corporateCount,
    retiredCount,
    playerSchoolGraduates,
  };
}
