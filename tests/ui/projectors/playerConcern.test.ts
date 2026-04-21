import { describe, it, expect } from 'vitest';
import { generatePlayerConcern } from '@/ui/labels/player-concern';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';

describe('generatePlayerConcern', () => {
  const rng = createRNG('test-seed-concern');
  const basePlayer = generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 50 });

  it('同じseedなら同じ結果（決定論的）', () => {
    const c1 = generatePlayerConcern(basePlayer, { isInTournamentSeason: false }, 'fixed-seed');
    const c2 = generatePlayerConcern(basePlayer, { isInTournamentSeason: false }, 'fixed-seed');
    expect(c1).toBe(c2);
  });

  it('けが中の選手は injury カテゴリを返す', () => {
    const injured = {
      ...basePlayer,
      condition: {
        ...basePlayer.condition,
        injury: {
          type: '打撲',
          severity: 'minor' as const,
          remainingDays: 3,
          startDate: { year: 1, month: 4, day: 1 },
        },
      },
    };
    const concern = generatePlayerConcern(injured, { isInTournamentSeason: false }, 'test');
    const injuryTexts = [
      '早く治して試合に出たい。焦る気持ちを抑えながら治療中。',
      'けがをして初めて、野球ができることのありがたさを感じる。',
      'チームの皆が頑張っているのに、何もできないもどかしさ…',
    ];
    expect(injuryTexts).toContain(concern);
  });

  it('大会期間中の選手は pre_tournament カテゴリを返す', () => {
    const healthyPlayer = {
      ...basePlayer,
      condition: { ...basePlayer.condition, injury: null },
      motivation: 50,
    };
    const concern = generatePlayerConcern(healthyPlayer, { isInTournamentSeason: true }, 'test');
    const tournamentTexts = [
      '大会が近い。緊張するけど、ずっと目指してきた舞台だ。',
      'この大会のために練習してきた。悔いなく全力を出したい。',
      '対戦相手の情報を頭に入れて、準備は万全にしたい。',
    ];
    expect(tournamentTexts).toContain(concern);
  });

  it('ハイモチベーション選手は high_motivation カテゴリを返す', () => {
    const highMot = {
      ...basePlayer,
      condition: { ...basePlayer.condition, injury: null },
      motivation: 80,
    };
    const concern = generatePlayerConcern(highMot, { isInTournamentSeason: false }, 'test');
    const highTexts = [
      '今は体も動くし、打球にも感触がある。この調子を保ちたい！',
      'チームのために自分の力を出し切りたい。燃えている。',
      '最近の調子なら何でもできそうな気がする。自信がある。',
    ];
    expect(highTexts).toContain(concern);
  });

  it('文字列を返す', () => {
    const concern = generatePlayerConcern(basePlayer, { isInTournamentSeason: false }, 'any-seed');
    expect(typeof concern).toBe('string');
    expect(concern.length).toBeGreaterThan(0);
  });
});
