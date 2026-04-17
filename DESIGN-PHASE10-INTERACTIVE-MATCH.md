# Phase 10: インタラクティブ試合画面 — 1球1球の采配

**対象**: 自校の公式戦における「監督の采配」を、1球単位で楽しめるインタラクティブ試合UIの導入
**前提**: 既存の `engine/match/` 層は全て完成している（`processPitch`, `processAtBat`, `runGame`, `TacticalOrder` 型）
**非目的**: 他校同士の試合のインタラクティブ化（引き続き `simulateTournamentRound` の確率モデルで高速処理）

---

## 1. 現状分析と問題提起

### 1.1 既存アセット（活かせるもの）

| レイヤー | ファイル | 状態 |
|---------|---------|------|
| 1球シミュレーション | `engine/match/pitch/process-pitch.ts` | ✅ 完成・純関数 |
| 打席シミュレーション | `engine/match/at-bat.ts` | ✅ 完成 |
| イニング処理 | `engine/match/inning.ts` | ✅ 完成 |
| 試合全体実行 | `engine/match/game.ts` | ✅ 完成（`TacticsProvider` 対応） |
| 采配型定義 | `engine/match/types.ts` (`TacticalOrder`) | ✅ 10種類の采配定義済み |
| サイン遵守判定 | `engine/match/tactics.ts` (`willObeySign`) | ✅ 性格・自信連動 |
| CPU自動采配 | `engine/match/tactics.ts` (`cpuAutoTactics`) | ✅ 相手CPUに使える |
| エラーチェック | `validateOrder` | ✅ 盤面整合性を事前検証 |

### 1.2 未実装領域

| 領域 | 問題 |
|------|------|
| 大会フロー統合 | `world-ticker.ts` は `reputation` 差だけで勝敗を即決。1球エンジンが一度も呼ばれない |
| 試合画面UI | 存在しない。試合日は結果モーダルが出るだけ |
| 試合状態の永続化 | `MatchState` を途中保存する仕組みなし（長い試合の中断不可） |
| 演出・アニメーション | 未定義 |

### 1.3 設計上の根本課題

**「1球ずつ監督がサインを出す」を文字通り実装すると操作負荷が大きすぎる**。
9回 × 3アウト × 両チーム × 約4〜5球/打席 ≈ 約200〜300球 / 試合。
監督が200回サインを出すのは現実の監督でもやらない。

**現実の監督の采配頻度**:
- 打席開始時のサイン（基本姿勢、バント等）
- ランナーが出た時（盗塁、ヒットエンドラン、送りバント）
- ピンチ時（マウンドビジット、継投）
- チャンスに代打

つまり「局面が変わったとき」にだけ采配する。この現実に合わせる。

---

## 2. 設計方針（4つの基本原則）

### P1. **打席単位の采配**が基本、1球介入はオプション

- デフォルトは「打席が始まる前に1回だけサインを選ぶ」
- 1球ごとの細かい操作は `詳細モード` でオンにできる（コアファン向け）
- これにより操作回数を現実的に（1試合あたり 約60〜80回 → 慣れれば 20〜30回）

### P2. **"おまかせ進行"を常時併設**

- 「このイニングは自動で進めて」「1回ずつストップ」「打席ごと」「1球ごと」の4段階スピード
- 勝負所（チャンス、ピンチ、同点、9回裏等）では自動的に一時停止し、監督の判断を求める
- ユーザーが **いつでもおまかせに切り替え可能**、いつでも復帰可能

### P3. **監督体験の中核は"読み合い"と"決断"**

派手な演出より、以下の情報を的確に見せることを優先：
- 投手のスタミナ・球数・心境
- 打者の調子・得意コース
- ランナーの走力・盗塁の成否予測
- ベンチの残り駒と継投プラン

この情報をもとに `間`（pause）を取って考える時間を作る。

### P4. **エンジンは書き換えない**

- `runGame()` 自体は壊さない（既存テスト 523 件を壊さないため）
- 新しく **試合ランナー（MatchRunner）** を作り、`processFullInning` ではなく `processAtBat` を1打席ずつ外部から呼ぶ
- サインは `TacticsProvider` として渡す既存のインターフェイスに乗せる

---

## 3. アーキテクチャ

### 3.1 レイヤー図

```
┌─────────────────────────────────────────────────┐
│  [UI] /play/match/[matchId] 試合画面             │
│  ├─ MatchHeader (スコア・イニング・カウント)      │
│  ├─ DiamondView (塁・走者)                      │
│  ├─ PitcherPanel (投手情報)                     │
│  ├─ BatterPanel (打者情報)                      │
│  ├─ TacticsBar (采配ボタン群) ← 監督の入力       │
│  ├─ LogTicker (最近の1球ログ)                   │
│  └─ ProgressControls (速度選択・一時停止)        │
└─────────────────────────────────────────────────┘
                   ↕ (Zustand)
┌─────────────────────────────────────────────────┐
│  [Store] useMatchStore                          │
│  ├─ matchState: MatchState (既存の型)           │
│  ├─ runnerMode: 'manual' | 'auto' | 'mixed'     │
│  ├─ pauseReason: PauseReason | null             │
│  ├─ pendingOrder: TacticalOrder | null          │
│  └─ pitchLog: PitchLogEntry[]                   │
└─────────────────────────────────────────────────┘
                   ↕
┌─────────────────────────────────────────────────┐
│  [新規] MatchRunner (engine/match/runner.ts)    │
│  - 外部から 1球 / 1打席 / 1イニング 進行制御    │
│  - キーブレイクイベントの検知（ピンチ等）        │
│  - onOrderRequired コールバックで UI と通信     │
└─────────────────────────────────────────────────┘
                   ↕
┌─────────────────────────────────────────────────┐
│  [既存・無変更] engine/match/                    │
│  processPitch / processAtBat / tactics          │
└─────────────────────────────────────────────────┘
                   ↕
┌─────────────────────────────────────────────────┐
│  [統合] world-ticker.ts 拡張                     │
│  プレイヤー試合日 → interactiveMatchPending     │
│  試合開始ボタン → /play/match/[matchId] 遷移    │
└─────────────────────────────────────────────────┘
```

### 3.2 新規ファイル一覧

```
src/
├─ engine/match/
│  └─ runner.ts                      ← 新規: MatchRunner クラス
├─ stores/
│  └─ match-store.ts                 ← 新規: 試合画面用ストア
├─ app/play/match/[matchId]/
│  └─ page.tsx                       ← 新規: 試合画面
├─ ui/match/
│  ├─ Diamond.tsx                    ← 新規: 塁・走者の可視化
│  ├─ PitcherPanel.tsx
│  ├─ BatterPanel.tsx
│  ├─ TacticsBar.tsx
│  ├─ LogTicker.tsx
│  ├─ PitchVisualizer.tsx            ← 新規: 5×5 グリッドの投球位置
│  ├─ PauseBanner.tsx
│  └─ match.module.css
└─ ui/projectors/
   └─ matchProjector.ts              ← 新規: MatchState → MatchViewState
```

### 3.3 変更ファイル（最小限）

```
src/
├─ engine/world/world-ticker.ts     ← 自校の試合日はインタラクティブモード分岐
├─ app/play/page.tsx                ← 試合日の "試合を始める" ボタン
└─ stores/world-store.ts            ← 進行中の MatchState を保持
```

---

## 4. 核心データ構造

### 4.1 `TacticalOrder`（既存・再利用）

```typescript
// 既存の型をそのまま使う（engine/match/types.ts 済み）
type TacticalOrder =
  | { type: 'none' }
  | { type: 'bunt'; playerId: string }
  | { type: 'steal'; runnerId: string }
  | { type: 'hit_and_run'; runnerId: string }
  | { type: 'intentional_walk' }
  | { type: 'pitching_change'; newPitcherId: string }
  | { type: 'pinch_hit'; outPlayerId: string; inPlayerId: string }
  | { type: 'pinch_run'; outPlayerId: string; inPlayerId: string }
  | { type: 'defensive_sub'; ... }
  | { type: 'mound_visit' };
```

### 4.2 新規: `RunnerMode`

```typescript
export type RunnerMode =
  | 'pitch_by_pitch'       // 1球ごとに停止（詳細モード）
  | 'at_bat_by_at_bat'     // 打席開始時に停止（標準）
  | 'inning_by_inning'     // イニング終わりに停止（ライト）
  | 'full_auto'            // 自動最後まで（勝負所だけ止まる）
  | 'key_moments_only';    // 勝負所のみ停止（最速 + 見どころ確保）
```

### 4.3 新規: `PauseReason`（なぜ止まったか）

```typescript
export type PauseReason =
  | { kind: 'at_bat_start'; batterId: string }
  | { kind: 'pitch_start' }
  | { kind: 'inning_end' }
  | { kind: 'scoring_chance'; detail: string }  // 得点圏、1死3塁など
  | { kind: 'pinch'; detail: string }           // 満塁、2死2塁3塁など
  | { kind: 'pitcher_tired'; staminaPct: number }
  | { kind: 'close_and_late'; inning: number }  // 7回以降で1点差以内
  | { kind: 'match_end' };
```

### 4.4 新規: `MatchViewState`（UI用）

```typescript
export interface MatchViewState {
  // スコアボード
  inningLabel: string;         // "7回裏"
  outsLabel: string;           // "2アウト"
  count: { balls: number; strikes: number };
  score: { home: number; away: number };
  inningScores: { home: number[]; away: number[] };

  // ダイヤモンド
  bases: {
    first: { runnerName: string; speedClass: 'fast' | 'normal' | 'slow' } | null;
    second: { ... } | null;
    third: { ... } | null;
  };

  // 現在の対戦
  pitcher: {
    name: string;
    pitchCount: number;
    staminaPct: number;
    staminaClass: 'fresh' | 'normal' | 'tired' | 'exhausted';
    moodLabel: string;
    availablePitches: { type: PitchType; level: number }[];
  };
  batter: {
    name: string;
    battingAvg: string;  // "2-3" 今日の成績
    overall: number;
    moodLabel: string;
    trait: string | null; // "積極打法" など
  };

  // ベンチ（代打・継投候補）
  availableRelievers: { id: string; name: string; staminaPct: number }[];
  availablePinchHitters: { id: string; name: string; overall: number }[];

  // 直近のログ
  recentPitches: PitchLogEntry[];

  // 采配可能性
  canBunt: boolean;        // ランナーが一塁にいるか等
  canSteal: boolean;
  canPinchHit: boolean;
  canChangePitcher: boolean;

  // 一時停止中？
  pauseReason: PauseReason | null;

  // 進行モード
  runnerMode: RunnerMode;
}
```

---

## 5. MatchRunner 設計

### 5.1 責務

**既存の `runGame` を分解し、UI と交互にターンを回す**。

```typescript
// engine/match/runner.ts

export class MatchRunner {
  private state: MatchState;
  private opponentTactics: (state: MatchState, rng: RNG) => TacticalOrder;

  constructor(
    initialState: MatchState,
    opponentTactics: (state: MatchState, rng: RNG) => TacticalOrder,
  ) { ... }

  /** 現在の状態を取得 */
  getState(): MatchState;

  /** このタイミングで停止すべきか判定（PauseReason を返す） */
  shouldPause(mode: RunnerMode): PauseReason | null;

  /** 監督の采配を適用 */
  applyPlayerOrder(order: TacticalOrder): { applied: boolean; reason?: string };

  /** 1球処理（player攻撃時の打席内の1球） */
  stepOnePitch(rng: RNG): { pitchResult: PitchResult; events: MatchEvent[] };

  /** 1打席完了まで進める */
  stepOneAtBat(rng: RNG): { atBatResult: AtBatResult; events: MatchEvent[] };

  /** 1イニング完了まで進める */
  stepOneInning(rng: RNG): { innings: InningResult[]; events: MatchEvent[] };

  /** 試合終了まで一気に進める（自動モード） */
  runToEnd(rng: RNG): MatchResult;

  /** 試合終了判定 */
  isOver(): boolean;
  getResult(): MatchResult | null;
}
```

### 5.2 `shouldPause` ロジック（勝負所検知）

```typescript
shouldPause(mode: RunnerMode): PauseReason | null {
  if (mode === 'pitch_by_pitch') return { kind: 'pitch_start' };
  if (mode === 'at_bat_by_at_bat') return { kind: 'at_bat_start', batterId: ... };
  if (mode === 'inning_by_inning' && this.state.outs === 3) return { kind: 'inning_end' };

  // key_moments_only と full_auto 共通の「勝負所」判定
  if (mode === 'key_moments_only' || mode === 'full_auto') {
    // 満塁 or 2死3塁 の攻防
    if (isPinch(this.state)) return { kind: 'pinch', detail: ... };
    // 7回以降で1点差以内
    if (this.state.currentInning >= 7 && Math.abs(scoreDiff) <= 1) {
      return { kind: 'close_and_late', inning: ... };
    }
    // 投手スタミナ 20% 以下（継投判断を促す）
    if (pitcher.staminaPct < 0.2) return { kind: 'pitcher_tired', ... };
  }
  return null;
}
```

**勝負所の定義（初期実装）:**

| シチュエーション | 条件 |
|----------------|------|
| チャンス | 自校攻撃中、得点圏に走者 |
| 大チャンス | 自校攻撃中、満塁 or 1死以下で得点圏 |
| ピンチ | 相手攻撃中、得点圏に走者 |
| 大ピンチ | 相手攻撃中、満塁 or 2点差以内で得点圏 |
| クロスゲーム | 7回以降で1点差以内 |
| 継投判断 | 自校投手 stamina < 20% |

### 5.3 `applyPlayerOrder` のフロー

```
監督が UI で采配を選択
   ↓
applyPlayerOrder(order)
   ↓
validateOrder(order, state) で妥当性チェック
   ↓ invalid
   return { applied: false, reason: "..." }
   ↓ valid
   (代打・継投ならすぐ MatchState を更新)
   (バント・盗塁などは次の打席/投球で processPitch に渡る)
   ↓
pendingOrder に格納
   ↓
次の stepOnePitch / stepOneAtBat 呼び出し時に自動的に TacticalOrder として注入
```

---

## 6. UIレイアウト設計

### 6.1 画面モックアップ（ASCII）

```
┌──────────────────────────────────────────────────────────────────┐
│  [桜葉] 2 - 1 [佐渡北商業]     7回裏  2アウト  B:2 S:1           │
│  1│2│3│4│5│6│7│8│9 │R│H│                                        │
│  0│1│0│0│0│1│0│ │  │2│4│  桜葉                                  │
│  0│0│0│0│1│0│ │ │  │1│3│  佐渡北商業                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│                     ⚾  [投球コース 5×5]                           │
│                         □ □ □ □ □                                │
│           [2塁]         □ □ □ □ □   ← 直近の球                   │
│         ▲田中           □ □ ■ □ □                                │
│     [3塁]  [1塁]        □ □ □ □ □                                │
│                         □ □ □ □ □                                │
│              ▼山田                                                │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│  投手: 佐藤 (エース)              打者: 山田 (4番・三塁)           │
│  球数: 87球  スタミナ: ▓▓▓▓▓▓░░░░ 62%     打率: 2-3 (安打1)    │
│  調子: 普通   自信: 高い                  オバオール: 78           │
│  持ち球: 直球★★★ スライダー★★ カーブ★   特性: 勝負強い        │
├──────────────────────────────────────────────────────────────────┤
│  ⏸  一時停止中 — 勝負所: 7回裏 1点リード 2死満塁                  │
│                                                                   │
│  [采配を選択]                                                      │
│  ┌────────────┬────────────┬────────────┬────────────┐         │
│  │ そのまま    │ 敬遠        │ 代打         │ 投手交代     │         │
│  │ (サインなし) │ (ピッチャー側) │ (7番 → 15番) │ (リリーフ)   │         │
│  └────────────┴────────────┴────────────┴────────────┘         │
│                                                                   │
│  [進行速度]  ● 打席ごと  ○ 1球ごと  ○ 勝負所  ○ 自動             │
│  [▶ 進める]  [⏭ イニング終了まで]  [⏩ 試合終了まで]              │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 情報優先度

**常時表示**（画面上部）:
- スコア、イニング、アウトカウント、ボール・ストライクカウント

**打席中に表示**（中段）:
- 対戦中の投手/打者の実効パラメータサマリー
- ベース状況

**采配時に展開**（下部）:
- 采配ボタン群（状況に応じて有効/無効）
- 選択中の采配の効果予測（成功率の目安）

**オンデマンド**（折りたたみ/別タブ）:
- 全選手スタッツ
- 過去の全打席ログ
- 投球位置の詳細ヒートマップ

### 6.3 采配ボタンの動的有効化

| 采配 | 有効条件 |
|------|---------|
| バント | 走者あり、0〜1アウト、打者がバント可能 |
| 盗塁 | 2塁 or 3塁に空きあり、1 or 2塁に走者 |
| ヒットエンドラン | 1塁に走者、2アウトでない |
| 敬遠 | 守備側のとき、1塁が空 |
| 代打 | 攻撃側、ベンチに未使用選手あり |
| 代走 | 攻撃側、走者あり、ベンチに未使用選手あり |
| 投手交代 | 守備側、ベンチにリリーフあり |
| マウンド訪問 | 守備側、当試合で残り回数あり |

---

## 7. Phase 7 ビジュアル・演出との統合

GPT案のPhase 7を**Phase 10に吸収**して、試合画面から実装することを推奨。理由：

1. **見どころが集中する画面** — 試合画面は全プロジェクトで最もドラマが生まれる場所
2. **投資対効果** — 試合画面の演出強化は体感品質に直結
3. **小さく始められる** — 2Dで十分

### 7.1 試合画面に入れる演出（優先度順）

#### Priority 1（必須・Phase 10-A）
- [x] **スコアボード即時更新** — 得点時に数字がフラッシュ
- [x] **カウント表示の明滅** — ストライク・ボール判定時
- [x] **投球の5×5グリッド描画** — 直近球がハイライト
- [x] **ダイヤモンド走者アニメーション** — 塁間を移動（fade）

#### Priority 2（体感向上・Phase 10-B）
- [ ] **勝負所バナー** — "7回裏 満塁" 等、画面上部に大きく表示
- [ ] **打席結果テロップ** — "ヒット！" "三振！" が中央にポップアップ
- [ ] **ホームラン演出** — 画面全体のフラッシュ + 音（オプション）
- [ ] **投手のスタミナバー色変化** — 黄→赤で視覚的緊張感

#### Priority 3（演出強化・Phase 10-C）
- [ ] **1球ごとの球種アニメーション** — マウンドから捕手へ線を引く
- [ ] **打球の軌跡表示** — 球場図上でどこに飛んだかを簡易表示
- [ ] **好プレー表示** — エラー、好守備で選手名をハイライト
- [ ] **大会勝ち上がり演出** — ブラケット画面で次戦へ進むアニメーション

#### Priority 4（立ち絵・Phase 11で対応）
- [ ] **投手・打者立ち絵** — 8x8 pixel art または 簡易 SVG アバター
- [ ] **監督アイコン** — ベンチに監督の立ち姿

### 7.2 演出ライブラリ選定

- **基本**: CSS Transitions + React State のみ（依存追加なし）
- **軽量アニメーション**: `framer-motion` （既にNext.jsで推奨）
- **パーティクル** (ホームラン等): `canvas-confetti` （〜5KB）
- **音声** (オプション): 静的 .mp3 を `<audio>` で（自己ホスト）

### 7.3 立ち絵システム案（Phase 11）

**パラメータ**:
```typescript
interface PlayerVisual {
  faceType: 0-5;        // 顔の輪郭
  hairStyle: 0-9;       // 髪型
  eyeType: 0-3;         // 目の形
  bodyType: 'thin' | 'normal' | 'muscular' | 'chubby';
  position: Position;   // 守備位置（ポーズに影響）
  grade: 1 | 2 | 3;     // 学年（雰囲気に影響）
}
```

**生成方針**:
- Phase 11初期: SVGレイヤー重ね（16個 × 16個 × 4個 × 4個 ≈ 4,096通り）
- 将来: 生成AI画像（`gsk img`）をキャッシュして事前生成、Seed 固定

**中学生 / OB 差別化**:
- 中学生: 顔パーツを小さめ、服装違い
- OB: 短髪率UP、社会人スーツ / 大学ユニフォーム
- 現役高校生: 坊主〜スポーツ刈り率 70%

---

## 8. 大会フローとの統合

### 8.1 世界ティッカーの分岐

```typescript
// world-ticker.ts の試合日処理
if (activeTournament && todayRound > 0) {
  const playerMatchScheduled = findPlayerMatchToday(...);

  if (playerMatchScheduled) {
    // ★ 自校の試合 → インタラクティブ試合をペンディング登録
    nextWorld.pendingInteractiveMatch = {
      opponentSchoolId,
      round: todayRound,
      tournamentId: activeTournament.id,
    };
    // 日付は進めない。プレイヤーが試合を終えるまで保留。
    return { nextWorld, result: { ...daily, waitingForMatch: true } };
  } else {
    // 他校同士の試合だけ simulateTournamentRound で消化
    ...
  }
}
```

### 8.2 UIフロー

```
[/play (ホーム)]
   │
   │  試合日に到達
   ▼
[試合予告モーダル]
  「本日の試合: 佐渡北商業 戦」
   [ベンチ確認] [試合開始 →]
   │
   ▼
[/play/match/[matchId]]
  インタラクティブ試合画面（1〜3試合は本格プレイ、後続は自動化オプション）
   │
   │  試合終了
   ▼
[結果サマリー]
  MVP発表、成績、
   [ブラケットを見る] [ホームへ戻る]
   │
   ▼
[/play/tournament] or [/play]
  翌日（試合のなかった他校の結果）に進む
```

---

## 9. 実装ロードマップ

### Phase 10-A: エンジン統合（1〜2日）
- [ ] `MatchRunner` クラス実装（`engine/match/runner.ts`）
- [ ] 単体テスト追加（runGameと同等の結果が得られること）
- [ ] `shouldPause` のケース別テスト
- [ ] `matchProjector` 実装

### Phase 10-B: 試合画面基本UI（2〜3日）
- [ ] `useMatchStore` 実装
- [ ] `/play/match/[matchId]` 画面
- [ ] スコアボード、カウント、アウト、ダイヤモンド表示
- [ ] 「打席ごと」「自動」「勝負所のみ」3モード
- [ ] 采配ボタン群（バント・盗塁・代打・継投）
- [ ] 最小限の演出（数値フラッシュ、結果テロップ）

### Phase 10-C: 大会統合（1〜2日）
- [ ] `world-ticker.ts` のインタラクティブ分岐
- [ ] `pendingInteractiveMatch` フィールドを `WorldState` に追加
- [ ] 試合終了後の大会ブラケット更新
- [ ] セーブ/ロード対応（`MatchState` の永続化）

### Phase 10-D: 演出・ブラッシュアップ（2〜3日）
- [ ] 勝負所バナー、ホームラン演出
- [ ] 投球5×5グリッド
- [ ] ログティッカー
- [ ] サウンド（オプション）
- [ ] レスポンシブ対応

### Phase 11: ビジュアル（立ち絵）（別フェーズ）
- [ ] SVGレイヤーベース立ち絵システム
- [ ] 中学生/OB差別化
- [ ] 試合画面への組み込み

### Phase 12: ブラッシュアップ（別フェーズ）
- [ ] 画面遷移アニメーション
- [ ] 大会勝ち上がり演出（ブラケット）
- [ ] ニュース出現演出
- [ ] 成長演出

**合計見積もり（Phase 10 のみ）: 6〜10日**

---

## 10. 技術的リスクと対応

### R1. MatchState が大きい（約 50KB）
- **リスク**: localStorage/Zustand persist の容量圧迫
- **対応**: 試合中のみメモリに保持、試合終了で `MatchResult` だけ残す
- 中断セーブは専用スロットで1試合分のみ

### R2. 再描画が重い
- **リスク**: `MatchState` の更新毎に全コンポーネント再描画
- **対応**: Zustand の selector を細かく分ける、`useMemo` で Projector 結果をキャッシュ

### R3. 既存テスト 523 件が壊れる
- **リスク**: エンジン側の変更で既存の `processAtBat` テストが壊れる
- **対応**: `engine/match/` は一切変更しない。`runner.ts` は新規ファイルのみ

### R4. 長時間プレイ時の疲労
- **リスク**: 1試合 20〜30分かかると疲れる
- **対応**: 「勝負所のみ」モードを標準推奨。1試合 5〜10分目標

---

## 11. 成功基準

### 機能面
- [ ] プレイヤーは自校の試合で1球ずつ or 打席ごとに采配できる
- [ ] バント、盗塁、代打、継投が全て動作する
- [ ] 勝負所で自動停止する
- [ ] いつでも「自動進行」に切り替え可能
- [ ] 既存の大会進行は壊れない

### 体験面
- [ ] チャンス・ピンチで緊張感が生まれる（勝負所バナーで可視化）
- [ ] 采配の成否が結果に反映される（willObeySignの動作確認）
- [ ] 1試合 5〜15分で完結する（勝負所モード時）

### 技術面
- [ ] 既存テスト 523 件が全てパス
- [ ] 新規コード 80% 以上のテストカバレッジ
- [ ] TypeScript strict モードでエラーなし
- [ ] 本番ビルド（Next build）成功

---

## 12. 次の一手

**高橋さんの確認事項**:

1. **設計方針 P1〜P4 は OK か**（特に「打席単位が基本」の判断）
2. **Phase 7（ビジュアル）を Phase 10 に吸収することは OK か**
3. **実装順序は A→B→C→D でいいか**、それとも並行作業したいか
4. **立ち絵（Phase 11）の優先度** — 今やりたい vs 後回し
5. **1試合の目標時間** — 5分派 vs 15分派

OKなら、Phase 10-A（MatchRunner）から実装に入る。
