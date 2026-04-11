import { describe, it, expect } from 'vitest';
import type { Player, Position, GrowthType } from '@/engine/types/player';
import { generatePlayer, generateTraits, generatePhysical, generateBackground, type PlayerGenConfig } from '@/engine/player/generate';
import { createRNG } from '@/engine/core/rng';

const DEFAULT_CONFIG: PlayerGenConfig = {
  enrollmentYear: 1,
  schoolReputation: 50,
};

describe('generatePlayer', () => {
  it('有効な Player オブジェクトを生成する', () => {
    const rng = createRNG('player-test-1');
    const player = generatePlayer(rng, DEFAULT_CONFIG);

    expect(player.id).toBeDefined();
    expect(player.firstName).toBeTruthy();
    expect(player.lastName).toBeTruthy();
    expect(player.enrollmentYear).toBe(1);
    expect(player.position).toBeDefined();
    expect(player.height).toBeGreaterThanOrEqual(160);
    expect(player.height).toBeLessThanOrEqual(195);
    expect(player.weight).toBeGreaterThanOrEqual(50);
    expect(player.weight).toBeLessThanOrEqual(110);
  });

  it('同一シードから同一の選手を生成する（再現性）', () => {
    const rng1 = createRNG('deterministic-seed');
    const rng2 = createRNG('deterministic-seed');
    const p1 = generatePlayer(rng1, DEFAULT_CONFIG);
    const p2 = generatePlayer(rng2, DEFAULT_CONFIG);

    // IDは crypto.randomUUID() 由来で非決定的なので除外して比較
    expect(p1.firstName).toBe(p2.firstName);
    expect(p1.lastName).toBe(p2.lastName);
    expect(p1.position).toBe(p2.position);
    expect(p1.stats.base.stamina).toBe(p2.stats.base.stamina);
    expect(p1.stats.batting.contact).toBe(p2.stats.batting.contact);
    expect(p1.potential.growthType).toBe(p2.potential.growthType);
  });

  it('投手の場合 pitchingStats が存在する', () => {
    const rng = createRNG('pitcher-test');
    const player = generatePlayer(rng, {
      ...DEFAULT_CONFIG,
      forcePosition: 'pitcher',
    });

    expect(player.position).toBe('pitcher');
    expect(player.stats.pitching).not.toBeNull();
    expect(player.stats.pitching!.velocity).toBeGreaterThanOrEqual(80);
    expect(player.stats.pitching!.velocity).toBeLessThanOrEqual(160);
    expect(player.stats.pitching!.control).toBeGreaterThanOrEqual(1);
    expect(Object.keys(player.stats.pitching!.pitches).length).toBeGreaterThanOrEqual(1);
  });

  it('野手の場合 pitchingStats が null', () => {
    const rng = createRNG('fielder-test');
    const player = generatePlayer(rng, {
      ...DEFAULT_CONFIG,
      forcePosition: 'shortstop',
    });

    expect(player.position).toBe('shortstop');
    expect(player.stats.pitching).toBeNull();
  });

  it('能力値が全て 1〜100 の範囲に収まる', () => {
    const rng = createRNG('stat-range-test');
    for (let i = 0; i < 50; i++) {
      const player = generatePlayer(rng.derive(`p${i}`), DEFAULT_CONFIG);
      const { base, batting } = player.stats;

      for (const [key, val] of Object.entries(base)) {
        expect(val, `base.${key}`).toBeGreaterThanOrEqual(1);
        expect(val, `base.${key}`).toBeLessThanOrEqual(100);
      }
      for (const [key, val] of Object.entries(batting)) {
        expect(val, `batting.${key}`).toBeGreaterThanOrEqual(1);
        expect(val, `batting.${key}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('学校レピュテーションが高いと平均能力が高くなる', () => {
    function avgStats(player: Player): number {
      const b = player.stats.base;
      const bat = player.stats.batting;
      const vals = [...Object.values(b), ...Object.values(bat)];
      return vals.reduce((a, c) => a + c, 0) / vals.length;
    }

    const lowRepPlayers = Array.from({ length: 100 }, (_, i) =>
      generatePlayer(createRNG(`low-rep-${i}`), { enrollmentYear: 1, schoolReputation: 10 })
    );
    const highRepPlayers = Array.from({ length: 100 }, (_, i) =>
      generatePlayer(createRNG(`high-rep-${i}`), { enrollmentYear: 1, schoolReputation: 90 })
    );

    const lowAvg = lowRepPlayers.reduce((acc, p) => acc + avgStats(p), 0) / lowRepPlayers.length;
    const highAvg = highRepPlayers.reduce((acc, p) => acc + avgStats(p), 0) / highRepPlayers.length;

    expect(highAvg).toBeGreaterThan(lowAvg);
  });

  it('CareerRecord が全て 0 で初期化される', () => {
    const rng = createRNG('career-test');
    const player = generatePlayer(rng, DEFAULT_CONFIG);
    const cr = player.careerStats;

    expect(cr.gamesPlayed).toBe(0);
    expect(cr.atBats).toBe(0);
    expect(cr.hits).toBe(0);
    expect(cr.homeRuns).toBe(0);
    expect(cr.rbis).toBe(0);
    expect(cr.stolenBases).toBe(0);
    expect(cr.gamesStarted).toBe(0);
    expect(cr.inningsPitched).toBe(0);
    expect(cr.wins).toBe(0);
    expect(cr.losses).toBe(0);
    expect(cr.strikeouts).toBe(0);
    expect(cr.earnedRuns).toBe(0);
  });

  it('ConditionState の初期値が妥当', () => {
    const rng = createRNG('condition-test');
    const player = generatePlayer(rng, DEFAULT_CONFIG);

    expect(player.condition.injury).toBeNull();
    expect(player.condition.mood).toBe('normal');
    expect(player.condition.fatigue).toBeGreaterThanOrEqual(0);
    expect(player.condition.fatigue).toBeLessThanOrEqual(20);
  });

  it('MentalState の初期値が妥当', () => {
    const rng = createRNG('mental-test');
    const player = generatePlayer(rng, DEFAULT_CONFIG);

    expect(player.mentalState.mood).toBe('normal');
    expect(player.mentalState.stress).toBeGreaterThanOrEqual(0);
    expect(player.mentalState.stress).toBeLessThanOrEqual(30);
    expect(player.mentalState.confidence).toBeGreaterThanOrEqual(40);
    expect(player.mentalState.confidence).toBeLessThanOrEqual(70);
    expect(player.mentalState.flags).toEqual([]);
  });

  it('Potential の ceiling が現在値以上になる', () => {
    const rng = createRNG('potential-test');
    for (let i = 0; i < 30; i++) {
      const player = generatePlayer(rng.derive(`pot-${i}`), DEFAULT_CONFIG);
      expect(player.potential.ceiling.base.stamina).toBeGreaterThanOrEqual(player.stats.base.stamina);
      expect(player.potential.ceiling.batting.contact).toBeGreaterThanOrEqual(player.stats.batting.contact);
    }
  });
});

describe('generateTraits', () => {
  it('2〜4個の特性を返す', () => {
    const rng = createRNG('traits-test');
    for (let i = 0; i < 50; i++) {
      const traits = generateTraits(rng.derive(`t${i}`));
      expect(traits.length).toBeGreaterThanOrEqual(2);
      expect(traits.length).toBeLessThanOrEqual(4);
    }
  });

  it('矛盾する特性の組み合わせが存在しない', () => {
    const CONFLICTS: [string, string][] = [
      ['leader', 'shy'],
      ['passionate', 'calm'],
      ['hard_worker', 'slacker'],
      ['overconfident', 'self_doubt'],
      ['honest', 'rebellious'],
      ['caring', 'lone_wolf'],
    ];

    const rng = createRNG('conflict-test');
    for (let i = 0; i < 200; i++) {
      const traits = generateTraits(rng.derive(`c${i}`));
      for (const [a, b] of CONFLICTS) {
        const hasA = traits.includes(a as any);
        const hasB = traits.includes(b as any);
        expect(hasA && hasB, `矛盾: ${a} + ${b}`).toBe(false);
      }
    }
  });
});

describe('generatePhysical', () => {
  it('身長と体重が妥当な範囲', () => {
    const rng = createRNG('physical-test');
    for (let i = 0; i < 50; i++) {
      const { height, weight } = generatePhysical(rng.derive(`ph${i}`), 'pitcher');
      expect(height).toBeGreaterThanOrEqual(160);
      expect(height).toBeLessThanOrEqual(195);
      expect(weight).toBeGreaterThanOrEqual(50);
      expect(weight).toBeLessThanOrEqual(110);
    }
  });
});

describe('generateBackground', () => {
  it('出身地と出身中学を返す', () => {
    const rng = createRNG('bg-test');
    const bg = generateBackground(rng);
    expect(bg.hometown).toBeTruthy();
    expect(bg.middleSchool).toBeTruthy();
    expect(bg.middleSchool).toContain('中学');
  });
});

describe('GrowthType 分布', () => {
  it('genius が約5%、early/normal/late の分布が妥当', () => {
    const counts: Record<GrowthType, number> = { early: 0, normal: 0, late: 0, genius: 0 };
    const total = 5000;

    for (let i = 0; i < total; i++) {
      const rng = createRNG(`dist-${i}`);
      const player = generatePlayer(rng, DEFAULT_CONFIG);
      counts[player.potential.growthType]++;
    }

    // expected: early ~20%, normal ~55%, late ~20%, genius ~5%
    expect(counts.genius / total).toBeGreaterThan(0.02);
    expect(counts.genius / total).toBeLessThan(0.10);
    expect(counts.normal / total).toBeGreaterThan(0.40);
    expect(counts.early / total).toBeGreaterThan(0.10);
    expect(counts.late / total).toBeGreaterThan(0.10);
  });
});
