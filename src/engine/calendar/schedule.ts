import type { ScheduledEvent } from '../types/calendar';
import type { GameDate } from '../types/calendar';

export function getAnnualSchedule(): ScheduledEvent[] {
  return [
    { month: 4, day: 1, type: 'enrollment_ceremony', name: '入学式', duration: 1 },
    { month: 7, day: 10, type: 'summer_tournament_start', name: '夏の地方大会開始', duration: 22 },
    { month: 7, day: 31, type: 'summer_tournament_end', name: '夏の地方大会終了', duration: 1 },
    { month: 8, day: 7, type: 'koshien_start', name: '甲子園開始', duration: 16 },
    { month: 8, day: 22, type: 'koshien_end', name: '甲子園終了', duration: 1 },
    { month: 8, day: 23, type: 'third_year_retirement', name: '3年生引退', duration: 1 },
    { month: 8, day: 24, type: 'new_team_formation', name: '新チーム結成', duration: 1 },
    { month: 8, day: 25, type: 'summer_camp_start', name: '夏合宿開始', duration: 7 },
    { month: 8, day: 31, type: 'summer_camp_end', name: '夏合宿終了', duration: 1 },
    { month: 9, day: 15, type: 'autumn_tournament_start', name: '秋季大会開始', duration: 31 },
    { month: 10, day: 15, type: 'autumn_tournament_end', name: '秋季大会終了', duration: 1 },
    { month: 12, day: 1, type: 'off_season_start', name: 'オフシーズン開始', duration: 1 },
    { month: 12, day: 25, type: 'winter_camp_start', name: '冬合宿開始', duration: 12 },
    { month: 1, day: 5, type: 'winter_camp_end', name: '冬合宿終了', duration: 1 },
    { month: 2, day: 1, type: 'off_season_end', name: 'オフシーズン終了', duration: 1 },
    { month: 3, day: 1, type: 'graduation_ceremony', name: '卒業式', duration: 1 },
  ];
}

export function isInCamp(date: GameDate): boolean {
  // Summer camp: Aug 25 - Aug 31
  if (date.month === 8 && date.day >= 25) return true;
  // Winter camp: Dec 25 - Jan 5
  if (date.month === 12 && date.day >= 25) return true;
  if (date.month === 1 && date.day <= 5) return true;
  return false;
}

export function isOffSeason(date: GameDate): boolean {
  return date.month === 12 || (date.month === 1 && date.day <= 31);
}

export function isTournamentPeriod(date: GameDate): 'summer' | 'autumn' | null {
  // Summer: July 10 - July 31
  if (date.month === 7 && date.day >= 10) return 'summer';
  // Autumn: Sep 15 - Oct 15
  if (date.month === 9 && date.day >= 15) return 'autumn';
  if (date.month === 10 && date.day <= 15) return 'autumn';
  return null;
}
