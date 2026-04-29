/**
 * src/engine/narrative/thought-comment-generator.ts
 *
 * Phase R7-3: 1球ごと思考コメント生成
 *
 * NarrativeHook → コメントテンプレートから、バッター・ピッチャー・キャッチャー視点の
 * 思考コメントを生成する。
 *
 * 設計:
 * - 状況（カウント・ランナー・イニング・甲子園）に応じたパターン分岐
 * - 特性（TraitId）に応じた語調・内容の変化
 * - 采配（orderType）に応じたコメントの追加
 * - 同一試合内での重複回避（recentCommentIds）
 * - 純粋関数（副作用なし・RNG なし、代わりに決定論的ハッシュで選択）
 */

import type { ThoughtComment, ThoughtCommentContext } from './types';
import type { TraitId } from '../types/player';

// ============================================================
// 思考コメントパターン型
// ============================================================

interface ThoughtCommentPattern {
  id: string;
  role: 'batter' | 'pitcher' | 'catcher';
  /** マッチ条件 */
  condition: (ctx: ThoughtCommentContext) => boolean;
  /** テキスト（配列から状況に応じて選択される） */
  texts: string[];
  category: ThoughtComment['category'];
  /** 重み（高いほど選ばれやすい） */
  weight: number;
}

// ============================================================
// パターンDB
// ============================================================

const THOUGHT_COMMENT_DB: ThoughtCommentPattern[] = [

  // ============================================================
  // バッター — 状況系
  // ============================================================

  {
    id: 'bat_count_two_strikes',
    role: 'batter',
    condition: (ctx) => ctx.strikes === 2,
    texts: [
      '（2ストライク…集中だ、次は絶対振る！）',
      '（追い込まれた…でも諦めない）',
      '（ここからが本当の勝負だ）',
      '（2ストライクからの一球に賭ける）',
    ],
    category: 'situational',
    weight: 80,
  },

  {
    id: 'bat_count_full',
    role: 'batter',
    condition: (ctx) => ctx.balls === 3 && ctx.strikes === 2,
    texts: [
      '（フルカウント…次の一球が全てだ）',
      '（3-2…何が来ても対応する！）',
      '（ここは絶対に打ってやる）',
    ],
    category: 'situational',
    weight: 90,
  },

  {
    id: 'bat_bases_loaded',
    role: 'batter',
    condition: (ctx) => ctx.runnersOn === 'bases_loaded',
    texts: [
      '（満塁…ここは一本打てば大きい！）',
      '（全員乗っている…頼む、繋いでくれ体）',
      '（満塁のチャンス！絶対に打つ！）',
      '（ここが甲子園だ…燃えてきた！）',
    ],
    category: 'emotional',
    weight: 85,
  },

  {
    id: 'bat_scoring_position',
    role: 'batter',
    condition: (ctx) => ctx.runnersOn === 'scoring',
    texts: [
      '（得点圏に走者がいる…チャンスを活かせ）',
      '（繋ぐ打撃を意識しよう）',
      '（ここで一本！チームのために）',
    ],
    category: 'tactical',
    weight: 70,
  },

  {
    id: 'bat_koshien',
    role: 'batter',
    condition: (ctx) => ctx.isKoshien,
    texts: [
      '（甲子園…この舞台で打てたら最高だ）',
      '（甲子園のマウンドで対戦できる…夢じゃない）',
      '（全国の視聴者が見ている…でも今は目の前の一球だ）',
      '（甲子園の土を踏んで打てる幸せ…結果で恩返ししよう）',
    ],
    category: 'emotional',
    weight: 80,
  },

  {
    id: 'bat_late_inning',
    role: 'batter',
    condition: (ctx) => ctx.inning >= 7,
    texts: [
      '（残りイニングが少ない…集中して臨もう）',
      '（終盤だ…ここが大事）',
      '（あと何アウトあるか…頭に入れながら打とう）',
    ],
    category: 'analytical',
    weight: 60,
  },

  {
    id: 'bat_trailing',
    role: 'batter',
    condition: (ctx) => ctx.scoreDiff < -2,
    texts: [
      '（点差がある…でも絶対諦めない）',
      '（ここから逆転できると信じよう）',
      '（まだ終わってない…一点から始めよう）',
    ],
    category: 'emotional',
    weight: 75,
  },

  {
    id: 'bat_leading',
    role: 'batter',
    condition: (ctx) => ctx.scoreDiff > 2,
    texts: [
      '（リードしてる…でも気を抜かずに）',
      '（ダメ押しをしておきたい）',
      '（追加点を取って楽にしよう）',
    ],
    category: 'tactical',
    weight: 55,
  },

  // ============================================================
  // バッター — 特性系
  // ============================================================

  {
    id: 'bat_trait_hotblooded_pinch',
    role: 'batter',
    condition: (ctx) =>
      ctx.batterTraits.includes('hotblooded') &&
      (ctx.runnersOn === 'scoring' || ctx.runnersOn === 'bases_loaded'),
    texts: [
      '（燃えてきたぞ！ここで決めてやる！）',
      '（熱い！この状況、俺のために用意されたみたいだ！）',
      '（チャンスで余計に力が出る！行くぞ！）',
    ],
    category: 'emotional',
    weight: 90,
  },

  {
    id: 'bat_trait_stoic_analyze',
    role: 'batter',
    condition: (ctx) => ctx.batterTraits.includes('stoic'),
    texts: [
      '（データ通りに配球してくる…冷静に対応）',
      '（感情を排除して、ボールだけを見る）',
      '（この投手のパターンは分析済みだ）',
    ],
    category: 'analytical',
    weight: 80,
  },

  {
    id: 'bat_trait_clutch_hitter_two_strikes',
    role: 'batter',
    condition: (ctx) =>
      ctx.batterTraits.includes('clutch_hitter') && ctx.strikes === 2,
    texts: [
      '（2ストライクからが俺の真骨頂だ！）',
      '（追い込まれた方が燃える！来い！）',
      '（ここからが本当のバッティングだ）',
    ],
    category: 'emotional',
    weight: 95,
  },

  {
    id: 'bat_trait_timid_koshien',
    role: 'batter',
    condition: (ctx) =>
      ctx.batterTraits.includes('timid') && ctx.isKoshien,
    texts: [
      '（甲子園…観客が多すぎて足が震える）',
      '（こんな大舞台、慣れない…落ち着け自分）',
      '（ビビるな…でも手が震えてる）',
    ],
    category: 'emotional',
    weight: 85,
  },

  {
    id: 'bat_trait_big_game_koshien',
    role: 'batter',
    condition: (ctx) =>
      ctx.batterTraits.includes('big_game_player') && ctx.isKoshien,
    texts: [
      '（甲子園の大舞台！最高のパフォーマンスを見せる！）',
      '（こういう舞台で実力が出る！）',
      '（大舞台こそ俺の居場所だ！）',
    ],
    category: 'emotional',
    weight: 95,
  },

  {
    id: 'bat_trait_scatterbrained_order',
    role: 'batter',
    condition: (ctx) =>
      ctx.batterTraits.includes('scatterbrained') && ctx.orderType !== null,
    texts: [
      '（えっ、采配が変わった？何を狙えばいいんだっけ）',
      '（サインがあったけど…忘れた、普通に打とう）',
      '（指示が多すぎて頭がこんがらがってきた）',
    ],
    category: 'tactical',
    weight: 70,
  },

  {
    id: 'bat_trait_cautious_passive',
    role: 'batter',
    condition: (ctx) =>
      ctx.batterTraits.includes('cautious') &&
      (ctx.orderType === 'passive' || ctx.balls >= 2),
    texts: [
      '（慎重に行こう…ボールになりそうなら見逃す）',
      '（焦らず選球していけば活路が開ける）',
      '（無理に打たなくていい…待つのも技術だ）',
    ],
    category: 'tactical',
    weight: 80,
  },

  // ============================================================
  // バッター — 采配系
  // ============================================================

  {
    id: 'bat_order_outside_focus',
    role: 'batter',
    condition: (ctx) => ctx.orderType === 'outside_focus',
    texts: [
      '（外角一本に絞る…来い、外の球）',
      '（外角を待て…その指示に従おう）',
      '（外の球だけに集中…余計な動きは要らない）',
    ],
    category: 'tactical',
    weight: 85,
  },

  {
    id: 'bat_order_inside_focus',
    role: 'batter',
    condition: (ctx) => ctx.orderType === 'inside_focus',
    texts: [
      '（内角を引っ張るぞ…体を回転させろ）',
      '（内角狙い！来たら思い切り打つ）',
      '（インコースに備えよう）',
    ],
    category: 'tactical',
    weight: 85,
  },

  {
    id: 'bat_order_aggressive',
    role: 'batter',
    condition: (ctx) => ctx.orderType === 'aggressive',
    texts: [
      '（積極的に行け！初球から振る！）',
      '（来た球は全部打つつもりで）',
      '（積極的なスタイルで攻める）',
    ],
    category: 'tactical',
    weight: 80,
  },

  {
    id: 'bat_order_passive',
    role: 'batter',
    condition: (ctx) => ctx.orderType === 'passive',
    texts: [
      '（選球眼重視…ボールを見極めよう）',
      '（慎重に行く…フォアボールも十分な結果だ）',
      '（甘い球だけを狙う…待ちの姿勢で）',
    ],
    category: 'tactical',
    weight: 75,
  },

  // ============================================================
  // 投手 — 状況系
  // ============================================================

  {
    id: 'pit_count_three_zero',
    role: 'pitcher',
    condition: (ctx) => ctx.balls === 3 && ctx.strikes === 0,
    texts: [
      '（3ボール…落ち着け、制球を取り戻せ）',
      '（ここで四球はまずい…慎重に、でも大胆に）',
      '（3-0か…次の一球を丁寧に投げよう）',
    ],
    category: 'situational',
    weight: 85,
  },

  {
    id: 'pit_two_strikes',
    role: 'pitcher',
    condition: (ctx) => ctx.strikes === 2,
    texts: [
      '（2ストライク取った！あとひとつだ）',
      '（追い込んだ…決め球を選ぼう）',
      '（ここが勝負！完璧なコースに投げる）',
    ],
    category: 'situational',
    weight: 80,
  },

  {
    id: 'pit_bases_loaded',
    role: 'pitcher',
    condition: (ctx) => ctx.runnersOn === 'bases_loaded',
    texts: [
      '（満塁…ここは踏ん張りどころだ）',
      '（ランナー全員いる…慌てるな）',
      '（ここを0点に抑えれば流れが変わる）',
      '（打者一人ひとりに集中しよう）',
    ],
    category: 'emotional',
    weight: 90,
  },

  {
    id: 'pit_low_stamina',
    role: 'pitcher',
    condition: (ctx) => ctx.pitcherStamina < 40,
    texts: [
      '（体が重い…でも諦めるわけにはいかない）',
      '（スタミナが落ちてきた…省エネで投げよう）',
      '（腕が上がりにくくなってきた…制球重視で）',
      '（疲れを感じる…でも今日は最後まで投げる）',
    ],
    category: 'situational',
    weight: 80,
  },

  {
    id: 'pit_koshien',
    role: 'pitcher',
    condition: (ctx) => ctx.isKoshien,
    texts: [
      '（甲子園のマウンドに立っている…最高だ）',
      '（全国の舞台…思い切り投げてやる）',
      '（甲子園で投げる夢が叶った…結果で示す）',
    ],
    category: 'emotional',
    weight: 75,
  },

  {
    id: 'pit_late_inning',
    role: 'pitcher',
    condition: (ctx) => ctx.inning >= 7,
    texts: [
      '（終盤…腕を振り切るしかない）',
      '（後2〜3回…ここが正念場だ）',
      '（最後まで投げ切る！）',
    ],
    category: 'situational',
    weight: 65,
  },

  {
    id: 'pit_consecutive_strikeouts',
    role: 'pitcher',
    condition: (ctx) => (ctx.consecutiveStrikeouts ?? 0) >= 2,
    texts: [
      '（連続三振！いいリズムだ、このまま続けよう）',
      '（ノッてきた！次も三振狙いでいく）',
      '（連続で奪っている…自分の調子が良い）',
    ],
    category: 'emotional',
    weight: 90,
  },

  // ============================================================
  // 投手 — 特性系
  // ============================================================

  {
    id: 'pit_trait_ace_koshien',
    role: 'pitcher',
    condition: (ctx) =>
      ctx.pitcherTraits.includes('ace') && ctx.isKoshien,
    texts: [
      '（甲子園のエースとしてのプライドがある！）',
      '（全力を出し切る！これがエースの仕事だ）',
      '（甲子園でこそ真価を発揮する）',
    ],
    category: 'emotional',
    weight: 95,
  },

  {
    id: 'pit_trait_stoic_analyze',
    role: 'pitcher',
    condition: (ctx) => ctx.pitcherTraits.includes('stoic'),
    texts: [
      '（打者のデータを頭に入れながら投げる）',
      '（感情的にならずに、淡々と投げ込む）',
      '（冷静にアウトを積み重ねる）',
    ],
    category: 'analytical',
    weight: 80,
  },

  {
    id: 'pit_trait_hotblooded_bases_loaded',
    role: 'pitcher',
    condition: (ctx) =>
      ctx.pitcherTraits.includes('hotblooded') &&
      ctx.runnersOn === 'bases_loaded',
    texts: [
      '（満塁でも燃える！三振を取ってやる！）',
      '（ピンチほど燃えてくる性格なんだ！）',
      '（全力で投げ込む！打ってみろ！）',
    ],
    category: 'emotional',
    weight: 90,
  },

  // ============================================================
  // 捕手 — 状況系
  // ============================================================

  {
    id: 'cat_calling_sign',
    role: 'catcher',
    condition: (ctx) => ctx.strikes === 2,
    texts: [
      '（決め球は何にする？打者の弱いところを突こう）',
      '（追い込んだ…ここが配球の見せ所）',
      '（2ストライク…次の一球をどう選ぶか）',
    ],
    category: 'analytical',
    weight: 75,
  },

  {
    id: 'cat_bases_loaded',
    role: 'catcher',
    condition: (ctx) => ctx.runnersOn === 'bases_loaded',
    texts: [
      '（満塁…投手を落ち着かせよう）',
      '（ここは投手を信じてサインを出す）',
      '（打者の動きをよく見てサインを決める）',
    ],
    category: 'tactical',
    weight: 80,
  },

  {
    id: 'cat_general',
    role: 'catcher',
    condition: (ctx) => ctx.balls >= 2,
    texts: [
      '（ボールが続いている…投手をリードしよう）',
      '（ここは外角低めで様子を見る）',
      '（カウントを整えることを優先しよう）',
    ],
    category: 'tactical',
    weight: 60,
  },

  {
    id: 'cat_strategic_koshien',
    role: 'catcher',
    condition: (ctx) => ctx.isKoshien && ctx.outs === 2,
    texts: [
      '（甲子園でこの場面…ここが勝負どころだ）',
      '（2アウト…甲子園の集大成をここで出す）',
      '（最後の一球まで全力で配球しよう）',
    ],
    category: 'analytical',
    weight: 85,
  },

  // ============================================================
  // R7-3 拡張: バッター — hook 連動系
  // ============================================================

  {
    id: 'bat_after_hr',
    role: 'batter',
    condition: (ctx) => ctx.hookKind === 'liner_home_run' || ctx.hookKind === 'high_arc_home_run' || ctx.hookKind === 'line_home_run',
    texts: [
      '（入った！最高の当たりだ！）',
      '（スタンドまで届いた…最高の気分！）',
      '（これがホームランか…信じられない）',
      '（全部の力が出た瞬間だ！）',
    ],
    category: 'emotional',
    weight: 100,
  },

  {
    id: 'bat_after_clean_hit',
    role: 'batter',
    condition: (ctx) => ctx.hookKind === 'center_clean_hit' || ctx.hookKind === 'through_infield',
    texts: [
      '（いい当たりだ！思い描いた通りの打球）',
      '（しっかり芯で捉えた！）',
      '（狙い通りのヒット！次につながる）',
    ],
    category: 'tactical',
    weight: 85,
  },

  {
    id: 'bat_after_popup',
    role: 'batter',
    condition: (ctx) => ctx.hookKind === 'infield_popup' || ctx.hookKind === 'weak_contact',
    texts: [
      '（くそ…完全に泳がされた）',
      '（次は絶対に当てる…反省）',
      '（腕が縮んだな…しっかり伸ばして振らないと）',
    ],
    category: 'emotional',
    weight: 80,
  },

  {
    id: 'bat_high_drama',
    role: 'batter',
    condition: (ctx) => ctx.dramaLevel === 'dramatic',
    texts: [
      '（これが甲子園の醍醐味だ！）',
      '（こんな打球が打てるとは思わなかった！）',
      '（全部の練習がこの一打に繋がった！）',
    ],
    category: 'emotional',
    weight: 95,
  },

  {
    id: 'bat_fastball_mindset',
    role: 'batter',
    condition: (ctx) => ctx.pitchType === 'fastball' && ctx.strikes < 2,
    texts: [
      '（ストレートが来たら引っ張る…準備はいい）',
      '（速球が来い…思い切り振る）',
      '（直球一本に絞ってみよう）',
    ],
    category: 'tactical',
    weight: 65,
  },

  {
    id: 'bat_breaking_mindset',
    role: 'batter',
    condition: (ctx) => (ctx.pitchType === 'slider' || ctx.pitchType === 'curve' || ctx.pitchType === 'fork') && ctx.strikes < 2,
    texts: [
      '（変化球が多いな…引っかかるな、しっかり見極めよう）',
      '（フォークか？腕が振られてから見極める）',
      '（スライダーに気をつけろ…低めは特に慎重に）',
    ],
    category: 'analytical',
    weight: 70,
  },

  {
    id: 'bat_consecutive_retired',
    role: 'batter',
    condition: (ctx) => (ctx.consecutiveRetired ?? 0) >= 2,
    texts: [
      '（2打席連続打てていない…今日は何かがおかしい）',
      '（打てない…でも諦めない。必ず修正できる）',
      '（スランプか？でも今ここで変える）',
    ],
    category: 'emotional',
    weight: 80,
  },

  {
    id: 'bat_first_ball_aggressive',
    role: 'batter',
    condition: (ctx) => ctx.balls === 0 && ctx.strikes === 0 && ctx.orderType === 'aggressive',
    texts: [
      '（初球から行く！甘い球を見逃すな）',
      '（積極的に…初球ストライクから振る）',
      '（来た球を全力で！）',
    ],
    category: 'tactical',
    weight: 85,
  },

  {
    id: 'bat_velocity_reaction',
    role: 'batter',
    condition: (ctx) => (ctx.velocity ?? 0) >= 145,
    texts: [
      '（速い！この球速、反応が遅れる）',
      '（140後半か…手元で確認しないと振り遅れる）',
      '（速球…でも対応できる！）',
    ],
    category: 'analytical',
    weight: 75,
  },

  // ============================================================
  // R7-3 拡張: 投手 — hook/状況系
  // ============================================================

  {
    id: 'pit_after_strikeout',
    role: 'pitcher',
    condition: (ctx) => ctx.pitchOutcome === 'swinging_strike' && ctx.strikes === 2,
    texts: [
      '（三振！完璧な決め球だった）',
      '（三振取った…次のバッターも同じ気持ちで）',
      '（空振りを奪えた！調子が戻ってきた）',
    ],
    category: 'emotional',
    weight: 90,
  },

  {
    id: 'pit_control_focus',
    role: 'pitcher',
    condition: (ctx) => ctx.balls >= 2 && ctx.pitcherStamina >= 50,
    texts: [
      '（制球を意識して…丁寧に投げろ）',
      '（ボールカウントが悪い…でも焦るな）',
      '（次の一球、外角低めに集める）',
    ],
    category: 'analytical',
    weight: 75,
  },

  {
    id: 'pit_full_count_tension',
    role: 'pitcher',
    condition: (ctx) => ctx.balls === 3 && ctx.strikes === 2,
    texts: [
      '（フルカウント…四球だけは避ける）',
      '（3-2…ここが山場だ。会心の一球を）',
      '（フルカウント。コースを確かめて、思い切り！）',
    ],
    category: 'situational',
    weight: 95,
  },

  {
    id: 'pit_after_strong_hit',
    role: 'pitcher',
    condition: (ctx) => ctx.hookKind === 'hard_hit_ball' || ctx.hookKind === 'wall_ball_hit' || ctx.hookKind === 'extra_base_drive',
    texts: [
      '（やられた…でも気持ちを切り替える）',
      '（強い当たりを打たれた…修正が必要だ）',
      '（次の打者を取り返す！）',
    ],
    category: 'emotional',
    weight: 85,
  },

  {
    id: 'pit_good_stuff_feeling',
    role: 'pitcher',
    condition: (ctx) => ctx.pitcherStamina >= 70 && ctx.strikes >= 1,
    texts: [
      '（調子いい…ボールが走っている）',
      '（今日は球に力がある！このまま続けよう）',
      '（指先の感覚がいい…制球も安定している）',
    ],
    category: 'analytical',
    weight: 65,
  },

  {
    id: 'pit_trait_intimidate',
    role: 'pitcher',
    condition: (ctx) =>
      ctx.pitcherTraits.includes('intimidating') &&
      (ctx.runnersOn === 'scoring' || ctx.runnersOn === 'bases_loaded'),
    texts: [
      '（プレッシャーをかけてやる…内角に思い切り投げ込む）',
      '（このバッターを威圧する！）',
      '（気迫で押し切る！）',
    ],
    category: 'emotional',
    weight: 85,
  },

  {
    id: 'pit_late_inning_preserve',
    role: 'pitcher',
    condition: (ctx) => ctx.inning >= 8 && ctx.pitcherStamina < 60,
    texts: [
      '（疲れてきたが…最後まで投げ切る）',
      '（体に鞭を打って…ここは絶対に抑える）',
      '（終盤、スタミナが心配だ…でも集中力で補う）',
    ],
    category: 'situational',
    weight: 90,
  },

  {
    id: 'pit_velocity_high',
    role: 'pitcher',
    condition: (ctx) => (ctx.velocity ?? 0) >= 143,
    texts: [
      '（球速が出ている…このまま腕を振り切ろう）',
      '（今日の直球は走っている！）',
      '（フルパワーで投げ込む！）',
    ],
    category: 'analytical',
    weight: 70,
  },

  // ============================================================
  // R7-3 拡張: 捕手 — hook/配球系
  // ============================================================

  {
    id: 'cat_after_hr_allowed',
    role: 'catcher',
    condition: (ctx) =>
      ctx.hookKind === 'liner_home_run' || ctx.hookKind === 'high_arc_home_run',
    texts: [
      '（本塁打を打たれた…配球を見直す必要がある）',
      '（やられた…リードを変えよう）',
      '（次の打者に切り替える。同じパターンは使わない）',
    ],
    category: 'analytical',
    weight: 90,
  },

  {
    id: 'cat_after_strikeout',
    role: 'catcher',
    condition: (ctx) => ctx.pitchOutcome === 'swinging_strike' && ctx.strikes === 2,
    texts: [
      '（三振！このリードがハマった）',
      '（決め球がうまく決まった…次も工夫しよう）',
      '（ナイスピッチ！投手に声をかけよう）',
    ],
    category: 'analytical',
    weight: 85,
  },

  {
    id: 'cat_late_inning_strategy',
    role: 'catcher',
    condition: (ctx) => ctx.inning >= 7 && ctx.runnersOn !== 'none',
    texts: [
      '（終盤の得点圏…ここはひっかけの変化球で）',
      '（ランナーがいる…ここは真っすぐで押すか変化で崩すか）',
      '（この場面の配球が試合を決める）',
    ],
    category: 'tactical',
    weight: 85,
  },

  {
    id: 'cat_first_pitch_strategy',
    role: 'catcher',
    condition: (ctx) => ctx.balls === 0 && ctx.strikes === 0,
    texts: [
      '（初球はどうする…打者の立ち方を見て決めよう）',
      '（初球から積極的に攻めるか、様子を見るか）',
      '（打者の雰囲気を掴んでからサインを出す）',
    ],
    category: 'tactical',
    weight: 60,
  },

  {
    id: 'cat_two_strikes_call',
    role: 'catcher',
    condition: (ctx) => ctx.strikes === 2 && ctx.outs === 2,
    texts: [
      '（2ストライク2アウト…打者を追い詰める絶好機だ）',
      '（2-2アウト…決め球を慎重に選ぼう）',
      '（ここで三振が取れればイニング終了！）',
    ],
    category: 'analytical',
    weight: 90,
  },

  {
    id: 'cat_high_drama_moment',
    role: 'catcher',
    condition: (ctx) => ctx.dramaLevel === 'dramatic' || ctx.dramaLevel === 'high',
    texts: [
      '（この場面、鳥肌が立つ…最高の野球だ）',
      '（ドラマが生まれる瞬間…集中しよう）',
      '（これが本当の野球だ！）',
    ],
    category: 'emotional',
    weight: 80,
  },

];

// ============================================================
// コメントID生成（重複回避用の deterministic ハッシュ）
// ============================================================

/**
 * コンテキストから決定論的なセレクターインデックスを計算する
 * (RNG を使わず、状況だけで決まるため再現性がある)
 */
function computeSelector(ctx: ThoughtCommentContext): number {
  // イニング × アウト × カウント × ランナー状況の組み合わせでハッシュ
  const runnerVal = ctx.runnersOn === 'none' ? 0 : ctx.runnersOn === 'some' ? 1 : ctx.runnersOn === 'scoring' ? 2 : 3;
  return (ctx.inning * 13 + ctx.outs * 7 + ctx.balls * 5 + ctx.strikes * 3 + runnerVal * 11) % 4;
}

// ============================================================
// メイン生成関数
// ============================================================

/**
 * 1球ごとの思考コメントを生成する
 *
 * @param ctx - 思考コメント生成コンテキスト
 * @param speakerNames - 発言者名 { batterName, pitcherName, catcherName? }
 * @returns ThoughtComment[] — 最大3件（batter/pitcher/catcher 各1件まで）
 */
export function generateThoughtComments(
  ctx: ThoughtCommentContext,
  speakerNames: {
    batterName: string;
    pitcherName: string;
    catcherName?: string;
  },
): ThoughtComment[] {
  const results: ThoughtComment[] = [];
  const exclude = ctx.recentCommentIds ?? new Set<string>();
  const selector = computeSelector(ctx);

  for (const role of ['batter', 'pitcher', 'catcher'] as const) {
    const candidates = THOUGHT_COMMENT_DB.filter((p) => {
      if (p.role !== role) return false;
      if (exclude.has(p.id)) return false;
      return p.condition(ctx);
    });

    if (candidates.length === 0) continue;

    // 重み付き選択（除外セット無視でフォールバック）
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let acc = 0;
    // selector で決定論的に選ぶ（% total の座標を selector で決定）
    const target = (selector * total / 4 + total / 8) % total;
    let picked: ThoughtCommentPattern = candidates[0];
    for (const c of candidates) {
      acc += c.weight;
      if (target <= acc) {
        picked = c;
        break;
      }
    }

    // テキストも同様に決定論的に選択
    const textIdx = (selector + ctx.balls + ctx.strikes) % picked.texts.length;
    const text = picked.texts[textIdx];

    const speakerName =
      role === 'batter'
        ? speakerNames.batterName
        : role === 'pitcher'
        ? speakerNames.pitcherName
        : (speakerNames.catcherName ?? '捕手');

    results.push({
      role,
      speakerName,
      text,
      category: picked.category,
    });
  }

  return results;
}

/**
 * 思考コメントのIDセットを返す（重複回避リングバッファ用）
 */
export function extractThoughtCommentIds(comments: ThoughtComment[]): string[] {
  // role + speakerName + category の組み合わせをIDとして使う
  return comments.map((c) => `${c.role}:${c.category}:${c.text.slice(0, 20)}`);
}

/**
 * 思考コメントのリングバッファを更新する（直近N件を保持）
 */
export function updateThoughtCommentRing(
  current: ReadonlySet<string>,
  newIds: string[],
  ringSize = 6,
): Set<string> {
  const arr = [...current, ...newIds];
  const trimmed = arr.slice(-ringSize);
  return new Set(trimmed);
}
