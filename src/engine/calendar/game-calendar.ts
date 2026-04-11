import type { GameDate, DayType, ScheduledEvent } from '../types/calendar';
import type { Grade } from '../types/player';

export function createGameDate(year: number, month: number, day: number): GameDate {
  if (month < 1 || month > 12) throw new Error(`Invalid month: ${month}`);
  if (day < 1 || day > getDaysInMonth(year, month)) throw new Error(`Invalid day: ${day} for month ${month}`);
  return { year, month, day };
}

export function getDaysInMonth(year: number, month: number): number {
  // 2月は28日固定（閏年考慮しない）
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month];
}

export function advanceDate(date: GameDate): GameDate {
  const daysInMonth = getDaysInMonth(date.year, date.month);

  if (date.day < daysInMonth) {
    return { ...date, day: date.day + 1 };
  }

  // End of month
  if (date.month < 12) {
    return { year: date.year, month: date.month + 1, day: 1 };
  }

  // End of year
  return { year: date.year + 1, month: 1, day: 1 };
}

export function compareDates(a: GameDate, b: GameDate): -1 | 0 | 1 {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

export function dateDiffDays(from: GameDate, to: GameDate): number {
  // Convert both dates to day-of-year (ignoring year differences for simplicity)
  // Actually compute total days from year 1 day 1
  function totalDays(d: GameDate): number {
    let days = (d.year - 1) * 365;
    for (let m = 1; m < d.month; m++) {
      days += getDaysInMonth(d.year, m);
    }
    days += d.day;
    return days;
  }
  return totalDays(to) - totalDays(from);
}

export function formatDate(date: GameDate): string {
  return `${date.year}年目 ${date.month}月${date.day}日`;
}

export function getGrade(enrollmentYear: number, currentYear: number): Grade | null {
  const diff = currentYear - enrollmentYear + 1;
  if (diff < 1 || diff > 3) return null;
  return diff as Grade;
}

export function getDayType(date: GameDate, schedule: ScheduledEvent[]): DayType {
  // Check scheduled events
  for (const event of schedule) {
    const start = event.day;
    const end = start + (event.duration ?? 1) - 1;

    if (event.month === date.month && date.day >= start && date.day <= end) {
      switch (event.type) {
        case 'enrollment_ceremony':
        case 'graduation_ceremony':
          return 'ceremony_day';
        case 'summer_tournament_start':
        case 'summer_tournament_end':
        case 'koshien_start':
        case 'koshien_end':
        case 'autumn_tournament_start':
        case 'autumn_tournament_end':
          return 'tournament_day';
        case 'summer_camp_start':
        case 'summer_camp_end':
        case 'winter_camp_start':
        case 'winter_camp_end':
          return 'camp_day';
        case 'off_season_start':
        case 'off_season_end':
        case 'third_year_retirement':
        case 'new_team_formation':
          // These are single-day markers, not day type changers by themselves
          break;
      }
    }
  }

  // Check off season: December 1 to January 31
  if (date.month === 12 || date.month === 1) {
    return 'off_day';
  }

  // Summer tournament period: July 10 - July 31
  if (date.month === 7 && date.day >= 10) {
    return 'tournament_day';
  }

  // Autumn tournament period: September 15 - October 15
  if (date.month === 9 && date.day >= 15) {
    return 'tournament_day';
  }
  if (date.month === 10 && date.day <= 15) {
    return 'tournament_day';
  }

  // Summer camp: August 25 - August 31
  if (date.month === 8 && date.day >= 25) {
    return 'camp_day';
  }

  // Winter camp: December 25 - January 5 (covered by off_day above)
  if (date.month === 1 && date.day <= 5) {
    return 'off_day';
  }

  // Weekend check (Sunday = 0, Saturday = 6)
  // Since we don't track real weekdays, treat all as school_day
  return 'school_day';
}
