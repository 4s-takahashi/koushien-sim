import { describe, it, expect } from 'vitest';
import { createRNG } from '../../../src/engine/core/rng';
import { isInStrikeZone, EMPTY_BASES } from '../../../src/engine/match/types';
import { selectPitch } from '../../../src/engine/match/pitch/select-pitch';
import type { PitchType } from '../../../src/engine/types/player';

describe('pitch module', () => {
  describe('isInStrikeZone', () => {
    it('判定: ゾーン内', () => {
      expect(isInStrikeZone({ row: 1, col: 1 })).toBe(true);
      expect(isInStrikeZone({ row: 2, col: 2 })).toBe(true);
      expect(isInStrikeZone({ row: 3, col: 3 })).toBe(true);
    });

    it('判定: ゾーン外', () => {
      expect(isInStrikeZone({ row: 0, col: 2 })).toBe(false);
      expect(isInStrikeZone({ row: 4, col: 2 })).toBe(false);
      expect(isInStrikeZone({ row: 2, col: 0 })).toBe(false);
      expect(isInStrikeZone({ row: 2, col: 4 })).toBe(false);
    });
  });

  describe('EMPTY_BASES', () => {
    it('すべて空の状態を返す', () => {
      expect(EMPTY_BASES.first).toBeNull();
      expect(EMPTY_BASES.second).toBeNull();
      expect(EMPTY_BASES.third).toBeNull();
    });
  });

  describe('selectPitch', () => {
    it('ストレートが選択される（基本40%）', () => {
      const rng = createRNG('test-pitch-selection');
      let fastballCount = 0;
      for (let i = 0; i < 100; i++) {
        const rng2 = createRNG(`test-pitch-${i}`);
        const result = selectPitch(
          140,
          80,
          { curve: 5, slider: 4 },
          0,
          0,
          rng2
        );
        if (result.selection.type === 'fastball') {
          fastballCount++;
        }
      }
      // 基本40%で、ランダムなので30-50%なら許容
      expect(fastballCount).toBeGreaterThan(25);
      expect(fastballCount).toBeLessThan(55);
    });

    it('変化球が選択される', () => {
      const rng = createRNG('test-breaking-ball');
      let foundBreakingBall = false;
      for (let i = 0; i < 100; i++) {
        const rng2 = createRNG(`test-bb-${i}`);
        const result = selectPitch(
          140,
          80,
          { curve: 5, slider: 4 },
          0,
          0,
          rng2
        );
        if (result.selection.type !== 'fastball') {
          foundBreakingBall = true;
          expect(result.selection.breakLevel).toBeGreaterThan(0);
          break;
        }
      }
      expect(foundBreakingBall).toBe(true);
    });

    it('ストライクゾーン外にコースを選択できる', () => {
      const rng = createRNG('test-ball-course');
      let foundBallCourse = false;
      for (let i = 0; i < 100; i++) {
        const rng2 = createRNG(`test-bc-${i}`);
        const result = selectPitch(
          140,
          50, // コントロール低い = ボールゾーン確率高
          { curve: 5 },
          0,
          0,
          rng2
        );
        const { row, col } = result.target;
        if (row === 0 || row === 4 || col === 0 || col === 4) {
          foundBallCourse = true;
          break;
        }
      }
      // コントロール50で時々ボールゾーン
      expect(foundBallCourse).toBe(true);
    });
  });
});
