# Phase 11-A2 新構想 — 細かい采配 + 選手心理描写

**作成日:** 2026-04-19 21:45 UTC
**状態:** 設計中（実装開始予定）
**背景:** 旧 A2「監督戦術スタイル」（マクロ4種類）は revert。ユーザーフィードバックにより、
1球1球の細かい采配と、各選手の心理描写を重視した方向へ再設計。

---

## 1. 目的

プレイヤーに「監督として選手に細かく指示する楽しさ」と「選手一人一人のドラマ」を提供する。

- **1球単位の細かい采配**: コース狙い・球種狙い・投球パターン指示
- **選手心理描写**: 1球1球の思考を文字で見せる、特性×采配で内容変化
- **心理の試合影響**: 思考内容が実際の数値補正として pitch 結果に反映される

---

## 2. 用語

- **Tactic Order** (戦術指示): 監督が選手に出す指示の1単位
- **Player Monologue** (内心モノローグ): 選手が1球ごとに抱く思考の文字表現
- **Monologue Pattern** (モノローグパターン): 条件×選手特性×采配の組み合わせで選ばれる定型文テンプレート
- **Mental Boost** (心理補正): モノローグが生成された際に付随する数値補正（例: 集中力 +5%）

---

## 3. データモデル

### 3.1 打者への細かい采配 (新規)

```ts
// src/engine/match/tactical-orders-detailed.ts
export type BatterFocusArea = 'inside' | 'outside' | 'low' | 'high' | 'middle';
export type BatterPitchType = 'fastball' | 'breaking' | 'offspeed' | 'any';

export interface BatterDetailedOrder {
  type: 'batter_detailed';
  focusArea?: BatterFocusArea;    // アウトコース狙い 等
  pitchType?: BatterPitchType;    // ストレート狙い 等
  aggressiveness?: 'passive' | 'normal' | 'aggressive'; // 消極/普通/積極
}
```

### 3.2 投手への細かい采配

```ts
export type PitcherFocusArea = 'inside' | 'outside' | 'low' | 'high' | 'edge';
export type PitcherPitchMix = 'fastball_heavy' | 'breaking_heavy' | 'balanced';

export interface PitcherDetailedOrder {
  type: 'pitcher_detailed';
  focusArea?: PitcherFocusArea;
  pitchMix?: PitcherPitchMix;
  intimidation?: 'brush_back' | 'normal';  // 内角攻め
}
```

### 3.3 選手思考パターン DB

```ts
// src/engine/match/monologue/monologue-db.ts
export interface MonologuePattern {
  id: string;

  // マッチ条件
  role: 'batter' | 'pitcher' | 'catcher' | 'fielder' | 'runner';
  situation: SituationCondition;        // ピンチ/チャンス/2アウト等
  traitMatch?: TraitId[];               // 特性の AND 条件
  orderMatch?: OrderCondition;          // 監督の指示との組合せ
  countCondition?: CountCondition;      // 0-2 / 3-1 等

  // 出力
  text: string;                         // "ここは勝負だ！" 等
  mentalEffect: MentalEffect;           // 能力補正

  // 出現確率調整
  weight: number;                       // 1-100
}

export interface MentalEffect {
  contactMultiplier?: number;           // 打撃ミート補正 (1.05 = +5%)
  powerMultiplier?: number;             // パワー補正
  controlMultiplier?: number;           // 投球制球補正
  velocityMultiplier?: number;          // 球速補正
  focusBonus?: number;                  // 集中力 (0-1)
  pressureResistance?: number;          // プレッシャー耐性
}

export interface SituationCondition {
  half?: 'top' | 'bottom' | 'any';
  inning?: { min?: number; max?: number };
  outs?: 0 | 1 | 2 | 'any';
  runnersOn?: 'none' | 'some' | 'scoring' | 'bases_loaded' | 'any';
  scoreDiff?: { role: 'leading' | 'tied' | 'trailing' | 'any'; by?: number };
}

export interface OrderCondition {
  type: 'aggressive' | 'passive' | 'detailed_focus' | 'any';
  focusArea?: BatterFocusArea | PitcherFocusArea;
  pitchType?: BatterPitchType | PitcherPitchMix;
}

export interface CountCondition {
  balls?: number;
  strikes?: number;
}
```

### 3.4 モノローグの生成

```ts
// 1球ごとに呼ばれる
export function generatePitchMonologues(ctx: PitchContext): PitchMonologues {
  // 打者モノローグ
  const batterMono = pickMonologue(
    db.filter((p) => p.role === 'batter'),
    { ...ctx, player: ctx.batter },
  );
  // 投手モノローグ
  const pitcherMono = pickMonologue(
    db.filter((p) => p.role === 'pitcher'),
    { ...ctx, player: ctx.pitcher },
  );
  // 捕手モノローグ (打者視点での配球予想等)
  const catcherMono = pickMonologue(
    db.filter((p) => p.role === 'catcher'),
    { ...ctx, player: ctx.catcher },
  );

  return { batter: batterMono, pitcher: pitcherMono, catcher: catcherMono };
}

function pickMonologue(pool: MonologuePattern[], ctx): MonologuePickResult {
  // 条件に合致するパターンを weight でランダム選択
  // 該当なければ汎用パターンをフォールバック
}
```

---

## 4. 特性 (traits) 拡充

既存の traits に加え、以下の心理特性を追加:

```ts
// 熱血: ピンチでも積極的、監督が消極指示だと「本当は勝負したい...」
// 冷静: 状況分析的、打率ブレが小さい
// 慎重: 消極的指示だと集中力増、積極指示だとプレッシャーで-10%
// 頑固: 監督指示を無視する確率30%
// 忠実: 監督指示時のブースト倍増
// ムラッ気: 好調時は+20%、不調時は-20%
// 勝負師: 2ストライクからのバッティング +10%
// 平常心: 満塁・2アウトでも補正なし
// ビビリ: 大観衆・甲子園で -10%
// 大舞台: 甲子園・決勝で +10%
```

---

## 5. 監督指示の効果メカニズム

### 5.1 打者への「アウトコース狙い」

```
効果: "アウトコース" 範囲内の球を contactChance +15%
       "インコース" 範囲外 (狙ってない) の球を contactChance -10%
       成功率: 選手の batting.eye と batting.technique に依存
         - eye >= 70: 補正通り
         - eye < 50: 補正 50% の効果
         - eye < 30: 補正 25% の効果
```

### 5.2 投手への「変化球多め」

```
効果: 変化球の選択確率を 30% → 55% に
       ただし、投手の pitches 能力が低いとコントロールに影響
         - 変化球能力 >= 70: 通常通り
         - < 50: control -15%
         - < 30: control -30%
```

### 5.3 選手心理の上書き

```
- batter_detailed order (アウトコース狙い) + trait:頑固:
  → 30% の確率で「自分の打撃を貫く」 = 指示無視 + 通常打撃
- pitcher_detailed order (変化球多め) + trait:頑固:
  → 30% の確率でストレート投球
```

---

## 6. UI 設計

### 6.1 試合画面の心理ウィンドウ (新規)

```
┌─────────────────────────────────────────────────┐
│ [スコアボード]                                    │
├─────────────────────────────────────────────────┤
│ [イニングスコア]                                  │
├─────────────────────────────────────────────────┤
│ [実況ログ] (1行のみ、タップで展開)                  │
├─────────────────────────────────────────────────┤
│ 🧠 選手心理 (横スクロール可能)                     │
│ ┌─────────┬─────────┬─────────┐              │
│ │打者      │投手      │捕手      │              │
│ │田中4番   │鈴木1番   │佐藤2番   │              │
│ │"勝負だ！"│"低めだ.."│"外角へ.."│              │
│ └─────────┴─────────┴─────────┘              │
├─────────────────────────────────────────────────┤
│ [采配] + [進行ボタン + 自動進行]                   │
├─────────────────────────────────────────────────┤
│ [ダイヤモンド] [投手] [打者]                       │
└─────────────────────────────────────────────────┘
```

### 6.2 采配UI 拡張

現在の「バント/盗塁/代打/投手交代/マウンド訪問」に加え、**詳細采配モーダル**:

```
[⚙ 細かく指示] ボタン
  → モーダル開く
    - 打者の場合:
      [狙うコース] ○外/○中/○内/○高/○低/○任せる
      [狙う球種] ○速球/○変化球/○緩い球/○任せる
      [積極性]    ○消極/○普通/○積極
      → [指示を出す]
    - 投手の場合:
      [配球] ○外中心/○内中心/○低め/○高め/○edge攻め
      [球種] ○速球多め/○変化球多め/○バランス
      [威嚇] ○通常/○ブラッシュバック（内角攻め）
      → [指示を出す]
```

### 6.3 実況ログアコーディオン + 詳細化

```
新フォーマット: 1行表示 (最大48文字) + アイコン
例 (折り畳み):
  "⚾ 2球目 — ストライク (内角低め 速球 142km/h)"
  (タップ) ↓
  "田中選手の2球目、鈴木投手の142km/hストレートが内角低めに決まる。
   田中選手は振り遅れ、ストライク。 (count 1-1)"

新パラメーター:
- pitch.location: 'inside_high' | 'inside_middle' | 'inside_low' | 'middle_high' | ...
- pitch.speed: number (km/h)
- pitch.type: 'fastball' | 'curveball' | 'slider' | 'changeup' | 'splitter' | ...

結果の詳細化:
- "内野ゴロ (3B)" — 三塁ゴロ
- "犠打成功 - 1塁ランナー2塁へ進塁"
- "ライト前ヒット (rf) - 2塁ランナー生還"
```

### 6.4 デフォルト 1球モード化

- `INITIAL_STATE.runnerMode` を `{ time: 'standard', pitch: 'on' }` に変更
- 新ゲーム初期化時も `pitch: 'on'` がデフォルト

---

## 7. 実装フェーズ分割

### 7-A: 基盤（このPR）
1. デフォルト1球モード化（5分）
2. 実況ログ詳細化（30分）— 既存 pitch データを使って球種/コース/速度を追加
3. 実況ログアコーディオン化（20分）— 折り畳みUI

### 7-B: 心理システム基盤（別PR）
1. MonologuePattern 型定義
2. monologue-db.ts に30-50パターン登録
3. generatePitchMonologues() 実装
4. MatchState / PitchLogEntry に monologues フィールド追加
5. 試合画面に心理ウィンドウUI追加

### 7-C: 細かい采配（別PR）
1. BatterDetailedOrder / PitcherDetailedOrder 型追加
2. 詳細采配モーダルUI
3. pitch 生成ロジックに order 適用
4. 選手能力による成功率変動

### 7-D: 特性拡張（別PR）
1. 心理特性 10種追加
2. 特性 × 監督指示の挙動分岐

---

## 8. 制約

- 既存 MatchState/MatchRunner API 互換維持（追加のみ、削除なし）
- セーブデータ互換性維持
- 既存テスト（当時 612件）全パス
- engine/match/ は慎重に拡張（runner.ts は触らない）
- UI 変更は /play/match/[matchId] に閉じる

---

## 9. 実装優先順位 (朝までの目標)

1. **【必須】** 7-A (基盤) — 朝までに完了
2. **【目標】** 7-B (心理システム基盤) — 朝までにせめて生成ロジックと試合画面表示
3. **【ストレッチ】** 7-C (細かい采配) — 設計書完成＋型定義

---

## 10. モノローグパターン具体例 (20件)

| id | role | 条件 | 特性 | 采配 | text | effect |
|---|---|---|---|---|---|---|
| bat_pinch_fiery | batter | 2out満塁 | 熱血 | any | "ここで決めてやる！" | contact +8% |
| bat_pinch_calm | batter | 2out満塁 | 冷静 | any | "ボールをよく見よう" | eye +10% |
| bat_outside_focus_ok | batter | any | any | outside | "外角一本狙い" | contact +15% (outside) |
| bat_stubborn_ignore | batter | any | 頑固 | detailed | "俺は自分の打撃を貫く" | 指示無効化 |
| pit_fastball_heavy | pitcher | any | any | fastball_heavy | "真っ直ぐ勝負だ" | velocity +3 |
| pit_breaking_heavy_weak | pitcher | any | pitches<50 | breaking_heavy | "変化球苦手なんだよな..." | control -15% |
| cat_pitchout_call | catcher | 走者1塁 | 冷静 | any | "盗塁警戒でピッチアウト配球" | 盗塁刺殺率 +10% |
| bat_fired_up_2strike | batter | 2ストライク | 勝負師 | any | "ここからが本番だ" | contact +10% |
| bat_intimidated | batter | 内角攻め | ビビリ | any | "当てられたくない..." | contact -15% |
| pit_brush_back_threat | pitcher | any | any | brush_back | "内角ギリギリを攻める" | batter_focus_disrupt |
| bat_confused_many_orders | batter | any | trait:混乱しやすい | detailed | "指示が多くて迷う..." | contact -10% |
| pit_stamina_low | pitcher | stamina<50 | any | any | "肩が重い..." | velocity -5, control -10% |
| pit_confidence_on_fire | pitcher | 3連続三振 | any | any | "今日は絶好調だ！" | velocity +2, control +5% |
| bat_slumping | batter | 連続凡退中 | any | any | "今日はなんで打てない..." | contact -8% |
| bat_koshien_stage | batter | 大舞台 | 大舞台 | any | "この日の為に..." | all +10% |
| bat_koshien_crowded | batter | 大舞台 | ビビリ | any | "観客多いな..." | all -5% |
| pit_koshien_ace | pitcher | 大舞台 | ace | any | "俺がチームを勝たせる" | velocity +3 |
| runner_cautious | runner | any | 慎重 | any | "ここは自重しよう" | steal attempt -20% |
| runner_aggressive | runner | any | 熱血 | aggressive | "次の塁を奪う！" | steal attempt +20% |
| fielder_concentration | fielder | ピンチ | 冷静 | any | "落ち着いて取る" | error_rate -30% |

---

## 11. まとめ

- 既存システムを **拡張** するアプローチ（置換でなく加算）
- MonologuePattern DB を YAML/JSON で管理しやすく
- 特性 × 采配 × 状況 の組合せが肝
- 段階的リリースで安全に進める
