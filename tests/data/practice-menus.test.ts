/**
 * B4-test1: 個別練習メニュー追加確認テスト
 *
 * Phase S1-B B4: 6つの新規個別練習メニューが定義されていること
 */

import { describe, it, expect } from 'vitest';
import { PRACTICE_MENUS, INDIVIDUAL_PRACTICE_MENUS, TEAM_PRACTICE_MENUS, getPracticeMenuById } from '../../src/data/practice-menus';

describe('Phase S1-B B4: 個別練習メニュー追加', () => {
  // B4-test1: 追加した個別練習メニュー（走力/守備/配球/メンタル/柔軟/動画）が定義されていること
  it('B4-test1: 6つの新規メニューが存在する', () => {
    const newMenuIds = [
      'base_running',    // 走力強化（ベースランニング）
      'position_drill',  // 守備位置別反復（ポジション別）
      'pitch_study',     // 配球研究（投手向け）
      'pressure_mental', // メンタルトレーニング（プレッシャー耐性）
      'flexibility',     // 柔軟性向上（ケガ予防）
      'video_analysis',  // 動画分析（バッティング/ピッチング動画レビュー）
    ];

    for (const id of newMenuIds) {
      const menu = PRACTICE_MENUS.find((m) => m.id === id);
      expect(menu, `メニュー '${id}' が見つかりません`).toBeDefined();
      expect(menu!.name, `メニュー '${id}' に name がありません`).toBeTruthy();
      expect(menu!.description, `メニュー '${id}' に description がありません`).toBeTruthy();
    }
  });

  it('走力強化（base_running）は base.speed に効果がある', () => {
    const menu = PRACTICE_MENUS.find((m) => m.id === 'base_running');
    expect(menu).toBeDefined();
    const speedEffect = menu!.statEffects.find((e) => e.target === 'base.speed');
    expect(speedEffect).toBeDefined();
    expect(speedEffect!.baseGain).toBeGreaterThan(0);
  });

  it('守備位置別反復（position_drill）は base.fielding に効果がある', () => {
    const menu = PRACTICE_MENUS.find((m) => m.id === 'position_drill');
    expect(menu).toBeDefined();
    const fieldingEffect = menu!.statEffects.find((e) => e.target === 'base.fielding');
    expect(fieldingEffect).toBeDefined();
    expect(fieldingEffect!.baseGain).toBeGreaterThan(0);
  });

  it('配球研究（pitch_study）は pitching.control に効果がある', () => {
    const menu = PRACTICE_MENUS.find((m) => m.id === 'pitch_study');
    expect(menu).toBeDefined();
    const controlEffect = menu!.statEffects.find((e) => e.target === 'pitching.control');
    expect(controlEffect).toBeDefined();
    expect(controlEffect!.baseGain).toBeGreaterThan(0);
  });

  it('プレッシャー耐性（pressure_mental）は base.mental に効果がある', () => {
    const menu = PRACTICE_MENUS.find((m) => m.id === 'pressure_mental');
    expect(menu).toBeDefined();
    const mentalEffect = menu!.statEffects.find((e) => e.target === 'base.mental');
    expect(mentalEffect).toBeDefined();
    expect(mentalEffect!.baseGain).toBeGreaterThan(0);
  });

  it('柔軟性向上（flexibility）は負の fatigueLoad（疲労回復効果）がある', () => {
    const menu = PRACTICE_MENUS.find((m) => m.id === 'flexibility');
    expect(menu).toBeDefined();
    expect(menu!.fatigueLoad).toBeLessThan(0);
  });

  it('動画分析（video_analysis）は batting.technique と pitching.control に効果がある', () => {
    const menu = PRACTICE_MENUS.find((m) => m.id === 'video_analysis');
    expect(menu).toBeDefined();
    const techEffect = menu!.statEffects.find((e) => e.target === 'batting.technique');
    const controlEffect = menu!.statEffects.find((e) => e.target === 'pitching.control');
    expect(techEffect).toBeDefined();
    expect(controlEffect).toBeDefined();
  });

  it('既存9種のメニュー（batting_basic 等）も含む合計15種以上のメニューがある', () => {
    expect(PRACTICE_MENUS.length).toBeGreaterThanOrEqual(15);
  });

  it('TEAM_PRACTICE_MENUS は従来の9種のみ', () => {
    expect(TEAM_PRACTICE_MENUS.length).toBe(9);
    const expectedIds = [
      'batting_basic', 'batting_live', 'pitching_basic', 'pitching_bullpen',
      'fielding_drill', 'running', 'strength', 'mental', 'rest',
    ];
    for (const id of expectedIds) {
      expect(TEAM_PRACTICE_MENUS.find((m) => m.id === id)).toBeDefined();
    }
  });

  it('INDIVIDUAL_PRACTICE_MENUS は全メニューを含む', () => {
    expect(INDIVIDUAL_PRACTICE_MENUS.length).toBe(PRACTICE_MENUS.length);
  });

  it('getPracticeMenuById は存在するIDを正常に返す', () => {
    const menu = getPracticeMenuById('base_running');
    expect(menu.id).toBe('base_running');
  });

  it('getPracticeMenuById は存在しないIDに対して batting_basic を返す', () => {
    const menu = getPracticeMenuById('non_existent_id');
    expect(menu.id).toBe('batting_basic');
  });
});
