import seedrandom from 'seedrandom';

/** シード付き乱数生成器 */
export interface RNG {
  next(): number;
  intBetween(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  pickN<T>(arr: readonly T[], n: number): T[];
  gaussian(mean: number, stddev: number): number;
  chance(p: number): boolean;
  derive(subseed: string): RNG;
}

export function createRNG(seed: string): RNG {
  const prng = seedrandom(seed);

  return {
    next: () => prng(),
    intBetween: (min, max) => min + Math.floor(prng() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(prng() * arr.length)],
    pickN: (arr, n) => {
      const shuffled = [...arr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, n);
    },
    gaussian: (mean, stddev) => {
      const u1 = prng();
      const u2 = prng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z * stddev;
    },
    chance: (p) => prng() < p,
    derive: (subseed) => createRNG(seed + ':' + subseed),
  };
}
