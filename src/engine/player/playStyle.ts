/**
 * playStyle.ts — 選手の打撃・投球スタイル分析ヘルパー (v0.43.0)
 *
 * Player オブジェクトから「強み・弱み・傾向」を言語化する。
 * UI はこのモジュールに依存し、engine には依存させない。
 */

import type { Player, TraitId, PitchType } from '../types/player';

// ============================================================
// 特性の説明文
// ============================================================

export const TRAIT_DESCRIPTIONS: Record<TraitId, string> = {
  passionate:       '熱血漢。ピンチでも前向きに挑む',
  calm:             '冷静沈着。プレッシャーに動じない',
  easygoing:        '気楽に構える。疲れにくい性格',
  sensitive:        '繊細。調子の波が大きい',
  bold:             '大胆。強打者への挑戦を好む',
  leader:           'チームリーダー。周りを引っ張る',
  morale_booster:   '盛り上げ役。チームの雰囲気を高める',
  lone_wolf:        '孤独を好む。独自のリズムで動く',
  shy:              '内気。試合前は緊張しやすい',
  hard_worker:      '努力家。練習効率が高い',
  natural_talent:   '天才肌。能力値の伸びが早い',
  strategist:       '戦略家。配球・コース読みが得意',
  competitive:      'ライバル意識が強い。接戦に強い',
  fun_lover:        '楽しみ重視。モチベーション維持が得意',
  short_tempered:   '短気。エラーや失点で崩れやすい',
  slacker:          '怠け者。練習の効果が出にくい時がある',
  overconfident:    '過信しやすい。想定外の場面で乱れる',
  self_doubt:       '自信がない。大舞台でミスが増える',
  rebellious:       '反骨心が強い。逆境に燃えるタイプ',
  responsible:      '責任感が強い。チームのために動く',
  caring:           '思いやりがある。後輩の成長を助ける',
  gritty:           '粘り強い。土壇場で底力を発揮',
  honest:           '正直者。ミスを隠さない、真面目な選手',
  ambitious:        '野心家。プロを目指す強いモチベーション',
  hotblooded:       '熱血。ピンチでも積極的に攻める',
  stoic:            '克己。状況を分析して冷静に対処',
  cautious:         '慎重派。消極策で集中力が上がる',
  stubborn:         '頑固者。監督の指示を無視することがある',
  clutch_hitter:    '勝負強い。2ストライクからの打率が高い',
  scatterbrained:   '散漫。細かい指示が逆効果になることも',
  big_game_player:  '大舞台に強い。甲子園・決勝でパフォーマンス向上',
  steady:           '安定型。派手さはないが常に一定の活躍',
  timid:            '臆病。大観衆・甲子園でパフォーマンス低下',
  ace:              '絶対的エース。大一番で球速・制球が向上',
};

// ============================================================
// 投球スタイル分析
// ============================================================

export interface PitcherStyleAnalysis {
  /** 投球スタイル大分類 */
  pitchingStyle: string;
  /** 最得意球種 */
  bestPitch: { type: PitchType; level: number; label: string } | null;
  /** 制球スタイル（コース得意傾向） */
  controlStyle: string;
  /** 強み一覧 */
  strengths: string[];
  /** 弱み一覧 */
  weaknesses: string[];
  /** 特性説明 */
  traitDescriptions: string[];
}

const PITCH_LABELS: Record<PitchType, string> = {
  curve:    'カーブ',
  slider:   'スライダー',
  fork:     'フォーク',
  changeup: 'チェンジアップ',
  cutter:   'カットボール',
  sinker:   'シンカー',
};

export function analyzePitcherStyle(player: Player): PitcherStyleAnalysis | null {
  const pit = player.stats.pitching;
  if (!pit) return null;

  const { velocity, control, pitchStamina } = pit;
  const base = player.stats.base;

  // 投球スタイル判定
  let pitchingStyle: string;
  if (velocity >= 70 && control < 55) {
    pitchingStyle = '本格派パワーピッチャー（球速重視）';
  } else if (control >= 70 && velocity < 55) {
    pitchingStyle = '技巧派フィネスピッチャー（制球重視）';
  } else if (velocity >= 65 && control >= 65) {
    pitchingStyle = '万能型エースピッチャー';
  } else if (pitchStamina >= 70) {
    pitchingStyle = '完投型スタミナピッチャー';
  } else {
    pitchingStyle = 'バランス型ピッチャー';
  }

  // 最得意球種
  let bestPitch: PitcherStyleAnalysis['bestPitch'] = null;
  const pitchEntries = Object.entries(pit.pitches) as [PitchType, number][];
  if (pitchEntries.length > 0) {
    const best = pitchEntries.reduce((a, b) => (a[1] >= b[1] ? a : b));
    bestPitch = { type: best[0], level: best[1], label: PITCH_LABELS[best[0]] ?? best[0] };
  }

  // 制球スタイル
  let controlStyle: string;
  if (control >= 75) {
    controlStyle = '四隅を丁寧に突く精密制球';
  } else if (control >= 55) {
    controlStyle = 'コーナーを攻める安定した制球';
  } else {
    controlStyle = '荒れ球タイプ・四球が多め';
  }

  // 強み
  const strengths: string[] = [];
  if (velocity >= 70) strengths.push(`球速が高い（推定${Math.round(130 + velocity * 0.25)}km/h台）`);
  if (control >= 70) strengths.push('制球力に優れ、四球を出しにくい');
  if (pitchStamina >= 70) strengths.push('スタミナが豊富で完投能力がある');
  if (base.mental >= 65) strengths.push('精神的に安定、ピンチでも崩れにくい');
  if (pitchEntries.length >= 3) strengths.push(`変化球が${pitchEntries.length}種類あり、打者を翻弄できる`);
  if (bestPitch && bestPitch.level >= 70) strengths.push(`${bestPitch.label}のキレが抜群`);

  // 弱み
  const weaknesses: string[] = [];
  if (velocity < 50) weaknesses.push('球速が低く、強打者に捉えられやすい');
  if (control < 45) weaknesses.push('制球が不安定で四球・死球が多い');
  if (pitchStamina < 45) weaknesses.push('スタミナ不足で中盤以降に球威が落ちる');
  if (base.mental < 40) weaknesses.push('メンタルが弱く、ピンチで崩れやすい');
  if (pitchEntries.length <= 1) weaknesses.push('変化球の種類が少なく、打者に読まれやすい');

  // 特性説明
  const traitDescriptions = player.traits
    .map((t) => TRAIT_DESCRIPTIONS[t])
    .filter(Boolean);

  return {
    pitchingStyle,
    bestPitch,
    controlStyle,
    strengths,
    weaknesses,
    traitDescriptions,
  };
}

// ============================================================
// 打撃スタイル分析
// ============================================================

export interface BatterStyleAnalysis {
  /** 打撃スタイル大分類 */
  battingStyle: string;
  /** 打球傾向（引っ張り/流し/センター） */
  pullTendency: string;
  /** 強み一覧 */
  strengths: string[];
  /** 弱み一覧 */
  weaknesses: string[];
  /** 特性説明 */
  traitDescriptions: string[];
}

export function analyzeBatterStyle(player: Player): BatterStyleAnalysis {
  const bat = player.stats.batting;
  const base = player.stats.base;

  // 打撃スタイル判定
  let battingStyle: string;
  if (bat.power >= 70 && bat.contact < 55) {
    battingStyle = 'パワーヒッター（長打狙い型）';
  } else if (bat.contact >= 70 && bat.power < 55) {
    battingStyle = 'アベレージヒッター（安打製造型）';
  } else if (bat.eye >= 70) {
    battingStyle = '選球眼型（出塁重視型）';
  } else if (bat.technique >= 70) {
    battingStyle = 'テクニシャン（技巧打撃型）';
  } else if (bat.power >= 65 && bat.contact >= 65) {
    battingStyle = 'バランス型（中距離打者）';
  } else {
    battingStyle = 'オールラウンド打者';
  }

  // 引っ張り/流し傾向
  const battingSideLabel = player.battingSide === 'left' ? '左打者' : player.battingSide === 'right' ? '右打者' : 'スイッチ打者';
  let pullTendency: string;
  if (bat.technique >= 65) {
    pullTendency = '流し打ちも得意な広角打者';
  } else if (bat.power >= 65) {
    pullTendency = `引っ張り重視（${battingSideLabel}）`;
  } else {
    pullTendency = 'センター中心の打撃';
  }

  // 強み
  const strengths: string[] = [];
  if (bat.power >= 70) strengths.push('長打力があり、ホームランを期待できる');
  if (bat.contact >= 70) strengths.push('ミート力が高く、安定してヒットを打てる');
  if (bat.eye >= 70) strengths.push('選球眼が良く、四球を多く選べる');
  if (bat.technique >= 70) strengths.push('技術が高く、変化球にも対応できる');
  if (base.speed >= 70) strengths.push('足が速く、内野安打や盗塁を狙える');
  if (base.mental >= 65) strengths.push('メンタルが強く、大舞台でも実力を発揮');

  // 弱み
  const weaknesses: string[] = [];
  if (bat.contact < 45) weaknesses.push('ミート力が低く、三振が多い');
  if (bat.power < 40) weaknesses.push('パワー不足で長打を打ちにくい');
  if (bat.eye < 40) weaknesses.push('ボール球に手を出しやすい');
  if (bat.technique < 40) weaknesses.push('変化球の対応が苦手');
  if (base.mental < 40) weaknesses.push('プレッシャーで実力が出しにくい場面がある');

  // 特性説明
  const traitDescriptions = player.traits
    .map((t) => TRAIT_DESCRIPTIONS[t])
    .filter(Boolean);

  return {
    battingStyle,
    pullTendency,
    strengths,
    weaknesses,
    traitDescriptions,
  };
}
