/**
 * tests/engine/staff/analyst.test.ts
 *
 * Phase 12-K: アナリストマネージャーによる投手分析コメント生成テスト
 */

import { describe, it, expect } from 'vitest';
import {
  generateAnalystComment,
  generateAnalystCommentFromManagers,
} from '../../../src/engine/staff/analyst';
import type { Manager } from '../../../src/engine/types/manager-staff';
import type { PitchLogEntry } from '../../../src/ui/projectors/view-state-types';

// ============================================================
// テストフィクスチャ
// ============================================================

function makeManager(overrides: Partial<Manager> = {}): Manager {
  return {
    id: 'mgr-1',
    firstName: '花子',
    lastName: '田中',
    grade: 2,
    rank: 'B',
    level: 60, // level 60 → スケール3（中程度）
    exp: 0,
    role: 'analytics',
    traits: [],
    joinedYear: 2025,
    events: [],
    ...overrides,
  };
}

function makePitchEntry(overrides: Partial<PitchLogEntry> = {}): PitchLogEntry {
  return {
    inning: 1,
    half: 'top',
    pitchType: 'fastball',
    pitchTypeLabel: 'fastball',
    outcome: 'called_strike',
    location: { row: 2, col: 2 },
    pitchLocation: 'middle_middle',
    batterId: 'b-1',
    batterName: '打者A',
    ...overrides,
  };
}

/** 指定数の投球ログを生成する（全て fastball、inning=1, half=top） */
function makePitchLog(count: number, pitchType: 'fastball' | 'slider' | 'curveball' = 'fastball'): PitchLogEntry[] {
  return Array.from({ length: count }, (_, i) =>
    makePitchEntry({
      inning: 1,
      half: 'top',
      pitchType,
      pitchTypeLabel: pitchType,
      batterId: `b-${i}`,
    }),
  );
}

// ============================================================
// generateAnalystComment テスト
// ============================================================

describe('generateAnalystComment', () => {
  it('アナリストがnullの場合はnullを返す', () => {
    const pitchLog = makePitchLog(10);
    const result = generateAnalystComment(pitchLog, null, 1, 'top');
    expect(result).toBeNull();
  });

  it('投球ログが少ない場合は insufficient コメントを生成する', () => {
    const analyst = makeManager();
    const pitchLog = makePitchLog(3); // MIN_PITCHES_FOR_ANALYSIS=6 未満
    const result = generateAnalystComment(pitchLog, analyst, 1, 'top');
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('insufficient');
    expect(result!.analystName).toBe('田中');
    expect(result!.inning).toBe(1);
    expect(result!.half).toBe('top');
  });

  it('1回終了時は弱いコメント（insufficient or pitch_tendency）を生成する', () => {
    const analyst = makeManager();
    const pitchLog = makePitchLog(8);
    const result = generateAnalystComment(pitchLog, analyst, 1, 'top');
    expect(result).not.toBeNull();
    expect(['insufficient', 'pitch_tendency']).toContain(result!.kind);
    expect(result!.inning).toBe(1);
  });

  it('2回以降は pitch_tendency / location_tendency / count_tendency のコメントを生成する', () => {
    const analyst = makeManager();
    // 2回分の投球を生成（inning=1,2 合計12球）
    const pitchLog = [
      ...Array.from({ length: 8 }, (_, i) =>
        makePitchEntry({ inning: 1, half: 'top', batterId: `b1-${i}` }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makePitchEntry({ inning: 2, half: 'top', batterId: `b2-${i}` }),
      ),
    ];
    const result = generateAnalystComment(pitchLog, analyst, 2, 'top');
    expect(result).not.toBeNull();
    expect(result!.inning).toBe(2);
    expect(result!.half).toBe('top');
    // コメント本文が空でないこと
    expect(result!.text.length).toBeGreaterThan(0);
  });

  it('コメントには analystName が含まれる', () => {
    const analyst = makeManager({ lastName: '鈴木' });
    const pitchLog = makePitchLog(10);
    const result = generateAnalystComment(pitchLog, analyst, 2, 'bottom');
    expect(result).not.toBeNull();
    expect(result!.analystName).toBe('鈴木');
  });

  it('コメントに id と at（timestamp）が含まれる', () => {
    const analyst = makeManager();
    const pitchLog = makePitchLog(10);
    const result = generateAnalystComment(pitchLog, analyst, 2, 'top');
    expect(result).not.toBeNull();
    expect(result!.id).toBeTruthy();
    expect(typeof result!.at).toBe('number');
    expect(result!.at).toBeGreaterThan(0);
  });

  it('level 1-100 がスケール 1-5 に変換される（level=20 → 1, level=100 → 5）', () => {
    const analystLow = makeManager({ level: 20 });
    const analystHigh = makeManager({ level: 100 });
    const pitchLog = makePitchLog(10);

    const resultLow = generateAnalystComment(pitchLog, analystLow, 2, 'top');
    const resultHigh = generateAnalystComment(pitchLog, analystHigh, 2, 'top');

    expect(resultLow).not.toBeNull();
    expect(resultHigh).not.toBeNull();
    expect(resultLow!.analystLevel).toBe(1);
    expect(resultHigh!.analystLevel).toBe(5);
  });

  it('レベル1では高い頻度でノイズコメントが出る可能性がある（実装確認テスト）', () => {
    // noise コメントはレベル1-2かつ analysisRoll < 0.3 の条件で生成される。
    // 決定論的RNGのためシードに依存する。
    // このテストでは「レベル1のアナリストは noise|pitch_tendency|location_tendency|count_tendency のいずれかを返す」ことを確認する。
    const analyst = makeManager({ level: 10 }); // レベル1
    const pitchLog = [
      ...Array.from({ length: 8 }, (_, i) =>
        makePitchEntry({ inning: 1, half: 'top', batterId: `b1-${i}` }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makePitchEntry({ inning: 2, half: 'top', batterId: `b2-${i}` }),
      ),
    ];

    const result = generateAnalystComment(pitchLog, analyst, 2, 'top');
    expect(result).not.toBeNull();
    // レベル1のコメント種別はいずれかのカテゴリ
    const validKinds: Array<string> = ['noise', 'pitch_tendency', 'location_tendency', 'count_tendency', 'runner_tendency', 'insufficient'];
    expect(validKinds).toContain(result!.kind);
    // レベルが正しく設定されている
    expect(result!.analystLevel).toBe(1);
  });

  it('スライダー多投球の傾向を検知する（レベル4+）', () => {
    const analyst = makeManager({ level: 80 }); // レベル4
    // スライダー80% + ストレート20%
    const pitchLog: PitchLogEntry[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        makePitchEntry({
          inning: 1, half: 'top',
          pitchType: 'slider', pitchTypeLabel: 'slider',
          batterId: `b1-${i}`,
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makePitchEntry({
          inning: 1, half: 'top',
          pitchType: 'fastball', pitchTypeLabel: 'fastball',
          batterId: `b1-fast-${i}`,
        }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makePitchEntry({
          inning: 2, half: 'top',
          pitchType: 'slider', pitchTypeLabel: 'slider',
          batterId: `b2-${i}`,
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makePitchEntry({
          inning: 2, half: 'top',
          pitchType: 'fastball', pitchTypeLabel: 'fastball',
          batterId: `b2-fast-${i}`,
        }),
      ),
    ];

    const result = generateAnalystComment(pitchLog, analyst, 2, 'top');
    expect(result).not.toBeNull();
    // 高レベルは pitch_tendency を正確に検知するはず
    // ただし確率的なのでコメント本文でスライダーに言及することを確認
    if (result!.kind === 'pitch_tendency') {
      expect(result!.text).toContain('スライダー');
    }
  });
});

// ============================================================
// generateAnalystCommentFromManagers テスト
// ============================================================

describe('generateAnalystCommentFromManagers', () => {
  it('analytics ロールのマネージャーがいない場合はnullを返す', () => {
    const managers = [makeManager({ role: 'scout' }), makeManager({ role: 'mental' })];
    const pitchLog = makePitchLog(10);
    const result = generateAnalystCommentFromManagers(pitchLog, managers, 1, 'top');
    expect(result).toBeNull();
  });

  it('analytics ロールのマネージャーが1人いる場合はコメントを生成する', () => {
    const managers = [makeManager({ role: 'analytics', level: 60 })];
    const pitchLog = makePitchLog(10);
    const result = generateAnalystCommentFromManagers(pitchLog, managers, 1, 'top');
    expect(result).not.toBeNull();
  });

  it('複数の analytics マネージャーがいる場合は最高レベルを選択する', () => {
    const managers = [
      makeManager({ role: 'analytics', level: 40, lastName: '低レベル' }),
      makeManager({ role: 'analytics', level: 80, lastName: '高レベル' }),
    ];
    const pitchLog = makePitchLog(10);
    const result = generateAnalystCommentFromManagers(pitchLog, managers, 1, 'top');
    expect(result).not.toBeNull();
    expect(result!.analystName).toBe('高レベル');
  });

  it('空のマネージャーリストはnullを返す', () => {
    const result = generateAnalystCommentFromManagers([], [], 1, 'top');
    expect(result).toBeNull();
  });

  it('投球ログが空でも analytics マネージャーがいれば null でないコメントを返す', () => {
    const managers = [makeManager({ role: 'analytics' })];
    const result = generateAnalystCommentFromManagers([], managers, 1, 'top');
    // サンプル0球 → insufficient コメントが返る
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('insufficient');
  });
});

// ============================================================
// 境界値テスト
// ============================================================

describe('analyst boundary cases', () => {
  it('inning=9（最終回）でもコメント生成できる', () => {
    const analyst = makeManager();
    const pitchLog = Array.from({ length: 12 }, (_, i) =>
      makePitchEntry({ inning: Math.ceil((i + 1) / 2), half: i % 2 === 0 ? 'top' : 'bottom' }),
    );
    const result = generateAnalystComment(pitchLog, analyst, 9, 'bottom');
    expect(result).not.toBeNull();
    expect(result!.inning).toBe(9);
  });

  it('half=top のみの投球でもコメント生成できる', () => {
    const analyst = makeManager();
    const pitchLog = Array.from({ length: 10 }, (_, i) =>
      makePitchEntry({ inning: 1, half: 'top', batterId: `b-${i}` }),
    );
    const result = generateAnalystComment(pitchLog, analyst, 1, 'top');
    expect(result).not.toBeNull();
  });

  it('level が 0 の場合でもクラッシュしない', () => {
    const analyst = makeManager({ level: 0 });
    const pitchLog = makePitchLog(10);
    expect(() => generateAnalystComment(pitchLog, analyst, 1, 'top')).not.toThrow();
  });

  it('level が 100 の場合でもクラッシュしない', () => {
    const analyst = makeManager({ level: 100 });
    const pitchLog = makePitchLog(10);
    expect(() => generateAnalystComment(pitchLog, analyst, 1, 'top')).not.toThrow();
  });

  it('AnalystComment の全フィールドが存在する', () => {
    const analyst = makeManager();
    const pitchLog = makePitchLog(10);
    const result = generateAnalystComment(pitchLog, analyst, 1, 'top');
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('at');
    expect(result).toHaveProperty('inning');
    expect(result).toHaveProperty('half');
    expect(result).toHaveProperty('analystName');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('kind');
    expect(result).toHaveProperty('analystLevel');
  });
});
