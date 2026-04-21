import { describe, it, expect } from 'vitest';
import { generatePlayerScoutingReport } from '@/ui/labels/scouting-narrative';
import { createRNG } from '@/engine/core/rng';
import { generatePlayer } from '@/engine/player/generate';
import type { EvaluatorRank } from '@/engine/types/evaluator';

describe('generatePlayerScoutingReport', () => {
  const rng = createRNG('test-seed');
  const pitcher = {
    ...generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 }),
    position: 'pitcher' as const,
    stats: {
      ...generatePlayer(rng, { enrollmentYear: 1, schoolReputation: 60 }).stats,
      pitching: {
        velocity: 80,
        control: 70,
        pitchStamina: 60,
        pitches: { slider: 65, curve: 50, changeup: 40, fork: 30, cutter: 0, sinker: 0 },
      },
    },
  };

  it('Fランクマネージャーは1項目しか返さない', () => {
    const report = generatePlayerScoutingReport(pitcher, 'F', 'seed1');
    expect(report.evaluations.length).toBeLessThanOrEqual(1);
  });

  it('Sランクマネージャーは複数項目返す', () => {
    const report = generatePlayerScoutingReport(pitcher, 'S', 'seed1');
    expect(report.evaluations.length).toBeGreaterThanOrEqual(2);
  });

  it('同じseedなら同じ評価（決定論的）', () => {
    const r1 = generatePlayerScoutingReport(pitcher, 'C', 'fixed-seed');
    const r2 = generatePlayerScoutingReport(pitcher, 'C', 'fixed-seed');
    expect(r1.evaluations.map(e => e.text)).toEqual(r2.evaluations.map(e => e.text));
  });

  it('informationDepth が適切に設定される', () => {
    const fReport = generatePlayerScoutingReport(pitcher, 'F', 'seed1');
    expect(fReport.informationDepth).toBe('shallow');
    const aReport = generatePlayerScoutingReport(pitcher, 'A', 'seed1');
    expect(aReport.informationDepth).toBe('deep');
  });

  it('野手のレポートも生成できる', () => {
    const batter = generatePlayer(rng.derive('batter'), { enrollmentYear: 1, schoolReputation: 60 });
    const nonPitcher = { ...batter, position: 'first' as const };
    const report = generatePlayerScoutingReport(nonPitcher, 'C', 'seed-batter');
    expect(report.evaluations).toBeDefined();
    expect(report.informationDepth).toBe('medium');
  });

  it('異なるseedなら異なる可能性がある', () => {
    // 少なくとも片方は有効な評価テキストを持つ
    const r1 = generatePlayerScoutingReport(pitcher, 'C', 'seed-alpha');
    const r2 = generatePlayerScoutingReport(pitcher, 'C', 'seed-beta');
    // 両方とも有効なテキストを持つ
    expect(r1.evaluations.length).toBeGreaterThan(0);
    expect(r2.evaluations.length).toBeGreaterThan(0);
  });

  const allRanks: EvaluatorRank[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  it.each(allRanks)('ランク %s でエラーが出ない', (rank) => {
    expect(() => generatePlayerScoutingReport(pitcher, rank, 'test')).not.toThrow();
  });
});
