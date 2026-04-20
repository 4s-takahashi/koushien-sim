/**
 * src/engine/psyche/monologue-db.ts
 *
 * Phase 7-B: モノローグパターンDB
 *
 * 設計書 §10 の20件 + 独自拡張で合計 45 パターンを定義。
 * 条件 (role / situation / traitMatch / orderMatch / countCondition) と
 * 出力 (text / mentalEffect / weight) で構成。
 */

import type { MonologuePattern } from './types';

export const MONOLOGUE_DB: MonologuePattern[] = [

  // ============================================================
  // 打者 — ピンチ・勝負どころ
  // ============================================================

  {
    id: 'bat_pinch_fiery',
    role: 'batter',
    situation: { outs: 2, runnersOn: 'bases_loaded' },
    traitMatch: ['passionate'],
    orderMatch: undefined,
    text: 'ここで決めてやる！',
    mentalEffect: {
      contactMultiplier: 1.08,
      summary: 'ミート+8%',
    },
    weight: 90,
  },

  {
    id: 'bat_pinch_calm',
    role: 'batter',
    situation: { outs: 2, runnersOn: 'bases_loaded' },
    traitMatch: ['calm'],
    orderMatch: undefined,
    text: 'ボールをよく見よう…焦るな',
    mentalEffect: {
      eyeMultiplier: 1.10,
      summary: '選球眼+10%',
    },
    weight: 90,
  },

  {
    id: 'bat_pinch_nervous',
    role: 'batter',
    situation: { outs: 2, runnersOn: 'bases_loaded' },
    traitMatch: ['sensitive', 'self_doubt'],
    orderMatch: undefined,
    text: '（なんで今…俺が…）',
    mentalEffect: {
      contactMultiplier: 0.90,
      summary: 'ミート-10%',
    },
    weight: 80,
  },

  {
    id: 'bat_scoring_chance_bold',
    role: 'batter',
    situation: { runnersOn: 'scoring' },
    traitMatch: ['bold', 'competitive'],
    text: 'チャンスだ、思い切り振ろう！',
    mentalEffect: {
      powerMultiplier: 1.08,
      summary: 'パワー+8%',
    },
    weight: 75,
  },

  // ============================================================
  // 打者 — 采配系
  // ============================================================

  {
    id: 'bat_outside_focus_ok',
    role: 'batter',
    situation: { runnersOn: 'any' },
    orderMatch: { type: 'outside_focus' },
    text: '外角一本狙いだ',
    mentalEffect: {
      contactMultiplier: 1.15,
      summary: '外角球ミート+15%',
    },
    weight: 85,
  },

  {
    id: 'bat_inside_focus_ok',
    role: 'batter',
    situation: { runnersOn: 'any' },
    orderMatch: { type: 'inside_focus' },
    text: '内角を引っ張るイメージで',
    mentalEffect: {
      contactMultiplier: 1.10,
      powerMultiplier: 1.05,
      summary: 'ミート+10% パワー+5%',
    },
    weight: 80,
  },

  {
    id: 'bat_stubborn_ignore',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['rebellious'],
    orderMatch: { type: 'detailed_focus' },
    text: '俺は自分の打撃を貫く',
    mentalEffect: {
      ignoreOrder: true,
      summary: '指示無効化',
    },
    weight: 70,
  },

  {
    id: 'bat_confused_many_orders',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['easygoing'],
    orderMatch: { type: 'detailed_focus' },
    text: '指示が多くて迷う…',
    mentalEffect: {
      contactMultiplier: 0.90,
      summary: 'ミート-10%',
    },
    weight: 75,
  },

  {
    id: 'bat_passive_order_cautious',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['easygoing'],
    orderMatch: { type: 'passive' },
    text: 'ゆっくり選んでいこう',
    mentalEffect: {
      eyeMultiplier: 1.12,
      summary: '選球眼+12%',
    },
    weight: 70,
  },

  // ============================================================
  // 打者 — カウント系
  // ============================================================

  {
    id: 'bat_fired_up_2strike',
    role: 'batter',
    situation: { runnersOn: 'any' },
    countCondition: { strikes: 2 },
    traitMatch: ['competitive'],
    text: 'ここからが本番だ',
    mentalEffect: {
      contactMultiplier: 1.10,
      summary: 'ミート+10%',
    },
    weight: 85,
  },

  {
    id: 'bat_2strike_panic',
    role: 'batter',
    situation: { runnersOn: 'any' },
    countCondition: { strikes: 2 },
    traitMatch: ['sensitive'],
    text: '（あと1球…当てなきゃ）',
    mentalEffect: {
      contactMultiplier: 0.92,
      summary: 'ミート-8%',
    },
    weight: 75,
  },

  {
    id: 'bat_full_count_gritty',
    role: 'batter',
    situation: { runnersOn: 'any' },
    countCondition: { balls: 3, strikes: 2 },
    traitMatch: ['gritty'],
    text: '粘ってやる。何球でも',
    mentalEffect: {
      eyeMultiplier: 1.15,
      summary: '選球眼+15%',
    },
    weight: 80,
  },

  {
    id: 'bat_3balls_passive',
    role: 'batter',
    situation: { runnersOn: 'any' },
    countCondition: { balls: 3 },
    traitMatch: ['easygoing', 'calm'],
    text: '四球でもいいから選ぼう',
    mentalEffect: {
      eyeMultiplier: 1.20,
      summary: '選球眼+20%',
    },
    weight: 70,
  },

  // ============================================================
  // 打者 — 大舞台・甲子園
  // ============================================================

  {
    id: 'bat_koshien_stage',
    role: 'batter',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['passionate'],
    text: 'この日の為に練習してきた。見てろ！',
    mentalEffect: {
      contactMultiplier: 1.10,
      powerMultiplier: 1.10,
      eyeMultiplier: 1.10,
      summary: '全能力+10%',
    },
    weight: 90,
  },

  {
    id: 'bat_koshien_crowded',
    role: 'batter',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['sensitive', 'self_doubt'],
    text: '（観客が多い…足が震える）',
    mentalEffect: {
      contactMultiplier: 0.95,
      eyeMultiplier: 0.95,
      summary: '全能力-5%',
    },
    weight: 80,
  },

  // ============================================================
  // 打者 — スランプ・連続凡退
  // ============================================================

  {
    id: 'bat_slumping',
    role: 'batter',
    situation: { runnersOn: 'any' },
    text: '今日はなんで打てないんだ…',
    mentalEffect: {
      contactMultiplier: 0.92,
      summary: 'ミート-8%',
    },
    weight: 40, // 低め（条件が弱いため）
  },

  {
    id: 'bat_hot_streak',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['competitive'],
    text: '今日はバットが乗ってる！',
    mentalEffect: {
      contactMultiplier: 1.08,
      powerMultiplier: 1.05,
      summary: 'ミート+8% パワー+5%',
    },
    weight: 40,
  },

  // ============================================================
  // 打者 — 内角攻め（brush_back）
  // ============================================================

  {
    id: 'bat_intimidated',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['sensitive', 'self_doubt'],
    orderMatch: { type: 'brush_back' },
    text: '（当てられたくない…体が引く）',
    mentalEffect: {
      contactMultiplier: 0.85,
      summary: 'ミート-15%',
    },
    weight: 85,
  },

  {
    id: 'bat_brush_back_angry',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['passionate', 'short_tempered'],
    orderMatch: { type: 'brush_back' },
    text: '内角攻め？かかってこい！',
    mentalEffect: {
      contactMultiplier: 1.06,
      powerMultiplier: 1.10,
      summary: 'ミート+6% パワー+10%',
    },
    weight: 80,
  },

  // ============================================================
  // 打者 — 緊迫した終盤
  // ============================================================

  {
    id: 'bat_clutch_late_bold',
    role: 'batter',
    situation: { inning: { min: 7 }, runnersOn: 'scoring', scoreDiff: { role: 'trailing' } },
    traitMatch: ['competitive', 'bold'],
    text: '逆転の一打を俺が打つ！',
    mentalEffect: {
      contactMultiplier: 1.10,
      powerMultiplier: 1.10,
      summary: 'ミート+10% パワー+10%',
    },
    weight: 90,
  },

  {
    id: 'bat_clutch_late_cautious',
    role: 'batter',
    situation: { inning: { min: 7 }, runnersOn: 'any', scoreDiff: { role: 'trailing' } },
    traitMatch: ['easygoing'],
    text: '（うまく当てれば…）',
    mentalEffect: {
      contactMultiplier: 0.95,
      summary: 'ミート-5%',
    },
    weight: 60,
  },

  // ============================================================
  // 打者 — 汎用
  // ============================================================

  {
    id: 'bat_generic_focus',
    role: 'batter',
    situation: { runnersOn: 'any' },
    text: '次の球に集中しよう',
    mentalEffect: {},
    weight: 20, // 汎用フォールバック
  },

  // ============================================================
  // 投手 — 采配系
  // ============================================================

  {
    id: 'pit_fastball_heavy',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    orderMatch: { type: 'fastball_heavy' },
    text: '真っ直ぐで勝負だ',
    mentalEffect: {
      velocityBonus: 3,
      summary: '球速+3km/h',
    },
    weight: 85,
  },

  {
    id: 'pit_breaking_heavy_ok',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    orderMatch: { type: 'breaking_heavy' },
    staminaAbove: 50,
    text: '変化球で翻弄してやる',
    mentalEffect: {
      controlMultiplier: 1.05,
      summary: '制球+5%',
    },
    weight: 80,
  },

  {
    id: 'pit_breaking_heavy_weak',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    orderMatch: { type: 'breaking_heavy' },
    staminaBelow: 50,
    text: '変化球か…コントロールが心配だな…',
    mentalEffect: {
      controlMultiplier: 0.85,
      summary: '制球-15%',
    },
    weight: 80,
  },

  {
    id: 'pit_brush_back_threat',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    orderMatch: { type: 'brush_back' },
    text: '内角ギリギリを攻める',
    mentalEffect: {
      batterFocusDisrupt: true,
      summary: '打者集中乱し',
    },
    weight: 80,
  },

  {
    id: 'pit_outside_focus',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    orderMatch: { type: 'outside_focus' },
    text: '外角に丁寧に投げていこう',
    mentalEffect: {
      controlMultiplier: 1.08,
      summary: '制球+8%',
    },
    weight: 75,
  },

  {
    id: 'pit_stubborn_ignore_order',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    traitMatch: ['rebellious'],
    orderMatch: { type: 'detailed_focus' },
    text: 'こっちは自分の投球をする',
    mentalEffect: {
      ignoreOrder: true,
      summary: '指示無効化',
    },
    weight: 65,
  },

  // ============================================================
  // 投手 — スタミナ
  // ============================================================

  {
    id: 'pit_stamina_low',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    staminaBelow: 50,
    text: '肩が重い…もう少し頑張れ',
    mentalEffect: {
      velocityBonus: -5,
      controlMultiplier: 0.90,
      summary: '球速-5km/h 制球-10%',
    },
    weight: 85,
  },

  {
    id: 'pit_stamina_critical',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    staminaBelow: 25,
    text: 'もう限界か…それでも投げる',
    mentalEffect: {
      velocityBonus: -8,
      controlMultiplier: 0.80,
      summary: '球速-8km/h 制球-20%',
    },
    weight: 90,
  },

  {
    id: 'pit_stamina_fresh',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    staminaAbove: 80,
    text: '今日は体が軽い。思い切り投げよう',
    mentalEffect: {
      velocityBonus: 2,
      controlMultiplier: 1.05,
      summary: '球速+2km/h 制球+5%',
    },
    weight: 60,
  },

  // ============================================================
  // 投手 — ピンチ
  // ============================================================

  {
    id: 'pit_pinch_gritty',
    role: 'pitcher',
    situation: { outs: 2, runnersOn: 'bases_loaded' },
    traitMatch: ['gritty', 'passionate'],
    text: 'ここが踏ん張りどころだ！',
    mentalEffect: {
      controlMultiplier: 1.08,
      velocityBonus: 2,
      summary: '制球+8% 球速+2',
    },
    weight: 90,
  },

  {
    id: 'pit_pinch_calm',
    role: 'pitcher',
    situation: { runnersOn: 'scoring' },
    traitMatch: ['calm'],
    text: '冷静に。ゾーンに集中',
    mentalEffect: {
      controlMultiplier: 1.10,
      summary: '制球+10%',
    },
    weight: 85,
  },

  // ============================================================
  // 投手 — 連続三振
  // ============================================================

  {
    id: 'pit_confidence_on_fire',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    traitMatch: ['competitive', 'passionate', 'bold'],
    staminaAbove: 40,
    text: '今日は絶好調だ！打てるものなら打ってみろ！',
    mentalEffect: {
      velocityBonus: 3,
      controlMultiplier: 1.05,
      summary: '球速+3 制球+5%',
    },
    weight: 50,
  },

  // ============================================================
  // 投手 — 甲子園
  // ============================================================

  {
    id: 'pit_koshien_ace',
    role: 'pitcher',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['passionate', 'competitive'],
    text: '俺がチームを勝たせる',
    mentalEffect: {
      velocityBonus: 3,
      controlMultiplier: 1.05,
      summary: '球速+3 制球+5%',
    },
    weight: 85,
  },

  {
    id: 'pit_koshien_nervous',
    role: 'pitcher',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['sensitive', 'self_doubt'],
    text: '（甲子園…指先が震える）',
    mentalEffect: {
      controlMultiplier: 0.90,
      velocityBonus: -2,
      summary: '制球-10% 球速-2',
    },
    weight: 75,
  },

  // ============================================================
  // 投手 — 汎用
  // ============================================================

  {
    id: 'pit_generic_concentrate',
    role: 'pitcher',
    situation: { runnersOn: 'any' },
    text: '一球一球を丁寧に',
    mentalEffect: {},
    weight: 15,
  },

  {
    id: 'pit_leading_last_inning',
    role: 'pitcher',
    situation: { inning: { min: 8 }, runnersOn: 'any', scoreDiff: { role: 'leading' } },
    traitMatch: ['responsible', 'gritty'],
    text: 'あと少し。絶対に守り切る',
    mentalEffect: {
      controlMultiplier: 1.06,
      velocityBonus: 2,
      summary: '制球+6% 球速+2',
    },
    weight: 80,
  },

  // ============================================================
  // 捕手
  // ============================================================

  {
    id: 'cat_pitchout_call',
    role: 'catcher',
    situation: { runnersOn: 'some' },
    traitMatch: ['calm', 'strategist'],
    text: '盗塁警戒でピッチアウト配球にしよう',
    mentalEffect: {
      stealAttemptMultiplier: 0.80,
      summary: '盗塁刺殺率+20%',
    },
    weight: 70,
  },

  {
    id: 'cat_call_outside',
    role: 'catcher',
    situation: { runnersOn: 'any' },
    traitMatch: ['strategist'],
    orderMatch: { type: 'outside_focus' },
    text: '外角低めでコースを攻めよう',
    mentalEffect: {
      controlMultiplier: 1.05,
      summary: '制球+5%',
    },
    weight: 65,
  },

  {
    id: 'cat_tired_pitcher',
    role: 'catcher',
    situation: { runnersOn: 'any' },
    text: '投手が疲れてる…丁寧にリードしよう',
    mentalEffect: {
      controlMultiplier: 1.03,
      summary: '制球+3%',
    },
    weight: 35,
  },

  {
    id: 'cat_generic',
    role: 'catcher',
    situation: { runnersOn: 'any' },
    text: '打者の特徴を見極めて配球しよう',
    mentalEffect: {},
    weight: 20,
  },

  // ============================================================
  // 走者
  // ============================================================

  {
    id: 'runner_cautious',
    role: 'runner',
    situation: { runnersOn: 'any' },
    traitMatch: ['easygoing'],
    text: 'ここは自重しよう',
    mentalEffect: {
      stealAttemptMultiplier: 0.80,
      summary: '盗塁試み-20%',
    },
    weight: 70,
  },

  {
    id: 'runner_aggressive',
    role: 'runner',
    situation: { runnersOn: 'any' },
    traitMatch: ['passionate'],
    orderMatch: { type: 'aggressive' },
    text: '次の塁を奪う！',
    mentalEffect: {
      stealAttemptMultiplier: 1.20,
      summary: '盗塁試み+20%',
    },
    weight: 75,
  },

  // ============================================================
  // 野手
  // ============================================================

  {
    id: 'fielder_concentration',
    role: 'fielder',
    situation: { runnersOn: 'scoring' },
    traitMatch: ['calm', 'responsible'],
    text: '落ち着いて取る。ミスするな',
    mentalEffect: {
      errorRateMultiplier: 0.70,
      summary: 'エラー率-30%',
    },
    weight: 75,
  },

  {
    id: 'fielder_pinch_nervous',
    role: 'fielder',
    situation: { runnersOn: 'bases_loaded', outs: 2 },
    traitMatch: ['sensitive', 'self_doubt'],
    text: 'こっちに打球が来ないでくれ…',
    mentalEffect: {
      errorRateMultiplier: 1.30,
      summary: 'エラー率+30%',
    },
    weight: 70,
  },

  // ============================================================
  // Phase 7-D: 新特性対応パターン
  // ============================================================

  // 熱血
  {
    id: 'bat_hotblooded_pinch',
    role: 'batter',
    situation: { runnersOn: 'scoring' },
    traitMatch: ['hotblooded'],
    text: '燃えてきた！ここで一発決めてやる！',
    mentalEffect: {
      contactMultiplier: 1.10,
      powerMultiplier: 1.12,
      summary: 'ミート+10% パワー+12%',
    },
    weight: 85,
  },

  {
    id: 'pit_hotblooded_pinch',
    role: 'pitcher',
    situation: { runnersOn: 'scoring' },
    traitMatch: ['hotblooded'],
    text: '気合で抑えてやる！力勝負だ！',
    mentalEffect: {
      velocityBonus: 4,
      controlMultiplier: 0.95,
      summary: '球速+4km/h 制球-5%',
    },
    weight: 80,
  },

  // 冷静（stoic）
  {
    id: 'bat_stoic_neutral',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['stoic'],
    text: '状況を冷静に分析して打とう',
    mentalEffect: {
      eyeMultiplier: 1.08,
      contactMultiplier: 1.03,
      summary: '選球眼+8% ミート+3%',
    },
    weight: 65,
  },

  // 慎重（cautious）
  {
    id: 'bat_cautious_passive_ok',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['cautious'],
    orderMatch: { type: 'passive' },
    text: 'ゆっくりと。これが俺のスタイル',
    mentalEffect: {
      eyeMultiplier: 1.15,
      summary: '選球眼+15%',
    },
    weight: 80,
  },

  {
    id: 'bat_cautious_aggressive_bad',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['cautious'],
    orderMatch: { type: 'aggressive' },
    text: '（積極的に…でも怖い）',
    mentalEffect: {
      contactMultiplier: 0.90,
      summary: 'ミート-10%',
    },
    weight: 80,
  },

  // 頑固（stubborn）
  {
    id: 'bat_stubborn_defiance',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['stubborn'],
    orderMatch: { type: 'detailed_focus' },
    text: '指示？俺は自分のバッティングをする',
    mentalEffect: {
      ignoreOrder: true,
      summary: '指示無効化',
    },
    weight: 70,
  },

  // 勝負師（clutch_hitter）
  {
    id: 'bat_clutch_2strike',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['clutch_hitter'],
    countCondition: { strikes: 2 },
    text: '2ストライクからが俺の本領だ！',
    mentalEffect: {
      contactMultiplier: 1.10,
      summary: 'ミート+10%',
    },
    weight: 90,
  },

  // 混乱しやすい（scatterbrained）
  {
    id: 'bat_scatterbrained_orders',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['scatterbrained'],
    orderMatch: { type: 'detailed_focus' },
    text: '（あれこれ言われると頭が混乱する…）',
    mentalEffect: {
      contactMultiplier: 0.90,
      summary: 'ミート-10%',
    },
    weight: 85,
  },

  // 大舞台（big_game_player）
  {
    id: 'bat_big_game_player_koshien',
    role: 'batter',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['big_game_player'],
    text: '大きな舞台ほど燃えてくる！',
    mentalEffect: {
      contactMultiplier: 1.10,
      powerMultiplier: 1.10,
      eyeMultiplier: 1.10,
      summary: '全能力+10%（甲子園）',
    },
    weight: 90,
  },

  {
    id: 'pit_big_game_player_koshien',
    role: 'pitcher',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['big_game_player'],
    text: 'これが甲子園か。最高の舞台だ！',
    mentalEffect: {
      velocityBonus: 4,
      controlMultiplier: 1.08,
      summary: '球速+4 制球+8%',
    },
    weight: 90,
  },

  // 地味（steady）
  {
    id: 'bat_steady_neutral',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['steady'],
    text: 'いつも通りにやれば大丈夫',
    mentalEffect: {
      contactMultiplier: 1.02,
      summary: 'ミート+2%（安定）',
    },
    weight: 50,
  },

  // ビビリ（timid）
  {
    id: 'bat_timid_koshien',
    role: 'batter',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['timid'],
    text: '（スタンドが満員だ…足がすくむ）',
    mentalEffect: {
      contactMultiplier: 0.90,
      eyeMultiplier: 0.90,
      summary: '全能力-10%（甲子園）',
    },
    weight: 90,
  },

  {
    id: 'bat_timid_brushback',
    role: 'batter',
    situation: { runnersOn: 'any' },
    traitMatch: ['timid'],
    orderMatch: { type: 'brush_back' },
    text: '（当たったら怖い…体が引いてしまう）',
    mentalEffect: {
      contactMultiplier: 0.85,
      summary: 'ミート-15%（内角恐怖）',
    },
    weight: 90,
  },

  // ace
  {
    id: 'pit_ace_koshien',
    role: 'pitcher',
    situation: { isKoshien: true, runnersOn: 'any' },
    traitMatch: ['ace'],
    text: '俺がエースだ。誰も打てない',
    mentalEffect: {
      velocityBonus: 3,
      controlMultiplier: 1.05,
      summary: '球速+3 制球+5%（エース）',
    },
    weight: 90,
  },

  {
    id: 'pit_ace_clutch',
    role: 'pitcher',
    situation: { runnersOn: 'bases_loaded', outs: 2 },
    traitMatch: ['ace'],
    text: 'こういう場面で真のエースが輝く',
    mentalEffect: {
      controlMultiplier: 1.10,
      velocityBonus: 3,
      summary: '制球+10% 球速+3',
    },
    weight: 90,
  },
];
