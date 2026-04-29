/**
 * B6-test1: 練習成果フィードバック生成テスト
 *
 * Phase S1-B B6: stat delta に応じて適切なメッセージが返ること
 */

import { describe, it, expect } from 'vitest';
import { buildFeedbackMessage, pickBestFeedback } from '../../../src/engine/growth/practice-feedback';

describe('Phase S1-B B6: 練習成果フィードバック生成', () => {
  // B6-test1: 全閾値テスト
  describe('B6-test1: stat delta に応じた適切なメッセージが返ること', () => {
    it('meet +2 → 「ミート率があがったような気がする」（最小閾値）', () => {
      const result = buildFeedbackMessage('batting.contact', 2);
      expect(result).not.toBeNull();
      expect(result!.message).toContain('ミート率があがったような気がする');
    });

    it('meet +3 → 上位閾値メッセージ', () => {
      const result = buildFeedbackMessage('batting.contact', 3);
      expect(result).not.toBeNull();
      // 閾値3: 「ミート率が上がってきた気がする」
      expect(result!.message).toContain('ミート率が上がってきた気がする');
    });

    it('meet +5 → 「ミート率がしっかり上がっている」（最高閾値）', () => {
      const result = buildFeedbackMessage('batting.contact', 5);
      expect(result).not.toBeNull();
      expect(result!.message).toContain('ミート率がしっかり上がっている');
    });

    it('power +3 → 「打球が遠くまで飛ぶようになった」', () => {
      const result = buildFeedbackMessage('batting.power', 3);
      expect(result).not.toBeNull();
      expect(result!.message).toContain('打球が遠くまで飛ぶようになった');
    });

    it('velocity +1 → 「球速がほんの少し増したかも」', () => {
      const result = buildFeedbackMessage('pitching.velocity', 1);
      expect(result).not.toBeNull();
      expect(result!.message).toContain('球速がほんの少し増したかも');
    });

    it('velocity +3 → 「球速の伸びを感じる」', () => {
      const result = buildFeedbackMessage('pitching.velocity', 3);
      expect(result).not.toBeNull();
      expect(result!.message).toContain('球速の伸びを感じる');
    });

    it('velocity +5 → 「球速の伸びが目に見えてわかる」', () => {
      const result = buildFeedbackMessage('pitching.velocity', 5);
      expect(result).not.toBeNull();
      expect(result!.message).toContain('球速の伸びが目に見えてわかる');
    });

    it('base.speed に対してもフィードバックが返る', () => {
      const result = buildFeedbackMessage('base.speed', 3);
      expect(result).not.toBeNull();
      expect(result!.practiceType).toBe('走力');
    });

    it('base.mental に対してもフィードバックが返る', () => {
      const result = buildFeedbackMessage('base.mental', 3);
      expect(result).not.toBeNull();
      expect(result!.practiceType).toBe('メンタル');
    });

    it('delta が 0 の場合は null を返す', () => {
      const result = buildFeedbackMessage('batting.contact', 0);
      expect(result).toBeNull();
    });

    it('delta が負の場合は null を返す', () => {
      const result = buildFeedbackMessage('batting.contact', -1);
      expect(result).toBeNull();
    });

    it('存在しない target でも安全に null を返す', () => {
      // unknown target は templates にマッチしない
      const result = buildFeedbackMessage('batting.contact', 0.5);
      expect(result).toBeNull();
    });
  });

  describe('pickBestFeedback: 複数 delta から最優先フィードバックを返す', () => {
    it('delta が大きいものを優先する', () => {
      const result = pickBestFeedback({
        'batting.contact': 2,
        'pitching.velocity': 5,
        'base.speed': 1,
      });
      expect(result).not.toBeNull();
      // velocity +5 が最大
      expect(result!.message).toContain('球速の伸びが目に見えてわかる');
    });

    it('全て delta < 1 なら null を返す', () => {
      const result = pickBestFeedback({
        'batting.contact': 0,
        'base.speed': 0.5,
      });
      expect(result).toBeNull();
    });

    it('空のオブジェクトなら null を返す', () => {
      const result = pickBestFeedback({});
      expect(result).toBeNull();
    });
  });

  describe('フィードバック practiceType', () => {
    it('batting.contact の practiceType は バッティング', () => {
      const result = buildFeedbackMessage('batting.contact', 2);
      expect(result!.practiceType).toBe('バッティング');
    });

    it('pitching.velocity の practiceType は 投球', () => {
      const result = buildFeedbackMessage('pitching.velocity', 2);
      expect(result!.practiceType).toBe('投球');
    });

    it('base.speed の practiceType は 走力', () => {
      const result = buildFeedbackMessage('base.speed', 2);
      expect(result!.practiceType).toBe('走力');
    });

    it('base.fielding の practiceType は 守備', () => {
      const result = buildFeedbackMessage('base.fielding', 2);
      expect(result!.practiceType).toBe('守備');
    });
  });
});
