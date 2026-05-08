# SPEC v0.48 — バッテリー強化 & 外野守備リアリティ

**対象バージョン**: v0.48.0
**起票**: 2026-05-08
**ステータス**: 設計中（Section 1-2 完了）

---

## Section 1 — 現状分析（コードベース調査）

### 1.1 キャッチャー「要求位置」ロジックの有無

**調査結果: 要求位置は存在しない。**

現在のキャッチャー関連ロジックは `src/engine/psyche/catcher-thinking.ts` に集約されており、
この関数 `generateCatcherThought()` が返すのは **配球方針バイアス（PitchingBias）** のみである。

```ts
// src/engine/psyche/catcher-thinking.ts L33-42
export interface PitchingBias {
  fastballRatioBias: number;    // ストレート確率補正
  strikeZoneBias: number;       // ゾーン内狙い率補正
  preferOutside: boolean;       // 外角優先
  preferInside: boolean;        // 内角優先
}
```

この `PitchingBias` は `src/engine/match/pitch/select-pitch.ts` の `selectPitch()` に渡され、
球種選択とターゲットゾーン選択の確率を補正する（L47, L58-60, L103-104）。

**しかし `target: PitchLocation` はキャッチャーの要求に基づくものではなく、
投手が独自に確率的に選んだ「投球ターゲット」である（L109-149）。**

キャッチャーが「ここに構えた」という `catcherRequestLocation` も、
ミット表示用の `catcherMittPosition` も存在しない。

`generateCatcherThought` の出力（`CatcherThought`）はバイアスと思考テキストのみであり
（L44-57）、座標を持たない。UI の `StrikeZone.tsx` にもミット描画ロジックは皆無。

**影響ファイル一覧**:
- `src/engine/psyche/catcher-thinking.ts`（配球方針生成・要求位置なし）
- `src/engine/match/pitch/select-pitch.ts`（投球先選択・キャッチャー要求を受け取らない）
- `src/ui/match-visual/StrikeZone.tsx`（ミット描画なし）
- `src/ui/projectors/view-state-types.ts`（PitchLogEntry にミット座標フィールドなし）

---

### 1.2 ピッチング誤差（control-error）の計算方法

**ファイル**: `src/engine/match/pitch/control-error.ts`

```ts
// control-error.ts L8-12（コメント）
// errorRange = (100 - control) / 100 × 2.0
// rowError / colError = gaussian(0, errorRange × 0.5)
// actualRow / actualCol = clamp(round(target ± error), 0, 4)
```

```ts
// control-error.ts L18-19
const effectiveControl = Math.max(10, control);  // 最低有効コントロール=10
const errorRange = ((100 - effectiveControl) / 100) * MATCH_CONSTANTS.CONTROL_ERROR_SCALE;
// CONTROL_ERROR_SCALE = 2.0 (constants.ts L7)
const stddev = errorRange * 0.5;
```

誤差適用後の座標は **5×5グリッド（0-4）にクランプ** される（L28-29）。

| control | errorRange | stddev (1σ) |
|---------|-----------|-------------|
| 100     | 0.0       | 0.00        |
| 80      | 0.4       | 0.20        |
| 60      | 0.8       | 0.40        |
| 40      | 1.2       | 0.60        |
| 10（min）| 1.8       | 0.90        |

**ゾーン外（ストライクゾーン外）への球の確率**:

5×5グリッドのうち、ストライクゾーンは row=1〜3, col=1〜3（9マス）。
control=60 の投手が row=2, col=2（真ん中）をターゲットにした場合、
gaussian(2, 0.4) のうち、round() 後に 0 or 4 になる確率は極めて低い（< 3%）。

**重大な問題**: effectiveControl の最低が `10` のため、最も制球の悪い投手でも
ストライクゾーンを大きく外れる暴投はほぼ起きない。
誤差は 5×5グリッドに閉じ込められており、「グリッド外（＝完全暴投）」は不可能。

---

### 1.3 ワイルドピッチ・パスボール処理の欠如

**調査結果: 処理が完全に存在しない。**

#### 証拠 1: `MatchEventType` に型定義はある

```ts
// src/engine/match/types.ts L271-282
export type MatchEventType =
  | 'pitch'
  | 'at_bat_result'
  | 'run_scored'
  | 'pitching_change'
  | 'substitution'
  | 'stolen_base'
  | 'caught_stealing'
  | 'wild_pitch'    // ← 型定義はある
  | 'balk'
  | 'inning_end'
  | 'game_end';
```

#### 証拠 2: `process-pitch.ts` に発生ロジックが一切ない

`src/engine/match/pitch/process-pitch.ts`（L550-905 全体）を確認したが、
`wild_pitch` / `passed_ball` のキーワードは一切現れない。
`updateMatcherAfterPitch()`（L317-439）の `switch(outcome)` も
`called_strike / swinging_strike / foul / ball / in_play` の 5 パターンのみで、
ワイルドピッチ処理ブランチは存在しない。

#### 証拠 3: 走塁システムにも triger がない

`src/engine/physics/resolver/base-running.ts` の `resolveBaseRunning()` 関数の
引数に wild_pitch トリガーは存在せず、`extractRunners()` も通常塁状態からのみ走者を取得する。

#### 証拠 4: 既存検索結果

```
grep -r "wild_pitch|passed_ball" src/
→ src/engine/match/types.ts:279:  | 'wild_pitch'  （型定義のみ）
```

他のファイルへの出現はゼロ。

**結論**: `wild_pitch` は型として予約されているだけで、発生判定・走者進塁・UI通知の
3つが全て未実装。

---

### 1.4 打球分布の現状

**ファイル**: `src/engine/match/pitch/bat-contact.ts`（deprecated）、
実質は `src/engine/physics/bat-ball/index.ts` + `process-pitch.ts`

`generateBatContact()`（bat-contact.ts L55-118）の打球タイプ基本確率（power=50 基準）:

```ts
// bat-contact.ts L57-62
let pGround = 0.40 - deltaFromBase * 0.20;  // power=50 → 0.40
let pLine   = 0.20 + deltaFromBase * 0.10;  // power=50 → 0.20
let pFly    = 0.30 + deltaFromBase * 0.20;  // power=50 → 0.30
let pPopup  = 0.10 - deltaFromBase * 0.10;  // power=50 → 0.10
```

**外野フライ（fly_ball）が「out」になる確率**（`field-result.ts` L61）:

```ts
// field-result.ts L61
const catchChance = MATCH_CONSTANTS.FLY_CATCH_BASE + (fieldingScore / 100) * 0.15;
// FLY_CATCH_BASE = 0.80 (constants.ts L28)
// fielding=50 → catchChance = 0.80 + 0.075 = 0.875
// fielding=80 → catchChance = 0.80 + 0.120 = 0.920
```

**外野フライが「ヒット」になる際の種別**（`field-result.ts` L70-71）:

```ts
// field-result.ts L70-71
const hitType = contact.distance > 80 ? 'double' : 'single';
```

**問題**: フライのヒット率は 8〜20% しかないが、それ以外の問題は下記。

`field-result.ts` は Phase R4 以降 **バント以外では使われない** （L3-11 コメント）。

通常スイングは `process-pitch.ts` L651-700 の「`resolveBatBall` + `resolveFieldResult`」を使用。
`resolveFieldResult` は `field-result.ts` のシンプルモデルで、
打球速度（exitVelocity）・外野手の足速さ・到達距離の物理計算は省略されている。

**外野到達計算**（`physics/resolver/fielding.ts` L141-168 の `selectPrimaryFielder`）:

```ts
// fielding.ts L148-155
for (const [pos, fielderPos] of STANDARD_FIELDER_POSITIONS) {
  const ability = abilities.get(pos) ?? DEFAULT_FIELDER_ABILITY;
  const profile = makeFielderProfile(ability.speedStat);
  const movement = simulateMovement(fielderPos, landingPoint, profile);
  if (best === null || movement.etaMs < best.arrivalTimeMs) {
    best = { position: pos, arrivalTimeMs: movement.etaMs, arrivalPos: landingPoint };
  }
}
```

ここでは `simulateMovement` で物理的な到達計算はしているが、
**`process-pitch.ts` からは `resolvePlay()` が呼ばれておらず、`resolveFieldResult()` が直接呼ばれる**。

実際の処理フロー（L640-700）:

```
resolveBatBall(batBallCtx, rng)   // exit velocity / launch angle / sprayAngle
→ legacyContact = { contactType, speed, distance, direction }
→ resolveFieldResult(legacyContact, ...)  // 旧シンプルモデル！
```

`resolveFieldResult` は `fieldingScore`（1 野手の fielding stat）と打球種類だけで
catchChance を計算しており、外野手の足・距離・打球速度・方向は無視されている。

**外野フライがほぼ出ない問題の根本**は 1.5 節で詳述。

---

### 1.5 外野守備到達計算の使用状況

`physics/resolver/fielding.ts` の `resolveFielding()` は物理的に正確な守備計算を
持っているが、**`process-pitch.ts` のメインフローから呼び出されていない**。

`process-pitch.ts` L636-700 のフローは:
1. `resolveBatBall()` で打球物理量を計算
2. `resolveFieldResult()` でシンプル統計モデルで結果を決定

`resolvePlay()`（physics/resolver/index.ts の本格版）は **test からのみ**呼ばれており、
ゲームエンジン本体には未統合。

```ts
// process-pitch.ts L640-701（通常スイング処理）
const batBallCtx = buildBatBallContext(...);
const { trajectory: rawTrajectory } = resolveBatBall(batBallCtx, rng.derive('bat-ball'));
// ...
const fieldResult = resolveFieldResult(legacyContact, bases, outs, fieldingTeam, batter, rng);
//                 ↑ 旧モデル（fielding stat だけで捕球率決定）
```

`FLY_CATCH_BASE = 0.80`（constants.ts L28）は全フライの 80% をアウトにする固定値。
**外野手の位置・足速さ・打球飛距離の実際の到達可否計算は行われていない**。

---

## Section 2 — 問題の根本原因

### 2.1 キャッチャーミット不在の原因

**原因 A**: キャッチャー要求位置（target location）がデータモデルに存在しない。
`select-pitch.ts` の `target: PitchLocation` はキャッチャーの意図ではなく、
投手が独立して決定した投球先。

**原因 B**: PitchResult に要求位置フィールドが存在しない。

```ts
// 現在の PitchResult（types.ts より）
pitchResult = {
  pitchSelection, targetLocation, actualLocation,
  batterAction, outcome, batContact, ...
}
// catcherRequestLocation が存在しない
```

**原因 C**: `generateCatcherThought()` は配球「方針」（確率補正）を返すだけで
具体的な 1 球ごとの要求コースを返さない設計。
監督の指示反映率（コンプライアンス率）も `applyManagerOrder()` で bias に吸収されており、
UI 上で「指示に従った / 従わなかった」が判別できない。

**原因 D**: StrikeZone.tsx にミット描画コンポーネントが存在しない。

---

### 2.2 ワイルドピッチ・パスボール不在の原因

**原因 A**: `control-error.ts` が 5×5 グリッドにクランプするため、
グリッド外への完全暴投が不可能。
真の暴投（捕手が捕れない球）は行動として実現不能。

**原因 B**: `ball` アウトカムと「暴投になったボール球」が区別されていない。
`processPitch()` は `outcome: 'ball'` を返すが、
その ball がキャッチャーに捕れるかどうかの判定がない。

**原因 C**: キャッチャーの能力（fielding / 敏捷性）が投球結果に全く使われていない。
`getEffectivePitcherParams()` は pitcher の stats のみ参照（L58-89）。
キャッチャーの能力値取得・反映ロジックが存在しない。

**原因 D**: `wild_pitch` はイベント型として宣言されているが、
そのイベントを生成するコードが存在しない（ghost type）。

---

### 2.3 外野フライ・外野ヒット不出現の原因

**原因 A（最重要）**: 本格物理守備モデル `resolvePlay()` が
ゲームエンジン本体から呼ばれていない。
`resolveBatBall()` + `resolveFieldResult()`（旧モデル）の組み合わせで処理されている。

**原因 B**: `resolveFieldResult()` の外野フライ捕球率が固定値。

```ts
// field-result.ts L61
const catchChance = MATCH_CONSTANTS.FLY_CATCH_BASE + (fieldingScore / 100) * 0.15;
// = 0.80 〜 0.95（外野手の足・距離・打球方向無視）
```

`FLY_CATCH_BASE = 0.80` は「普通の外野フライは 8 割がアウト」を意味し、
実際のフライヒット率はわずか 0%〜20%。
さらに batting power=50 の場合 fly_ball 比率は 30% であり、
外野フライヒット = 0.30 × 0.20 = **6%** に過ぎない。

**原因 C**: `resolveBatBall()` の exit velocity・launch angle は正しく計算されているが、
それが fly 系の distance（飛距離）に変換されたあと、
`resolveFieldResult()` の `hitType = distance > 80 ? 'double' : 'single'` (L70) という
粗いルールで片付けられる。
外野手の守備エリア・球場寸法との対比がない。

**原因 D**: `bat-contact.ts` の fly_ball distance 計算（L219-221）:

```ts
// fly_ball の場合
distance = 40 + powerFactor * 60 + rng.next() * 40; // 40-140m
```

power=50 の場合 `40 + 30 + ランダム` = 70〜110m。
ホームラン距離の閾値は `HOME_RUN_DISTANCE = 95m`（constants.ts L21）。
power=50 でも 95m 超えのフライは存在し、これがホームランになる。
しかし外野に届くがホームランではない 70〜95m のフライに対して
「外野手の足で追いつけるか」の計算が `resolveFieldResult()` では行われていない。

**原因 E**: `process-pitch.ts` で `resolveBatBall()` の結果から direction のみ使用し、
distance は `bat-contact.ts` の旧計算（L211-234）の値を継承している。
つまり物理的な飛距離と守備到達計算が整合していない。

---

## Section 3 — 新仕様：シミュレーション設計

### 3.1 キャッチャー要求位置生成

**新規ファイル**: `src/engine/match/pitch/catcher-target-location.ts`

#### 概念

1 球ごとに、キャッチャーが「ここに投げてほしい」と要求する **`catcherRequest: PitchLocation`** を生成する。
投手は `catcherRequest` を受け入れるか（首を縦に振る）、独自の判断で変える（首振り）かを決める。
最終的な `target` が投手の意図、`actualLocation` が実際の着弾。

#### 型定義

```ts
// src/engine/match/pitch/catcher-target-location.ts

import type { PitchLocation } from '../../match/types';
import type { RNG } from '../../core/rng';
import type { CatcherProfile } from '../../types/player';
import type { CatcherDetailedOrder } from '../../match/types';

/**
 * キャッチャーの 1 球あたり要求位置コンテキスト
 */
export interface CatcherRequestContext {
  /** キャッチャープロフィール */
  catcherProfile: CatcherProfile;
  /** キャッチャー実効 fielding 0-100 */
  catcherFielding: number;
  /** キャッチャー実効 mental 0-100 */
  catcherMental: number;
  /** 投手の現在コントロール 0-100 */
  pitcherControl: number;
  /** 投手スタミナ 0-100 */
  pitcherStamina: number;
  /** カウント */
  count: { balls: number; strikes: number };
  /** 監督の詳細指示（省略可） */
  managerOrder?: CatcherDetailedOrder;
  /** 監督指示コンプライアンス率（省略時 = 0.9） */
  managerComplianceRate?: number;
}

/**
 * キャッチャーの要求生成結果
 */
export interface CatcherRequestResult {
  /** キャッチャーが要求するコース（5×5グリッド） */
  requestLocation: PitchLocation;
  /**
   * 監督指示が反映されたか
   * true = 監督の意図通りのコースを要求
   * false = キャッチャー独自の判断
   */
  isManagerOrderApplied: boolean;
  /**
   * 要求の質スコア 0-1
   * 1.0 = キャッチャーが最適なコースを要求
   * 0.5 = 能力制限で妥協したコース
   */
  requestQuality: number;
}

/**
 * キャッチャーの 1 球あたり要求位置を生成する
 * 純粋関数（Math.random() 不使用）
 *
 * @param ctx  要求生成コンテキスト
 * @param rng  乱数生成器
 */
export function generateCatcherRequest(
  ctx: CatcherRequestContext,
  rng: RNG,
): CatcherRequestResult;
```

#### 設計詳細

**要求位置の決定ロジック**:

```
1. callingAccuracy(配球精度) によりベースコースを決定
   - 高精度(>=70): 打者弱点コースを狙う最適座標
   - 中精度(40-70): ±1マスの誤差あり
   - 低精度(<40): ランダム成分が大きい

2. managerOrder がある場合:
   - outside/inside/high/low の指示を座標に変換
   - complianceRate(default=0.90) で指示に従うか判定
   - 従わない場合はキャッチャー独自の要求に戻る
   - isManagerOrderApplied = 従ったかどうか

3. requestQuality の計算:
   = (callingAccuracy / 100) × 0.6 + (catcherMental / 100) × 0.4
   × (pitcherControl / 100) の制限: キャッチャーが要求しても
     投手の制球が悪ければ質は低くなる
```

---

### 3.2 ピッチャー首振り判定

**新規ファイル**: `src/engine/match/pitch/pitcher-shake-off.ts`

#### 概念

キャッチャーの要求を投手が受け入れる（頷く）か首を振るかを決定する。
首を振った場合、投手は独自の球種・コースを選ぶ。

#### 型定義

```ts
// src/engine/match/pitch/pitcher-shake-off.ts

import type { PitchLocation } from '../../match/types';
import type { RNG } from '../../core/rng';

export interface ShakeOffContext {
  /** キャッチャー要求コース */
  catcherRequest: PitchLocation;
  /** キャッチャー要求球種（省略可: 球種まで要求しない場合） */
  catcherRequestPitch?: string;
  /** 投手のメンタル 0-100 */
  pitcherMental: number;
  /** 投手の経験（pitchCountInGame で代替） */
  pitcherExperience: number;
  /**
   * バッテリー信頼関係スコア 0-100
   * = (pitcher.mental + catcher.leadership) / 2 の近似
   */
  batteryTrust: number;
  /** 投手の特性 */
  pitcherTraits: readonly string[];
}

export interface ShakeOffResult {
  /** 首を振ったか */
  isShakeOff: boolean;
  /**
   * 採用された target コース
   * 首を縦に振った場合 = catcherRequest と同一
   * 首を振った場合 = 投手独自の判断
   */
  targetLocation: PitchLocation;
}

/**
 * 投手の首振り判定を行う
 *
 * @param ctx      判定コンテキスト
 * @param rng      乱数生成器
 */
export function decidePitcherShakeOff(
  ctx: ShakeOffContext,
  rng: RNG,
): ShakeOffResult;
```

#### 首振り確率の計算式

```
baseShakeOffRate = 0.10  // 通常 10% が首を振る

ボーナス/ペナルティ:
  batteryTrust >= 80: -0.05（信頼が厚いほど首を振らない）
  batteryTrust <= 30: +0.15（信頼が薄いと自己判断多）
  stubborn 特性: +0.20
  pitcherMental < 40: +0.10（精神的に不安定）
  pitcherExperience > 80球: +0.08（疲労で判断力低下）

shakeOffRate = clamp(baseShakeOffRate + ボーナス合計, 0.02, 0.60)
```

---

### 3.3 監督指示反映率

**新規ファイル**: `src/engine/match/pitch/manager-order-compliance.ts`

#### 概念

監督がサインを出した場合、キャッチャーがそれを守るかどうかの判定。
既存の `applyManagerOrder()`（catcher-thinking.ts）は「反映したとして bias を計算」していたが、
新設計では「反映したか否か」を明示的に記録してUI表示に使う。

#### 型定義

```ts
// src/engine/match/pitch/manager-order-compliance.ts

import type { CatcherDetailedOrder } from '../../match/types';

export interface ComplianceContext {
  /** 監督指示 */
  order: CatcherDetailedOrder;
  /** キャッチャーのリーダーシップ 0-100 */
  catcherLeadership: number;
  /** キャッチャーの性格 */
  catcherPersonality: 'aggressive' | 'cautious' | 'analytical';
  /** 状況プレッシャー 0-100 */
  situationPressure: number;
}

export interface ComplianceResult {
  /** 指示に従ったか */
  complied: boolean;
  /** 実効コンプライアンス率（0-1） */
  effectiveRate: number;
  /**
   * 不服従の理由（complied=false のとき）
   * 'personality': 性格的に従いたくない
   * 'situation': 状況判断で変えた
   * 'distrust': 監督への不信
   */
  reason?: 'personality' | 'situation' | 'distrust';
}

/**
 * 監督指示への従否を判定する
 *
 * 従否率の計算:
 *   baseRate = SIGN_COMPLIANCE_BASE(=0.90)
 *   慎重派 + 攻め指示 → -0.15（性格と合わない）
 *   積極派 + 様子見指示 → -0.10
 *   leadership < 30 → +0.05（指示に素直）
 *   situationPressure > 70 → -0.10（プレッシャーで自己判断）
 */
export function computeComplianceResult(
  ctx: ComplianceContext,
  rng: import('../../core/rng').RNG,
): ComplianceResult;
```

---

### 3.4 ワイルドピッチ・パスボール

**新規ファイル**: `src/engine/match/pitch/battery-error.ts`

#### 概念

1球ごとに「暴投（WP）」または「パスボール（PB）」が起きるか判定。
発生した場合は走者が進塁する（`process-pitch.ts` の `updateMatcherAfterPitch` で処理）。

#### 設計原則

- **ワイルドピッチ（WP）**: 投手の暴投。ピッチャーの control が低い + ボール球判定のとき。
- **パスボール（PB）**: キャッチャーの捕球ミス。ボール球かつキャッチャーの fielding が低いとき。
- **グリッド外拡張**: WP は 5×5グリッド外にも着弾できる（row=-1〜5, col=-1〜5）。

#### 型定義

```ts
// src/engine/match/pitch/battery-error.ts

import type { PitchLocation } from '../../match/types';
import type { RNG } from '../../core/rng';

export type BatteryErrorType = 'wild_pitch' | 'passed_ball';

export interface BatteryErrorContext {
  /** 投球の実際着弾コース（制球誤差適用後） */
  actualLocation: PitchLocation;
  /** 投球アウトカム（'ball' のときのみ WP/PB 判定） */
  outcome: 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'foul_bunt' | 'in_play';
  /** 投手の実効コントロール 0-100 */
  pitcherEffectiveControl: number;
  /** キャッチャーの fielding 0-100 */
  catcherFielding: number;
  /** キャッチャーの agility（base.speed で代替） 0-100 */
  catcherAgility: number;
  /** ランナーの有無（WP/PBの意味がある場合のみ発生させる） */
  hasRunners: boolean;
  /** 球種（変化球は捕球ミスしやすい） */
  pitchType: string;
}

export interface BatteryErrorResult {
  /** エラーが発生したか */
  occurred: boolean;
  /** エラー種別（occurred=false のとき undefined） */
  type?: BatteryErrorType;
  /**
   * 走者進塁数（通常 1 塁ずつ）
   * occurred=true かつ hasRunners=true のとき 1
   */
  advanceBases: number;
}

/**
 * ワイルドピッチ・パスボール発生を判定する
 *
 * 発生確率の計算:
 *   WP発生条件: outcome === 'ball'
 *   wpBaseRate = max(0, (50 - pitcherEffectiveControl) / 500)
 *     = control=30 → 0.04 (4%)
 *     = control=50 → 0.00 (基準: control>=50 では WP はほぼ起きない)
 *   変化球補正: fork/curve/slider → +0.005〜+0.010
 *
 *   PB発生条件: outcome === 'ball' かつ WP でなかった場合
 *   pbBaseRate = max(0, (50 - catcherFielding) / 1000)
 *     = fielding=30 → 0.02 (2%)
 *     = fielding=70 → 0.00
 *   変化球補正: +0.003〜+0.008
 *
 * 合算すると「素晴らしいバッテリー」では 1 試合 0〜1 回程度に収まる。
 * 制球の悪い投手 + 未熟なキャッチャーでは 1 試合 2〜4 回の発生もありえる。
 */
export function judgeBatteryError(
  ctx: BatteryErrorContext,
  rng: RNG,
): BatteryErrorResult;
```

#### 走者進塁処理の拡張

`process-pitch.ts` の `updateMatcherAfterPitch()` に `outcome === 'ball' && batteryError.occurred` のブランチを追加:

```ts
// process-pitch.ts 追加ロジック（擬似コード）
if (outcome === 'ball') {
  const batteryError = judgeBatteryError(ctx, rng);
  if (batteryError.occurred && batteryError.advanceBases > 0) {
    bases = advanceRunnersOnBatteryError(bases, batteryError.advanceBases);
    // WP/PB ログ追記
    nextState = { ...nextState, log: [...nextState.log, {
      type: batteryError.type,
      description: batteryError.type === 'wild_pitch' ? '暴投' : 'パスボール'
    }]};
  }
}
```

---

### 3.5 打球シミュレーション再検証

#### 問題

`process-pitch.ts` の通常スイングフロー:

```
resolveBatBall() → sprayAngle → legacyContact.direction（OK）
bat-contact.ts の distance 計算 → resolveFieldResult()（問題：固定 FLY_CATCH_BASE）
```

#### 改善方針

**Phase 1 修正（v0.48）**:

`resolveFieldResult()` の外野フライ処理に外野手能力・距離チェックを追加:

```ts
// field-result.ts の修正案（fly_ball セクション）
if (contact.contactType === 'fly_ball') {
  // 外野手の守備エリアから飛距離を考慮した到達判定
  const fielderZone = getOutfielderZone(contact.direction);
  const outfielderAbility = getOutfielderAbility(fieldingTeam, fielderZone);

  // 飛距離が外野手のカバー範囲外なら自動ヒット（距離ベース）
  const maxReachDistance = 70 + (outfielderAbility.speed / 100) * 25; // 70-95m
  if (contact.distance > maxReachDistance) {
    // 外野手が追いつけない → ヒット確定
    const hitType = contact.distance > 90 ? 'triple' : 'double';
    return { type: hitType, fielder: fielderZone, isError: false };
  }

  // 追いつける範囲内: 捕球確率（従来の FLY_CATCH_BASE を踏襲）
  const catchChance = FLY_CATCH_BASE + (outfielderAbility.fielding / 100) * 0.15;
  if (!rng.chance(catchChance)) {
    return { type: 'single', fielder: fielderZone, isError: false };
  }
  // アウト or 犠飛
  ...
}
```

**Phase 2 修正（v0.49 以降）**:
- `resolvePlay()`（physics/resolver/index.ts）を `process-pitch.ts` に統合
- バント以外の全打球を物理モデルで処理

#### 外野手カバー範囲の定義

| 外野ポジション | カバー方向 | maxReachBase |
|--------------|-----------|-------------|
| left         | 0°-30°    | 68m         |
| center       | 30°-60°   | 72m         |
| right        | 60°-90°   | 68m         |

speed=100 の外野手は +25m = 93〜97m まで追いつける（ホームラン距離95m と重複するため微調整要）。

---
