import { describe, it, expect } from 'vitest';
import type { GameDate, DayType } from '@/engine/types/calendar';
import {
  createGameDate, advanceDate, compareDates, dateDiffDays,
  formatDate, getDaysInMonth, getDayType, getGrade
} from '@/engine/calendar/game-calendar';
import { getAnnualSchedule, isInCamp, isOffSeason, isTournamentPeriod } from '@/engine/calendar/schedule';

describe('GameDate ユーティリティ', () => {
  it('createGameDate が有効な日付を生成する', () => {
    const date = createGameDate(1, 4, 15);
    expect(date).toEqual({ year: 1, month: 4, day: 15 });
  });

  it('createGameDate が無効な月でエラーを投げる', () => {
    expect(() => createGameDate(1, 0, 1)).toThrow();
    expect(() => createGameDate(1, 13, 1)).toThrow();
  });

  it('createGameDate が無効な日でエラーを投げる', () => {
    expect(() => createGameDate(1, 2, 29)).toThrow(); // 28日まで
    expect(() => createGameDate(1, 4, 31)).toThrow(); // 30日まで
  });

  it('advanceDate が月末をまたぐ', () => {
    const jan31 = createGameDate(1, 1, 31);
    expect(advanceDate(jan31)).toEqual({ year: 1, month: 2, day: 1 });
  });

  it('advanceDate が年末をまたぐ', () => {
    const dec31 = createGameDate(1, 12, 31);
    expect(advanceDate(dec31)).toEqual({ year: 2, month: 1, day: 1 });
  });

  it('advanceDate が通常日を進める', () => {
    const apr10 = createGameDate(1, 4, 10);
    expect(advanceDate(apr10)).toEqual({ year: 1, month: 4, day: 11 });
  });

  it('compareDates が正しく比較する', () => {
    expect(compareDates({ year: 1, month: 4, day: 1 }, { year: 1, month: 4, day: 2 })).toBe(-1);
    expect(compareDates({ year: 1, month: 4, day: 1 }, { year: 1, month: 4, day: 1 })).toBe(0);
    expect(compareDates({ year: 2, month: 1, day: 1 }, { year: 1, month: 12, day: 31 })).toBe(1);
  });

  it('dateDiffDays が日数差を計算する', () => {
    const from = createGameDate(1, 4, 1);
    const to = createGameDate(1, 4, 10);
    expect(dateDiffDays(from, to)).toBe(9);
  });

  it('formatDate がフォーマット文字列を返す', () => {
    expect(formatDate({ year: 1, month: 4, day: 10 })).toBe('1年目 4月10日');
    expect(formatDate({ year: 3, month: 12, day: 25 })).toBe('3年目 12月25日');
  });

  it('getDaysInMonth が正しい日数を返す', () => {
    expect(getDaysInMonth(1, 1)).toBe(31);
    expect(getDaysInMonth(1, 2)).toBe(28);
    expect(getDaysInMonth(1, 4)).toBe(30);
    expect(getDaysInMonth(1, 6)).toBe(30);
    expect(getDaysInMonth(1, 12)).toBe(31);
  });

  it('getGrade が正しい学年を返す', () => {
    expect(getGrade(1, 1)).toBe(1);
    expect(getGrade(1, 2)).toBe(2);
    expect(getGrade(1, 3)).toBe(3);
    expect(getGrade(1, 4)).toBeNull(); // 卒業後
    expect(getGrade(2, 1)).toBeNull(); // 入学前
  });
});

describe('年間スケジュール', () => {
  it('getAnnualSchedule が16イベントを返す', () => {
    const schedule = getAnnualSchedule();
    expect(schedule.length).toBe(16);
  });

  it('入学式が4月1日', () => {
    const schedule = getAnnualSchedule();
    const enrollment = schedule.find(e => e.type === 'enrollment_ceremony');
    expect(enrollment?.month).toBe(4);
    expect(enrollment?.day).toBe(1);
  });

  it('卒業式が3月1日', () => {
    const schedule = getAnnualSchedule();
    const grad = schedule.find(e => e.type === 'graduation_ceremony');
    expect(grad?.month).toBe(3);
    expect(grad?.day).toBe(1);
  });
});

describe('DayType 判定', () => {
  const schedule = getAnnualSchedule();

  it('入学式日は ceremony_day', () => {
    expect(getDayType({ year: 1, month: 4, day: 1 }, schedule)).toBe('ceremony_day');
  });

  it('通常の学校日は school_day', () => {
    expect(getDayType({ year: 1, month: 5, day: 15 }, schedule)).toBe('school_day');
  });

  it('夏の地方大会中は tournament_day', () => {
    expect(getDayType({ year: 1, month: 7, day: 15 }, schedule)).toBe('tournament_day');
  });

  it('12月はオフシーズン（off_day）', () => {
    expect(getDayType({ year: 1, month: 12, day: 10 }, schedule)).toBe('off_day');
  });

  it('夏合宿中は camp_day', () => {
    expect(getDayType({ year: 1, month: 8, day: 27 }, schedule)).toBe('camp_day');
  });
});

describe('シーズン判定', () => {
  it('isInCamp が夏合宿を検出', () => {
    expect(isInCamp({ year: 1, month: 8, day: 25 })).toBe(true);
    expect(isInCamp({ year: 1, month: 8, day: 31 })).toBe(true);
    expect(isInCamp({ year: 1, month: 8, day: 20 })).toBe(false);
  });

  it('isInCamp が冬合宿を検出', () => {
    expect(isInCamp({ year: 1, month: 12, day: 25 })).toBe(true);
    expect(isInCamp({ year: 2, month: 1, day: 3 })).toBe(true);
  });

  it('isOffSeason が12月〜1月を検出', () => {
    expect(isOffSeason({ year: 1, month: 12, day: 1 })).toBe(true);
    expect(isOffSeason({ year: 2, month: 1, day: 15 })).toBe(true);
    expect(isOffSeason({ year: 1, month: 4, day: 10 })).toBe(false);
  });

  it('isTournamentPeriod が大会期間を検出', () => {
    expect(isTournamentPeriod({ year: 1, month: 7, day: 15 })).toBe('summer');
    expect(isTournamentPeriod({ year: 1, month: 9, day: 20 })).toBe('autumn');
    expect(isTournamentPeriod({ year: 1, month: 10, day: 10 })).toBe('autumn');
    expect(isTournamentPeriod({ year: 1, month: 5, day: 10 })).toBeNull();
  });
});
