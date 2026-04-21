# Phase 11.5-D/E — 選手評価の言葉化とプロフィール拡充

**作成日:** 2026-04-21
**新規ファイル:**
- `src/ui/labels/ability-narrative.ts`（言葉化ライブラリ）
- `src/engine/types/player-history.ts`（イベント履歴型）
**変更ファイル:**
- `src/ui/projectors/playerProjector.ts`
- `src/ui/projectors/view-state-types.ts`
- `src/engine/types/player.ts`

---

## 1. 目的

### Phase 11.5-D: 能力値の言葉化（最重要）
「ミート 72」などの数値直接表示を廃止し、**言葉で能力を表現する**。
内部では引き続き数値を保持し、プロジェクター層でのみ変換する。

### Phase 11.5-E: 選手プロフィール拡充
- 直近N日間の練習履歴と疲労推移
- 動的に生成される「悩み・心境」
- 時系列のイベント履歴ログ

---

## 2. 設計原則（言葉化）

1. **pure function**: `narrateAbility(stat: string, value: number): string` の形
2. **i18n**: 言葉プールは `ability-narrative.ts` に集約
3. **段階的導入**: 能力カテゴリごとに feature flag で切り替え可能
4. **バリエーション**: 同じランクで複数候補 → seed（選手ID）でランダム固定

---

## 3. 言葉化ランク体系

各能力値（0〜100）を7段階に区切り、各段階に複数の言葉候補を用意する。

```
0〜19:  ランク1（非常に低い）
20〜34: ランク2（低い）
35〜49: ランク3（平均以下）
50〜64: ランク4（平均）
65〜74: ランク5（平均以上）
75〜84: ランク6（高い）
85〜100: ランク7（非常に高い）
```

---

## 4. 言葉プールライブラリ（全能力項目）

```ts
// src/ui/labels/ability-narrative.ts

export type AbilityNarrativeKey =
  // 基礎能力
  | 'stamina' | 'speed' | 'armStrength' | 'fielding' | 'focus' | 'mental'
  // 打撃能力
  | 'contact' | 'power' | 'eye' | 'technique'
  // 投球能力
  | 'velocity' | 'control' | 'pitchStamina';

/** 7段階の言葉プール */
export type NarrativePool = [
  string[], // ランク1（非常に低い）
  string[], // ランク2（低い）
  string[], // ランク3（平均以下）
  string[], // ランク4（平均）
  string[], // ランク5（平均以上）
  string[], // ランク6（高い）
  string[], // ランク7（非常に高い）
];

export const ABILITY_NARRATIVES: Record<AbilityNarrativeKey, NarrativePool> = {

  // ==================== 基礎能力 ====================

  stamina: [
    // ランク1: 0〜19
    ['体力面に深刻な課題を抱えている', '極端なスタミナ不足が気になる'],
    // ランク2: 20〜34
    ['スタミナ不足が目立つ', '長時間の練習に支障をきたすレベル'],
    // ランク3: 35〜49
    ['体力はやや物足りない', '終盤に失速しがちな体力量'],
    // ランク4: 50〜64
    ['体力は標準的', 'スタミナは人並みといったところ'],
    // ランク5: 65〜74
    ['スタミナに余裕が感じられる', '最後まで動き続けられる体力がある'],
    // ランク6: 75〜84
    ['優れたスタミナを持つ', '疲れ知らずの体力は武器になる'],
    // ランク7: 85〜100
    ['怪物的なスタミナの持ち主', '疲労とは無縁のような驚異的な体力'],
  ],

  speed: [
    ['足は重く、走塁に難がある', '俊足とは程遠い鈍足タイプ'],
    ['走力に難がある', '足の速さは平均を大きく下回る'],
    ['走力はやや物足りない', '足が速いとは言えない'],
    ['走力は標準的', '平均的な足の速さ'],
    ['まずまずの走力を持つ', 'ひと際目立つ脚力がある'],
    ['俊足が魅力', 'スピードは球界でも上位クラス'],
    ['驚異的な俊足', 'スピードはリーグ随一と言っても過言ではない'],
  ],

  armStrength: [
    ['肩は非常に弱く、守備面で足を引っ張りかねない', '肩が最大の弱点'],
    ['肩の弱さが目立つ', '送球の弱さは改善が必要'],
    ['肩はやや弱め', '肩力はもう一息'],
    ['肩力は標準的', '肩は平均レベル'],
    ['肩の強さが光る', 'スローイングには安定感がある'],
    ['強肩が際立つ', '肩の強さは守備の大きな武器'],
    ['超強肩の持ち主', '肩の強さは別格。どこからでもアウトにできる'],
  ],

  fielding: [
    ['守備は大きな課題', '守備力は大幅な改善が必要'],
    ['守備に難あり', '失策が多く、守備面での信頼は薄い'],
    ['守備はやや不安定', '守備力はもう一歩'],
    ['守備は及第点', '守備は標準レベルをこなせる'],
    ['安定した守備力がある', '堅実な守備が光る'],
    ['守備は球界でも上位クラス', 'グラブさばきは見事'],
    ['守備の名手', 'どんな打球も処理できる守備の職人'],
  ],

  focus: [
    ['集中力の維持が難しそう', '精神的な集中力に大きな課題'],
    ['集中力に課題がある', '重要な場面での集中力が心配'],
    ['集中力はやや低め', 'ここ一番での集中力がもう一息'],
    ['集中力は標準的', '平均的な集中力'],
    ['集中力がある', '大事な場面でも集中を保てる'],
    ['高い集中力を持つ', '一球に全力を込める集中力は本物'],
    ['恐ろしいほどの集中力', '試合全体を通じて集中が途切れない'],
  ],

  mental: [
    ['精神面に深刻な課題', 'プレッシャーに非常に弱い'],
    ['精神的な弱さが目立つ', 'メンタルの脆さが気になる'],
    ['精神面はやや物足りない', '打たれ弱い面がある'],
    ['精神面は標準的', 'メンタルは人並み'],
    ['精神面で安定している', '精神的な強さが感じられる'],
    ['強靭なメンタルを持つ', 'プレッシャーをバネにできる精神力'],
    ['鋼のメンタルの持ち主', 'どんな逆境も跳ね返す精神力は別格'],
  ],

  // ==================== 打撃能力 ====================

  contact: [
    ['ミート力はほぼ皆無に等しい', 'バットにボールが当たらない'],
    ['ミート力に深刻な課題', 'バットコントロールの改善が急務'],
    ['ミート力はやや物足りない', 'コンタクト率の低さが気になる'],
    ['ミート力は標準的', 'バットコントロールは人並み'],
    ['まずまずのミート力', 'バットに当てる技術がしっかりある'],
    ['鋭いミートセンス', '確実にバットに当てる技術は一級品'],
    ['天才的なミート力', 'どんなボールにも対応できる驚異のバットコントロール'],
  ],

  power: [
    ['線の細さが目立つ', '力負けしそうな非力さ'],
    ['パワー不足が明らか', '長打力は期待できない'],
    ['パワーはやや物足りない', 'もう少し力強さが欲しい'],
    ['並ぐらいのパワー', 'パワーは標準的'],
    ['並を超える力強さがある', 'スタンドを狙える打力がある'],
    ['強烈なパワーが武器', 'スタンドをすっ飛ばす打球を放つ'],
    ['規格外のパワーの持ち主', 'ひと振りでスタンドに放り込む豪打'],
  ],

  eye: [
    ['選球眼は壊滅的', 'どんなボールにも手を出してしまう'],
    ['選球眼に課題あり', 'ボール球を見極める力が乏しい'],
    ['選球眼はやや物足りない', 'ボール球を見送る判断がもう一息'],
    ['選球眼は標準的', '選球眼は人並み'],
    ['選球眼がある', 'ボール球を見極める力がある'],
    ['優れた選球眼の持ち主', '際どい球を冷静に見送れる'],
    ['驚異的な選球眼', 'どんな変化球も見破る目を持つ'],
  ],

  technique: [
    ['打撃技術は未発達', '技術面での基礎が欠けている'],
    ['打撃技術に課題あり', '技術的な改善が必要'],
    ['打撃技術はやや物足りない', '技術的にもう一段階欲しい'],
    ['打撃技術は標準的', '技術は平均レベル'],
    ['打撃技術の高さが光る', '技術的な引き出しを持つ'],
    ['卓越した打撃技術', 'あらゆる打撃技術を持つ万能型'],
    ['打撃の匠', '教科書通りの完璧な打撃技術'],
  ],

  // ==================== 投球能力 ====================

  velocity: [
    ['球速は非常に遅く、打者に研究されやすい', '最速でも軟投派の領域'],
    ['球速不足が気になる', '速球で押すスタイルは難しい'],
    ['球速はやや物足りない', 'もう少しスピードが欲しい'],
    ['球速は標準的', '球速は高校生平均レベル'],
    ['まずまずの球速', '球速は十分なレベルに達している'],
    ['速球が武器', 'キレのある速球で打者を圧倒できる'],
    ['剛速球の持ち主', 'ストレートだけで打者を封じ込めるレベル'],
  ],

  control: [
    ['制球力はほぼ皆無', '四球の山を築くレベル'],
    ['制球に深刻な課題', '制球難は大きな弱点'],
    ['制球はやや不安定', '制球力の改善が課題'],
    ['制球は標準的', '制球は及第点'],
    ['まずまずの制球力', '狙った場所に投げ込める'],
    ['優れた制球力', '針の穴を通すような制球力'],
    ['神がかりの制球力', 'コーナーを完璧に突く制球は芸術的'],
  ],

  pitchStamina: [
    ['投球スタミナは深刻に不足', '序盤から球威が落ちる'],
    ['スタミナ不足が目立つ', '長いイニングの投球は難しい'],
    ['スタミナはやや物足りない', '後半にバテる傾向がある'],
    ['スタミナは標準的', 'スタミナは平均レベル'],
    ['スタミナがある', '終盤でも球威が落ちない'],
    ['豊富なスタミナが武器', '連投にも耐えられる鉄腕'],
    ['鉄腕', '何イニングでも投げ続けられるスタミナの塊'],
  ],
};

// ==================== ユーティリティ ====================

/**
 * 能力値から7段階ランクインデックスを算出する
 */
function valueToRankIndex(value: number): number {
  if (value >= 85) return 6;
  if (value >= 75) return 5;
  if (value >= 65) return 4;
  if (value >= 50) return 3;
  if (value >= 35) return 2;
  if (value >= 20) return 1;
  return 0;
}

/**
 * 能力値から言葉を生成する。
 *
 * @param key    能力キー
 * @param value  能力値（0〜100）
 * @param seed   バリエーション固定用シード（選手IDを推奨）
 * @returns      言葉（文字列）
 */
export function narrateAbility(
  key: AbilityNarrativeKey,
  value: number,
  seed: string = '',
): string {
  const pool = ABILITY_NARRATIVES[key];
  if (!pool) return String(Math.round(value));

  const rankIndex = valueToRankIndex(value);
  const candidates = pool[rankIndex];
  if (!candidates || candidates.length === 0) return String(Math.round(value));

  // seed ベースのハッシュでランダム固定（同じ選手は毎回同じ言葉）
  const hash = simpleHash(seed + key + rankIndex);
  return candidates[hash % candidates.length];
}

/** 簡易ハッシュ関数（pure） */
function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}
```

---

## 5. 投球変化球の言葉化

```ts
// 変化球の言葉化は専用関数で対応

export interface PitchTypeNarrative {
  pitchName: string;       // 球種名（スライダー、カーブ等）
  qualityText: string;     // 品質の言葉
}

export function narratatePitches(
  pitches: Partial<Record<PitchType, number>>,
  seed: string,
): PitchTypeNarrative[] {
  const PITCH_NAMES: Record<PitchType, string> = {
    curve: 'カーブ', slider: 'スライダー', fork: 'フォーク',
    changeup: 'チェンジアップ', cutter: 'カット', sinker: 'シンカー',
  };

  const PITCH_QUALITY: NarrativePool = [
    ['球種として機能していない'], ['ほぼ通用しないレベル'],
    ['まだ荒削りな仕上がり'], ['使えるレベルの変化球'],
    ['キレのある変化球'], ['打者を幻惑する高品質な変化球'],
    ['打者にとって悪夢のような決め球'],
  ];

  return (Object.entries(pitches) as [PitchType, number][])
    .filter(([, val]) => val > 0)
    .map(([type, val]) => ({
      pitchName: PITCH_NAMES[type],
      qualityText: narrateAbility('control', val, seed + type), // 流用
    }));
}
```

---

## 6. プロジェクターへの統合

```ts
// src/ui/projectors/playerProjector.ts の変更（projectPlayer 内）

// 既存の StatRowView（数値バー）に加えて narrative を付与
function makeStatRow(label: string, value: number, max: number, narrativeKey?: AbilityNarrativeKey, seed?: string): StatRowView {
  return {
    label,
    value: Math.round(value * 10) / 10,
    max,
    rank: overallToRank(Math.min(100, Math.round((value / max) * 100))),
    barPercent: Math.min(100, Math.round((value / max) * 100)),
    // 言葉化テキスト（Phase 11.5-D）
    narrative: narrativeKey ? narrateAbility(narrativeKey, value, seed ?? '') : undefined,
  };
}
```

---

## 7. ViewState 型の変更

```ts
// src/ui/projectors/view-state-types.ts

export interface StatRowView {
  label: string;
  value: number;
  max: number;
  rank: AbilityRank;
  barPercent: number;
  /** 言葉化テキスト（Phase 11.5-D）— undefined の場合は数値表示にフォールバック */
  narrative?: string;
}
```

---

## 8. 選手プロフィール拡充（Phase 11.5-E）

### 8.1 追加する型定義

```ts
// src/engine/types/player-history.ts

export type PlayerEventType =
  | 'enrollment'         // 入学
  | 'practice_match'     // 練習試合出場
  | 'tournament_play'    // 大会出場
  | 'tournament_win'     // 大会勝利
  | 'koshien_qualify'    // 甲子園出場
  | 'great_hit'          // 打撃活躍（ホームラン等）
  | 'great_pitch'        // 投球活躍
  | 'injury'             // 怪我
  | 'recovery'           // 回復
  | 'rest'               // 休養
  | 'growth_spurt'       // 急成長
  | 'slump'              // スランプ
  | 'graduation'         // 卒業
  | 'evaluator_noted';   // 評価者に注目された

export interface PlayerEvent {
  type: PlayerEventType;
  date: GameDate;
  /** 表示用テキスト（1〜2文） */
  text: string;
  /** 重要度 */
  importance: 'high' | 'medium' | 'low';
}

/** 直近N日の練習履歴 */
export interface PracticeHistoryEntry {
  date: GameDate;
  menuId: PracticeMenuId;
  menuLabel: string;
  fatigueAfter: number;  // その日の練習後の疲労値
  motivationAfter: number;
}
```

### 8.2 Player 型への追加

```ts
// src/engine/types/player.ts に追加

export interface Player {
  // 既存フィールド...

  /**
   * イベント履歴（Phase 11.5-E）
   * 最大50件を保持し、古いものから削除。
   */
  eventHistory?: PlayerEvent[];

  /**
   * 直近14日間の練習履歴（Phase 11.5-E）
   * 日次処理で先頭に追加し、14件を超えたら末尾を削除。
   */
  practiceHistory?: PracticeHistoryEntry[];
}
```

### 8.3 「悩み・心境」の動的生成

```ts
// src/ui/projectors/playerProjector.ts に追加

type PlayerConcernContext = {
  motivation: number;
  fatigue: number;
  hasInjury: boolean;
  hasRivalAtSamePosition: boolean;
  recentGames: number;        // 直近7日で出場した試合数
  isInTournamentSeason: boolean;
};

const CONCERN_TEMPLATES = {
  // モチベーション低下
  low_motivation_bench: [
    '試合に出られない日が続いている。監督は自分のことをどう思っているんだろう…',
    'ベンチで応援するだけの日々が続く。悔しいが今は力をためるときだ。',
    '同じポジションの{rival}に先を越されている気がする。焦ってはいけないが…',
  ],
  low_motivation_fatigue: [
    '最近は体が重くて思うように動けない。休んだほうがいいのかもしれない。',
    '疲れが抜けない。なんとかしなければ。',
  ],
  // 好調
  high_motivation: [
    '最近は調子がいい。この感覚をもっと続けたい。',
    '試合でもいいプレーができた。自信がついてきた。',
  ],
  // 怪我
  injury: [
    '怪我してしまった。焦らず回復に専念しよう。',
    '早く試合に戻りたい。でも無理は禁物だ。',
  ],
  // 大会前
  pre_tournament: [
    '大会が近づいてきた。今まで積み上げてきたものを出し切るだけだ。',
    '緊張するけど、やるしかない。仲間を信じる。',
  ],
  // 平常
  normal: [
    '今日も練習頑張ろう。',
    '少しずつ成長できているといいな。',
    'チームのために全力を尽くす。それだけだ。',
  ],
};

export function generatePlayerConcern(ctx: PlayerConcernContext, seed: string): string {
  let templateKey: keyof typeof CONCERN_TEMPLATES = 'normal';

  if (ctx.hasInjury) {
    templateKey = 'injury';
  } else if (ctx.isInTournamentSeason) {
    templateKey = 'pre_tournament';
  } else if (ctx.motivation <= 30 && ctx.recentGames === 0) {
    templateKey = 'low_motivation_bench';
  } else if (ctx.fatigue >= 70) {
    templateKey = 'low_motivation_fatigue';
  } else if (ctx.motivation >= 70) {
    templateKey = 'high_motivation';
  }

  const templates = CONCERN_TEMPLATES[templateKey];
  const hash = simpleHash(seed + templateKey);
  return templates[hash % templates.length];
}
```

### 8.4 UI: 選手詳細画面への追加

```
選手プロフィール画面（/play/team/[playerId]）の変更後

┌─────────────────────────────────────────┐
│ 基本情報・コンディション（既存）          │
├─────────────────────────────────────────┤
│ 能力評価（言葉化・Phase 11.5-D）         │
│  打撃: 鋭いミートセンス                  │
│        スタンドを狙える打力              │
│  守備: 安定した守備力                    │
│  走塁: まずまずの走力                    │
├─────────────────────────────────────────┤
│ 今の気持ち（Phase 11.5-E）              │
│  「試合に出られない日が続いている…」     │
├─────────────────────────────────────────┤
│ 直近の練習（Phase 11.5-E）              │
│  4/21 打撃・基礎 　疲労: 45 やる気: 65  │
│  4/20 守備練習 　　疲労: 38 やる気: 60  │
│  4/19 休養 　　　　疲労: 20 やる気: 63  │
├─────────────────────────────────────────┤
│ イベント履歴（Phase 11.5-E）            │
│  4/15 練習試合でホームラン               │
│  4/10 急成長！　パワーが向上             │
│  3/01 入学                              │
└─────────────────────────────────────────┘
```

---

## 9. 他校選手への言葉化

他校選手については、マネージャーのランク・レベルに依存して言葉化の精度が変わる。
詳細は `DESIGN-PHASE11.5-OPPONENT-SCOUTING.md` を参照。

---

## 10. 既存コードへの影響

| ファイル | 変更内容 |
|---|---|
| `src/ui/labels/ability-narrative.ts` | 新規作成（言葉プールライブラリ） |
| `src/engine/types/player-history.ts` | 新規作成（イベント履歴型） |
| `src/engine/types/player.ts` | `eventHistory`、`practiceHistory` フィールド追加（optional） |
| `src/ui/projectors/view-state-types.ts` | `StatRowView.narrative` 追加、`PlayerConcernView`、`PracticeHistoryView` 追加 |
| `src/ui/projectors/playerProjector.ts` | `makeStatRow` に narrative 追加、concern/practiceHistory の生成 |
| `src/engine/calendar/day-processor.ts` | 日次処理で `practiceHistory` に1エントリ追加、`eventHistory` への記録 |
| `src/app/play/team/[playerId]/page.tsx` | 言葉化能力表示、悩み・練習履歴・イベント履歴セクション追加 |

---

## 11. リスク・トレードオフ

- **言葉の品質**: 機械的に生成される文章は時に不自然になる。QAフェーズで言葉プールをブラッシュアップする
- **イベント履歴のサイズ**: 最大50件に制限。古いイベントは削除
- **数値の完全廃止はしない**: 詳細画面では「言葉（下に数値バー）」の形で両立する（数値派ユーザーへの配慮）

---

## 12. 段階実装案

### Phase 11.5-D（2日）: 言葉化MVP
1. `ability-narrative.ts` 作成（全13能力 × 7段階 × 2〜3候補 = 約270パターン）
2. `narrateAbility()` のunit test（各能力・各ランクのパターン確認）
3. `StatRowView.narrative` フィールド追加
4. 自校選手詳細画面で言葉化テキスト表示（数値バーとの併存）

### Phase 11.5-E（2〜3日）: プロフィール拡充
5. `PlayerEvent`、`PracticeHistoryEntry` 型追加
6. 日次処理で `practiceHistory` に記録
7. 主要イベント（試合出場、怪我、急成長等）を `eventHistory` に記録
8. `generatePlayerConcern()` 実装 + テスト
9. 選手詳細画面に「今の気持ち」「練習履歴」「イベント履歴」セクション追加
