/**
 * Phase 12-J: プレイシーケンス構築関数のユニットテスト
 *
 * テスト対象:
 * - buildPlaySequence(): 統一API（fieldResultType に基づくシーケンス選択）
 * - buildFlyoutSequence(): 外野フライアウト
 * - buildPopupSequence(): 内野ポップアップアウト
 * - buildHitSequence(): シングルヒット（外野）
 * - buildInfieldHitSequence(): 内野安打
 * - buildDoubleSequence(): 二塁打
 * - buildTripleSequence(): 三塁打
 * - buildSacrificeFlySequence(): 犠牲フライ
 */

import { describe, it, expect } from 'vitest';
import {
  buildPlaySequence,
  buildFlyoutSequence,
  buildPopupSequence,
  buildHitSequence,
  buildInfieldHitSequence,
  buildDoubleSequence,
  buildTripleSequence,
  buildSacrificeFlySequence,
  buildGroundOutSequence,
} from '../../../src/ui/match-visual/useBallAnimation';
import type { BatContactForAnimation } from '../../../src/ui/match-visual/useBallAnimation';

// ============================================================
// テストデータ
// ============================================================

const flyCenter: BatContactForAnimation = {
  contactType: 'fly_ball',
  direction: 45,
  speed: 'hard',
  distance: 280,
};

const flyLeft: BatContactForAnimation = {
  contactType: 'fly_ball',
  direction: 15,
  speed: 'normal',
  distance: 250,
};

const flyRight: BatContactForAnimation = {
  contactType: 'fly_ball',
  direction: 75,
  speed: 'hard',
  distance: 260,
};

const groundCenter: BatContactForAnimation = {
  contactType: 'ground_ball',
  direction: 45,
  speed: 'normal',
  distance: 60,
};

const groundLeft: BatContactForAnimation = {
  contactType: 'ground_ball',
  direction: 20,
  speed: 'hard',
  distance: 70,
};

const lineDrive: BatContactForAnimation = {
  contactType: 'line_drive',
  direction: 30,
  speed: 'bullet',
  distance: 200,
};

const popup: BatContactForAnimation = {
  contactType: 'popup',
  direction: 45,
  speed: 'weak',
  distance: 25,
};

// ============================================================
// buildFlyoutSequence
// ============================================================

describe('buildFlyoutSequence', () => {
  it('外野フライアウト: flyBall / fielderMove / result の 3 フェーズ', () => {
    const seq = buildFlyoutSequence(flyCenter, true);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('flyBall');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('result');
  });

  it('totalMs が 0 より大きい', () => {
    const seq = buildFlyoutSequence(flyCenter, true);
    expect(seq.totalMs).toBeGreaterThan(0);
  });

  it('result フェーズのテキストは「アウト！」', () => {
    const seq = buildFlyoutSequence(flyCenter, true);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    expect(resultPhase).toBeDefined();
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('アウト！');
      expect(resultPhase.data.isOut).toBe(true);
    }
  });

  it('レフト方向のフライ → fielderMove は left フィールダー', () => {
    const seq = buildFlyoutSequence(flyLeft, true);
    const fielderPhase = seq.phases.find((p) => p.kind === 'fielderMove');
    if (fielderPhase?.data.kind === 'fielderMove') {
      expect(fielderPhase.data.fielderPosKey).toBe('left');
    }
  });

  it('ライト方向のフライ → fielderMove は right フィールダー', () => {
    const seq = buildFlyoutSequence(flyRight, true);
    const fielderPhase = seq.phases.find((p) => p.kind === 'fielderMove');
    if (fielderPhase?.data.kind === 'fielderMove') {
      expect(fielderPhase.data.fielderPosKey).toBe('right');
    }
  });

  it('フライボールフェーズの peakHeight が 0 より大きい', () => {
    const seq = buildFlyoutSequence(flyCenter, true);
    const flyPhase = seq.phases.find((p) => p.kind === 'flyBall');
    if (flyPhase?.data.kind === 'flyBall') {
      expect(flyPhase.data.peakHeight).toBeGreaterThan(0);
    }
  });

  it('各フェーズの startMs < endMs', () => {
    const seq = buildFlyoutSequence(flyCenter, true);
    for (const phase of seq.phases) {
      expect(phase.startMs).toBeLessThan(phase.endMs);
    }
  });
});

// ============================================================
// buildPopupSequence
// ============================================================

describe('buildPopupSequence', () => {
  it('ポップフライ: flyBall / fielderMove / result の 3 フェーズ', () => {
    const seq = buildPopupSequence(popup);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('flyBall');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('result');
  });

  it('result フェーズはアウト', () => {
    const seq = buildPopupSequence(popup);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.isOut).toBe(true);
    }
  });

  it('flyBall の peakHeight は外野フライより高い（内野高く上がる）', () => {
    const popupSeq = buildPopupSequence(popup);
    const flyoutSeq = buildFlyoutSequence(flyCenter, true);
    const popupFly = popupSeq.phases.find((p) => p.kind === 'flyBall');
    const flyoutFly = flyoutSeq.phases.find((p) => p.kind === 'flyBall');
    if (popupFly?.data.kind === 'flyBall' && flyoutFly?.data.kind === 'flyBall') {
      expect(popupFly.data.peakHeight).toBeGreaterThan(flyoutFly.data.peakHeight);
    }
  });
});

// ============================================================
// buildHitSequence（シングルヒット、外野）
// ============================================================

describe('buildHitSequence', () => {
  it('外野ヒット: flyBall / fielderMove / throw / batterRun / result の 5 フェーズ', () => {
    const seq = buildHitSequence(flyCenter);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('flyBall');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('throw');
    expect(kinds).toContain('batterRun');
    expect(kinds).toContain('result');
  });

  it('result フェーズのテキストは「ヒット！」', () => {
    const seq = buildHitSequence(flyCenter);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('ヒット！');
      expect(resultPhase.data.isOut).toBe(false);
    }
  });

  it('batterRun フェーズの from は ホームプレート (0,0) 付近', () => {
    const seq = buildHitSequence(flyCenter);
    const runPhase = seq.phases.find((p) => p.kind === 'batterRun');
    if (runPhase?.data.kind === 'batterRun') {
      expect(runPhase.data.from.x).toBeCloseTo(0);
      expect(runPhase.data.from.y).toBeCloseTo(0);
    }
  });

  it('batterRun フェーズの to は一塁方向（x>0, y>0）', () => {
    const seq = buildHitSequence(flyCenter);
    const runPhase = seq.phases.find((p) => p.kind === 'batterRun');
    if (runPhase?.data.kind === 'batterRun') {
      expect(runPhase.data.to.x).toBeGreaterThan(0);
      expect(runPhase.data.to.y).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// buildInfieldHitSequence（内野安打）
// ============================================================

describe('buildInfieldHitSequence', () => {
  it('内野安打: groundRoll / fielderMove / throw / batterRun / result の 5 フェーズ', () => {
    const seq = buildInfieldHitSequence(groundCenter);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('groundRoll');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('throw');
    expect(kinds).toContain('batterRun');
    expect(kinds).toContain('result');
  });

  it('result フェーズのテキストは「内野安打！」', () => {
    const seq = buildInfieldHitSequence(groundCenter);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('内野安打！');
      expect(resultPhase.data.isOut).toBe(false);
    }
  });
});

// ============================================================
// buildDoubleSequence（二塁打）
// ============================================================

describe('buildDoubleSequence', () => {
  it('二塁打: flyBall / fielderMove / throw / 2×batterRun / result が含まれる', () => {
    const seq = buildDoubleSequence(flyCenter);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('flyBall');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('throw');
    expect(kinds).toContain('batterRun');
    expect(kinds).toContain('result');
  });

  it('batterRun フェーズが 2 つある（一塁→二塁の 2 段階走塁）', () => {
    const seq = buildDoubleSequence(flyCenter);
    const runPhases = seq.phases.filter((p) => p.kind === 'batterRun');
    expect(runPhases.length).toBe(2);
  });

  it('result テキストは「二塁打！」', () => {
    const seq = buildDoubleSequence(flyCenter);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('二塁打！');
      expect(resultPhase.data.isOut).toBe(false);
    }
  });

  it('result の baseKey は second', () => {
    const seq = buildDoubleSequence(flyCenter);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.baseKey).toBe('second');
    }
  });

  it('totalMs が 1000ms より大きい（長いシーケンス）', () => {
    const seq = buildDoubleSequence(flyCenter);
    expect(seq.totalMs).toBeGreaterThan(1000);
  });
});

// ============================================================
// buildTripleSequence（三塁打）
// ============================================================

describe('buildTripleSequence', () => {
  it('三塁打: flyBall / fielderMove / throw / 3×batterRun / result が含まれる', () => {
    const seq = buildTripleSequence(flyCenter);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('flyBall');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('throw');
    expect(kinds).toContain('batterRun');
    expect(kinds).toContain('result');
  });

  it('batterRun フェーズが 3 つある（一塁→二塁→三塁）', () => {
    const seq = buildTripleSequence(flyCenter);
    const runPhases = seq.phases.filter((p) => p.kind === 'batterRun');
    expect(runPhases.length).toBe(3);
  });

  it('result テキストは「三塁打！」', () => {
    const seq = buildTripleSequence(flyCenter);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('三塁打！');
    }
  });

  it('三塁打の totalMs > 二塁打の totalMs（より長いシーケンス）', () => {
    const triple = buildTripleSequence(flyCenter);
    const double = buildDoubleSequence(flyCenter);
    expect(triple.totalMs).toBeGreaterThan(double.totalMs);
  });
});

// ============================================================
// buildSacrificeFlySequence（犠牲フライ）
// ============================================================

describe('buildSacrificeFlySequence', () => {
  it('犠牲フライ: flyBall / fielderMove / throw / result の 4 フェーズ', () => {
    const seq = buildSacrificeFlySequence(flyCenter);
    const kinds = seq.phases.map((p) => p.kind);
    expect(kinds).toContain('flyBall');
    expect(kinds).toContain('fielderMove');
    expect(kinds).toContain('throw');
    expect(kinds).toContain('result');
  });

  it('result テキストは「犠牲フライ！」', () => {
    const seq = buildSacrificeFlySequence(flyCenter);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('犠牲フライ！');
      expect(resultPhase.data.isOut).toBe(false);
    }
  });

  it('throw フェーズの to はホーム付近（y ≤ 0）', () => {
    const seq = buildSacrificeFlySequence(flyCenter);
    const throwPhase = seq.phases.find((p) => p.kind === 'throw');
    if (throwPhase?.data.kind === 'throw') {
      // ホームは (0, 0) なので y は 0 かそれ以下（キャッチャー y=-8）
      expect(throwPhase.data.to.y).toBeLessThanOrEqual(0);
    }
  });
});

// ============================================================
// buildPlaySequence（統一API）
// ============================================================

describe('buildPlaySequence 統一API', () => {
  // ゴロアウト → buildGroundOutSequence と同じ結果
  it('fieldResultType=out, contactType=ground_ball → groundRoll フェーズを含む', () => {
    const contact: BatContactForAnimation = {
      ...groundCenter,
      fieldResultType: 'out',
    };
    const seq = buildPlaySequence(contact);
    expect(seq.phases.map((p) => p.kind)).toContain('groundRoll');
  });

  // フライアウト → buildFlyoutSequence
  it('fieldResultType=out, contactType=fly_ball → flyBall フェーズを含む', () => {
    const contact: BatContactForAnimation = {
      ...flyCenter,
      fieldResultType: 'out',
    };
    const seq = buildPlaySequence(contact);
    expect(seq.phases.map((p) => p.kind)).toContain('flyBall');
  });

  // ポップアウト → buildPopupSequence
  it('fieldResultType=out, contactType=popup → flyBall フェーズを含む', () => {
    const contact: BatContactForAnimation = {
      ...popup,
      fieldResultType: 'out',
    };
    const seq = buildPlaySequence(contact);
    expect(seq.phases.map((p) => p.kind)).toContain('flyBall');
  });

  // シングルヒット（外野）
  it('fieldResultType=single, contactType=fly_ball → ヒット！result', () => {
    const contact: BatContactForAnimation = {
      ...flyCenter,
      fieldResultType: 'single',
    };
    const seq = buildPlaySequence(contact);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('ヒット！');
    }
  });

  // 内野安打（ゴロ）
  it('fieldResultType=single, contactType=ground_ball → 内野安打！result', () => {
    const contact: BatContactForAnimation = {
      ...groundCenter,
      fieldResultType: 'single',
    };
    const seq = buildPlaySequence(contact);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('内野安打！');
    }
  });

  // 二塁打
  it('fieldResultType=double → 二塁打！result', () => {
    const contact: BatContactForAnimation = {
      ...flyCenter,
      fieldResultType: 'double',
    };
    const seq = buildPlaySequence(contact);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('二塁打！');
    }
  });

  // 三塁打
  it('fieldResultType=triple → 三塁打！result', () => {
    const contact: BatContactForAnimation = {
      ...flyCenter,
      fieldResultType: 'triple',
    };
    const seq = buildPlaySequence(contact);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('三塁打！');
    }
  });

  // 犠牲フライ
  it('fieldResultType=sacrifice_fly → 犠牲フライ！result', () => {
    const contact: BatContactForAnimation = {
      ...flyCenter,
      fieldResultType: 'sacrifice_fly',
    };
    const seq = buildPlaySequence(contact);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('犠牲フライ！');
    }
  });

  // 併殺打
  it('fieldResultType=double_play → groundRoll フェーズを含む', () => {
    const contact: BatContactForAnimation = {
      ...groundCenter,
      fieldResultType: 'double_play',
    };
    const seq = buildPlaySequence(contact);
    expect(seq.phases.map((p) => p.kind)).toContain('groundRoll');
  });

  // エラー（ゴロ）→ セーフ扱い
  it('fieldResultType=error, contactType=ground_ball → result は isOut=false', () => {
    const contact: BatContactForAnimation = {
      ...groundCenter,
      fieldResultType: 'error',
    };
    const seq = buildPlaySequence(contact);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.isOut).toBe(false);
    }
  });

  // fieldResultType 未定義フォールバック（ゴロ）
  it('fieldResultType=undefined, contactType=ground_ball → groundRoll フェーズを含む', () => {
    const contact: BatContactForAnimation = { ...groundCenter };
    const seq = buildPlaySequence(contact);
    expect(seq.phases.map((p) => p.kind)).toContain('groundRoll');
  });

  // fieldResultType 未定義フォールバック（フライ）
  it('fieldResultType=undefined, contactType=fly_ball → flyBall フェーズを含む', () => {
    const contact: BatContactForAnimation = { ...flyCenter };
    const seq = buildPlaySequence(contact);
    expect(seq.phases.map((p) => p.kind)).toContain('flyBall');
  });

  // 全ケースで totalMs > 0
  it('全 fieldResultType で totalMs > 0', () => {
    const resultTypes = [
      'out', 'single', 'double', 'triple', 'home_run',
      'error', 'fielders_choice', 'double_play', 'sacrifice', 'sacrifice_fly',
    ];
    for (const type of resultTypes) {
      if (type === 'home_run') continue; // ホームランは buildPlaySequence 対象外
      const contact: BatContactForAnimation = { ...flyCenter, fieldResultType: type };
      const seq = buildPlaySequence(contact);
      expect(seq.totalMs).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 後方互換性: buildGroundOutSequence は引き続き動作する
// ============================================================

describe('後方互換性: buildGroundOutSequence', () => {
  it('引き続きゴロシーケンスを生成できる（isOut=true）', () => {
    const seq = buildGroundOutSequence(groundCenter, true);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('アウト！');
    }
  });

  it('引き続きゴロシーケンスを生成できる（isOut=false）', () => {
    const seq = buildGroundOutSequence(groundLeft, false);
    const resultPhase = seq.phases.find((p) => p.kind === 'result');
    if (resultPhase?.data.kind === 'result') {
      expect(resultPhase.data.text).toBe('セーフ！');
    }
  });
});
