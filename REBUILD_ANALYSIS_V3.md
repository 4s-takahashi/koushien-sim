# Step 1.6: 実装着手前の最終設計版（**確定版**）

**作成**: 2026-04-28
**版**: v3（**実装着手前の最終確定版** — 高橋さんレビュー10項目反映済）
**対象**: koushien-sim 試合エンジン再構築
**前版**: REBUILD_ANALYSIS_V2.md (Step 1.5, 725行)
**位置づけ**: Step 1（v1 分析）→ Step 1.5（v2 軽量化）→ **Step 1.6（v3 実装着手前 — 本書で確定）** → Step 2 (Phase R1) 着手判断へ
**ステータス**: ✅ 確定（このまま実装タスクへ分解可能）

---

## 序文

本ドキュメントは、Step 1.5（v2）に対する追加レビューを反映した **実装着手前の最終設計版**である。

v2 までで、

- 物理シミュ路線を維持しつつ「軽量で説得力のある物理」として定義
- 6 レイヤーアーキテクチャの採用
- 25 入力変数による「同じ打球が二度と起きない」の構造化
- 21 種分類を物理結果からの読み取りラベルに位置づけ
- UI を canonical timeline の再生側に確定
- 将来の采配・感情・実況拡張への接続点を明示

という基盤は整った。

v3（本書）では、これを **「このまま実装タスクに分解できる精度」**まで具体化する。特に以下の 10 点を構造に組み込んだ:

1. 性能値を「保証値」ではなく「設計目標」として扱う
2. 投球の打者認知抽象品質パラメータを Layer 3 の入力に追加
3. Play Resolver の内部分割（6 サブモジュール）を明記
4. 走者判断に `decisionMargin` を導入し、能力・性格・采配で変化させる
5. 25 入力 → 中間潜在量（5 軸） → 4 軸打球パラメータ の二段構造
6. 21 種分類の品質条件を「存在 / 頻度 / 安定 / 希少」に分割
7. UI 側は「物理計算禁止」ではなく「結果決定ロジック禁止」と整理
8. runner / inning / result の責務再定義 + 責務対応表
9. Timeline の replay / resume / debug 価値を設計に組み込み
10. テスト第 5 層「再生 E2E / Viewer 整合テスト」を追加

このゲームが目指すのは、結果テーブルを抽選する従来型野球ゲームではなく、**「同じ打球が二度と起きない・過程にドラマがある・能力差が手触りに出る」高校野球体験**である。本書はそのための **実装可能で・テスト可能で・拡張可能な物理試合基盤** の最終設計指針である。

---

## §1 設計哲学：軽量で説得力のある物理（v3 確定）

### 1.1 基本テーゼ

> **流体力学的に厳密な物理ではなく、野球ゲームとして「説得力」と「個体差」と「揺らぎ」を生む最小限の物理を採用する。**

野球ゲームのドラマを生むのに必要なのは、**完全再現された流体力学**ではなく:

1. 投球品質と打者反応の **連続値**による打球パラメータ生成
2. 解析式で **O(1)** に算出される打球軌道（着弾点・滞空時間）
3. 守備・走塁の **到達時刻比較**＋ `decisionMargin`による out/safe 判定
4. **入力空間の高次元性**が結果の連続性と多様性を生む構造
5. **canonical timeline** が engine 側で唯一の真実

これらは O(1) 〜 O(N) で実装でき、毎打席数百μs オーダーで解決可能（**目標値、Phase R1/R2 完了後に benchmark で再計測**）。

### 1.2 「説得力」の定義（v3 拡張）

物理的に正しい必要はないが、以下を満たす必要がある:

1. **入力差が結果差を生む**: 打者 power が高ければ exitVelocity 期待値が上がる、足が速ければ内野安打率が上がる
2. **整合性が崩れない**: アウトと表示されたなら送球が先着している、犠牲フライ成立なら捕球時刻 < 走者ホーム到達時刻
3. **境界が連続的**: 打率.250 と.300 の打者で結果がスムーズに変わる（離散ジャンプしない）
4. **再現可能**: 同じ RNG seed なら同じ timeline、同じ結果（リプレイ・デバッグ可能）
5. **将来拡張可能**: 采配・感情・実況・球場差・天候を「最初に組み込まなくても、後から差し込める」構造

### 1.3 厳密化と近似の使い分け原則（v3 確定）

| カテゴリ | 扱い | 理由 |
|---|---|---|
| 打球初速・打球角度・水平角度・スピン | **連続値**で持つ | プレー差・能力差の本質変数 |
| 打球軌道計算 | **解析式 O(1)** | 二次関数 + 抗力減衰係数で十分 |
| バウンド後の挙動 | **減衰係数 + 単純運動** | バウンドは離散イベント化 |
| 野手・走者の移動 | **直線等加速度モデル** | 反応時間 + 最高速 + 加速度の3パラ |
| 送球 | **直線距離 / 送球速度 + 体勢補正係数** | 体勢補正だけ係数で表現 |
| 投球の3D軌道 | **持たない**（演出用は別途） | 打撃判定に効くのは抽象品質パラメータ（§3.2） |
| 投球の打者認知品質 | **連続値の抽象指標**で持つ | 見かけ球速感・緩急差・ブレイク強度等（§3.2） |
| 空気抵抗 | **距離依存の単純減衰** | 数値積分しない |
| 風・天候 | **将来拡張用係数だけ確保** | 初期実装では係数 1.0 |
| 走者判断 | **ETA 比較 + decisionMargin** | 単純比較ではなく、能力・采配で揺れる判断（§5） |

→ **核心**: 連続値で持つのは「Layer 3 の入力ベクトル」と「打球の 4 軸パラメータ」。それ以降は解析式・到達時刻比較で O(1) 解決。投球の3D軌道は持たないが、打者認知に効く抽象品質は連続値で入力する。

### 1.4 「軽量」を支える 3 原則

1. **関数型・純粋関数優先**: 副作用は Layer 6（Orchestrator）に集中、Layer 1-5 は副作用なし
2. **イベント駆動の離散時刻**: 連続シミュレーションせず、必要な時刻だけ計算
3. **解析式で済む所は数値積分しない**: trajectory も movement も解析式

---

## §2 6 レイヤー構成（v3 確定）

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 6: Match Orchestrator (engine/match/runner.ts 等)      │
│  責務: イニング進行・采配適用・打席状態遷移・成績反映        │
│  計算: O(1) 状態遷移 + ログ追記                              │
│  保持: 既存インタフェース維持                                │
└──────────────────────────────────────────────────────────────┘
                          ↑↓ canonical timeline
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: Play Resolver (engine/physics/resolver/)            │
│  責務: 1 球の解決・タイムライン構築・out/safe 判定           │
│  内部分割（v3 新規）:                                        │
│    - fielding-resolver: 野手到達 + 捕球判定                  │
│    - throw-resolver: 送球先選択 + 送球時間                   │
│    - baserunning-resolver: 走者判断 + decisionMargin         │
│    - timeline-builder: イベント収集 + 時刻ソート             │
│    - play-validator: 不変条件チェック                        │
│    - result-deriver: timeline → FieldResult 派生             │
│  出力: PlayResolution { trajectory, timeline, fieldResult }  │
└──────────────────────────────────────────────────────────────┘
                          ↑↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 4: Ball Trajectory (engine/physics/trajectory.ts)      │
│  責務: 4軸打球パラメータから着弾点・滞空時間・3D 位置を返す  │
│  計算: 解析式 O(1)（重力 + 抗力減衰係数）                    │
│  値: 連続値（landingPoint, hangTime, apex, positionAt(t)）   │
└──────────────────────────────────────────────────────────────┘
                          ↑↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 3: Bat-Ball Physics (engine/physics/bat-ball/)         │
│  責務: 投球品質 × 打者反応 × 状況 → 4軸打球パラメータ         │
│  内部構造（v3 新規）:                                        │
│    Step A: 25 入力 → 中間潜在量 5 軸                         │
│    Step B: 中間潜在量 → 4軸打球パラメータ + 揺らぎ           │
│  入力: §3 で詳述                                             │
└──────────────────────────────────────────────────────────────┘
                          ↑↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 2: Player Movement (engine/physics/movement.ts)        │
│  責務: 反応時間 + 加速 + 最高速での到達時刻計算              │
│  計算: 解析式 O(1)（直線等加速度）                           │
│  対象: 野手・走者・送球                                      │
└──────────────────────────────────────────────────────────────┘
                          ↑↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 1: Field Geometry (engine/physics/field-geometry.ts)   │
│  責務: 球場座標系・距離計算・ファウルライン判定              │
│  計算: O(1) 純粋関数                                         │
│  値: 静的定数（塁・守備位置・フェンス）                      │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 計算コスト方針（v3：保証値ではなく設計目標）

**設計目標**（実装後に benchmark で検証する）:

| Layer | 1 プレイあたり呼び出し | 各呼び出し計算量 | 目標時間 |
|---|---|---|---|
| L1 Field | ~10 回 | O(1) 算術 | <10μs |
| L2 Movement | ~10 回 | O(1) 解析式 | <20μs |
| L3 Bat-Ball | 1 回（in_play 時） | O(1) ガウス + 行列演算 | <10μs |
| L4 Trajectory | 1 回（連続位置取得は別途） | O(1) 解析式 | <5μs |
| L5 Resolver | 1 回 | <50 イベントソート | <100μs |
| L6 Orchestrator | 1 回 | 状態コピー + ログ | <20μs |
| **合計（設計目標）** | 1 球あたり | | **<200μs** |

**重要**: 上記は **設計目標値**であり、**保証値ではない**。実装後の benchmark で:

- Phase R1 完了後: Layer 1-4 単体で目標達成を確認
- Phase R2 完了後: Resolver 含めた 1 プレイで目標達成を確認
- Phase R3 完了後: 既存 851 テスト + 1 試合フル実行で実測

**benchmark 項目（実測すべきもの）**:

1. 1 球あたりの平均処理時間（μs）
2. 1 試合（300 球前後）の総処理時間（ms）
3. 1000 試合シミュ完走時間（秒）
4. メモリ使用量（PlayResolution あたりの bytes）

性能目標を達成できない場合は **ボトルネック特定 → 局所最適化 → 必要なら近似度を上げる**で対応。性能目標未達でも設計を曲げない。

### 2.2 各レイヤー責務（詳細）

#### Layer 1: Field Geometry
- **持つ**: 球場座標（feet）、塁座標、標準守備位置、フェンス座標、ファウルライン
- **持たない**: 動的な野手位置（Layer 2）、打球の今の位置（Layer 4）
- **連続/近似**: 連続=任意座標・任意距離 / 近似=フェンスは円弧近似
- **拡張点**: 将来の球場差は座標定数の差し替えだけで対応

#### Layer 2: Player Movement
- **モデル**: 反応時間 → 等加速度で目標方向に直線移動 → 最高速で巡航
- **入力**: `from`, `to`, `topSpeed`, `acceleration`, `reactionTime`
- **出力**: `etaMs(t)`, `positionAt(t)`
- **連続/近似**: 連続=速度・加速度・到達時刻 / 近似=移動経路は直線
- **拡張点**: 守備シフトは初期位置を変えるだけ、性格による反応時間バイアスも係数で乗せられる

#### Layer 3: Bat-Ball Physics
- **モデル**: 25 入力 → 中間潜在量 5 軸 → 4 軸打球パラメータ（§3 詳述）
- **連続/近似**: 連続=潜在量・打球パラメータ / 近似=スピンは back/side のスカラー 2 軸のみ
- **特徴**: ここに来る入力変数の多次元性が「同じ打球が二度と起きない」を生む

#### Layer 4: Ball Trajectory
- **モデル**: 二次関数（重力）+ 距離依存抗力減衰 + バウンド減衰
- **値域**: `landingPoint`, `hangTime`, `apex`, `positionAt(t)`（任意時刻の 3D 位置）
- **連続/近似**: 連続=位置 / 近似=空気抵抗は経路積分せず係数

#### Layer 5: Play Resolver
- **モデル**: §6 で詳述する 6 サブモジュールに分割
- **判定**: out/safe は **塁到達時刻 vs 送球到着時刻 ± decisionMargin**
- **重要**: ここで生成された timeline が canonical truth

#### Layer 6: Match Orchestrator
- **責務のみに専念**: 既存 `runner.ts` のインタフェースを保ち、内部で Layer 5 を呼ぶ
- **持たない**: 物理計算・打球判定・走塁判定
- **持つ**: イニング遷移、采配適用、勝敗判定、ログ蓄積

---

## §3 Layer 3 入力設計（v3 拡張）

### 3.1 設計方針

「ランダムだから毎回違う」のではなく、**「入力が毎回少しずつ違うから結果も毎回少しずつ違う」**を実現する。
これにより、揺らぎが**必然性を伴った揺らぎ**となる。

入力変数は **5 カテゴリ × 計 25 変数**。さらに v3 では **投球の打者認知品質（カテゴリ A拡張）**を追加する。

### 3.2 投球の打者認知品質（v3 新規）

**問題意識**: 投球の3D軌道はエンジンで持たないが、打撃判定には「打者にとってどう見えるか」が効く。
そこで、3D 軌道を持たない代わりに **抽象品質パラメータ**を投球側で連続値で持つ。

```ts
interface PerceivedPitchQuality {
  /** 見かけ球速感 (km/h 換算) — 球速 + 投手フォームの圧 */
  perceivedVelocity: number;
  /** 緩急差 — 直前球との球速差をどれだけ強く感じるか (0-1) */
  velocityChangeImpact: number;
  /** ブレイク強度 — 変化の急峻さ (0-1) */
  breakSharpness: number;
  /** 終盤変化 — 手元での落ち・伸び (0-1) */
  lateMovement: number;
  /** 打ちにくさ総合 (0-1) — 上記の合成 + コース難度 */
  difficulty: number;
}
```

これらは Layer 3 の **打者タイミング・芯捕捉率**を変える入力として使う。投球の3D軌道は持たないが、**打撃判定の解像度を落とさない**。

### 3.3 25 入力変数（5 カテゴリ）

#### カテゴリ A: 投球品質（投手側 7 変数 + v3 で perceived 追加）

| 変数 | 値域 | 影響先 |
|---|---|---|
| pitch.velocity | 70-160 km/h 連続 | 打者タイミング |
| pitch.type | 離散カテゴリ | スピン傾向、減速プロファイル |
| pitch.breakLevel | 1-7 連続化 | コース誤差、スイング判断難度 |
| pitch.actualLocation.row/col | 5×5 グリッド + ノイズ | 接触ポイント、引っ張り/流し方向 |
| pitcher.control | 0-100 | 制球誤差の幅 |
| pitcher.stamina（残り） | 0-100 | 球速・制球の劣化 |
| pitcher.confidence | 0-100 | 揺らぎの分散 |
| **perceivedPitchQuality（v3新規）** | 上記 5 軸 | **打者認知への抽象品質パラメータ** |

#### カテゴリ B: 打者特性（打者側 6 変数）

| 変数 | 値域 | 影響先 |
|---|---|---|
| batter.contact | 0-100 | 期待タイミング誤差の小ささ |
| batter.power | 0-100 | exitVelocity ベース |
| batter.eye | 0-100 | コース見極め |
| batter.technique | 0-100 | 狙い通り打てる確率（spray 分散） |
| batter.battingSide | 左/右/スイッチ | 引っ張り方向 |
| batter.swingType | 流し打ち/引っ張り/万能 | 期待 sprayAngle |

#### カテゴリ C: タイミング状態（打席内 4 変数）

| 変数 | 値域 | 影響先 |
|---|---|---|
| timingError | -100ms 〜 +100ms 連続 | 接触ポイントずれ |
| ballOnBat（芯ズレ） | 0.0-1.0 | exitVelocity, launchAngle ばらつき |
| previousPitchVelocity | km/h | 緩急効果（履歴依存） |
| count.balls/strikes | 0-3 / 0-2 | 追い込まれた打者は守備的スイング |

#### カテゴリ D: 状況補正（試合状況 4 変数）

| 変数 | 値域 | 影響先 |
|---|---|---|
| inning + score | リード差・回 | プレッシャー |
| outs | 0-2 | アウトカウント別の積極性 |
| baseState | 走者状況 | 引っ張りバイアス |
| isKeyMoment | bool | キー打席は揺らぎ縮小 |

#### カテゴリ E: 采配・性格（接続点 4 変数）

| 変数 | 値域 | 影響先 |
|---|---|---|
| order.focusArea | inside/outside/low/high/middle | sprayAngle バイアス |
| order.aggressiveness | passive/normal/aggressive | スイング判断 |
| traits[] | 性格特性配列 | 各種補正係数 |
| mood | コンディション | 揺らぎ拡大/縮小 |

→ **計 25 + perceivedPitchQuality 5 軸 = 30 連続値の入力空間**。同じ状況が再現することは事実上ない。

---

## §4 中間潜在量設計（v3 新規・最重要）

### 4.1 二段構造の設計意図

**問題**: 25 入力を直接 4 軸打球パラメータに合成すると:
- 入力数が多すぎてチューニングが困難
- 各入力の影響度を独立に評価できない
- ゲームバランス調整時にどの入力をいじるべきか不明

**解決**: 入力を一度 **中間潜在量 5 軸**に圧縮してから、4 軸打球パラメータに変換する。

```
[25 入力] ── Step A ──→ [中間潜在量 5 軸] ── Step B ──→ [4 軸打球パラメータ]
```

これにより:
- **Step A**: 「打者がどんな状態でスイングするか」を 5 軸で捉える
- **Step B**: 「その状態だとどういう打球が出るか」を 4 軸で生成
- チューニングは Step A と Step B を独立に調整可能
- バグや違和感の切り分けがしやすい

### 4.2 中間潜在量 5 軸

```ts
interface SwingLatentState {
  /** 接触品質 0-1 — どれだけ芯で捉えたか */
  contactQuality: number;
  /** タイミング窓 -1〜+1 — 早すぎ(-)/遅すぎ(+)/ジャスト(0) */
  timingWindow: number;
  /** スイング意図 -1〜+1 — 流し(-)/普通(0)/引っ張り(+) */
  swingIntent: number;
  /** 判断プレッシャー 0-1 — 状況による緊張度 */
  decisionPressure: number;
  /** バレル率 0-1 — 強い打球になる確率（contactQuality と power の複合） */
  barrelRate: number;
}
```

### 4.3 Step A: 25 入力 → 中間潜在量

各潜在量に主に効く入力群を以下に整理する。

#### contactQuality（接触品質）
- **主入力**: batter.contact, batter.technique
- **副次入力**: timingError（ずれが大きいと低下）, ballOnBat（芯ズレ）, perceivedPitchQuality.difficulty（難しい球は低下）
- **公式概念**:
  ```
  contactQuality = sigmoid(
    0.4 * batter.contact / 100
    + 0.3 * batter.technique / 100
    - 0.5 * abs(timingError) / 100
    - 0.4 * perceivedPitchQuality.difficulty
    + gaussian(0, 0.05)
  )
  ```

#### timingWindow（タイミング窓）
- **主入力**: timingError（直接入る）
- **副次入力**: perceivedPitchQuality.velocityChangeImpact（緩急で揺れ拡大）, perceivedPitchQuality.lateMovement（手元変化で揺れ拡大）, batter.contact（高ければ揺れ縮小）
- **公式概念**:
  ```
  baseWindow = timingError / 100
  perturbation = velocityChangeImpact * 0.3 + lateMovement * 0.2
  timingWindow = baseWindow + gaussian(0, perturbation * (1 - batter.contact / 200))
  ```

#### swingIntent（スイング意図）
- **主入力**: batter.battingSide, batter.swingType, order.focusArea
- **副次入力**: pitch.actualLocation.col（外角→流し意図, 内角→引っ張り意図）, count.strikes（追い込まれたら中央寄せ）
- **公式概念**:
  ```
  baseIntent = swingTypeBias[batter.swingType] // -0.3 (流し) / 0 / +0.3 (引っ張り)
  locationBias = (pitch.actualLocation.col - 2) * 0.2  // -0.4 〜 +0.4
  orderBias = focusAreaBias[order.focusArea]
  twoStrikeReduction = count.strikes >= 2 ? 0.5 : 1.0  // 追い込まれたらバイアス縮小
  swingIntent = (baseIntent + locationBias + orderBias) * twoStrikeReduction
  ```

#### decisionPressure（判断プレッシャー）
- **主入力**: isKeyMoment, inning + score（接戦・終盤ほど高）, batter.mental（メンタル強いと低下）
- **副次入力**: outs（追い詰められた状況）, baseState（得点圏ほど高）, mood（悪いと拡大）
- **公式概念**:
  ```
  basePresssure = keyMomentScore * 0.5 + closeGameLateInning * 0.3 + scoringPosition * 0.2
  mentalReduction = batter.mental / 100
  decisionPressure = clamp(basePressure - mentalReduction * 0.4 + moodAdjustment, 0, 1)
  ```

#### barrelRate（バレル率）
- **主入力**: contactQuality, batter.power
- **副次入力**: timingWindow（ジャストに近いほど高）, perceivedPitchQuality.difficulty（難しい球は低下）
- **公式概念**:
  ```
  centerness = 1 - abs(timingWindow)
  barrelRate = contactQuality * (0.4 + 0.6 * centerness) * (0.5 + 0.5 * batter.power / 100)
  ```

→ Step A は計 5 つの sigmoid/clamp 関数。**O(1)、わずか数十回の算術演算**で完了する。

### 4.4 Step B: 中間潜在量 → 4 軸打球パラメータ

```ts
interface BallTrajectoryParams {
  exitVelocity: number;   // 50-180 km/h 連続
  launchAngle: number;    // -20° 〜 +60° 連続
  sprayAngle: number;     // -10° 〜 +100° 連続（ファウル含む）
  spin: { back: number; side: number };  // 各 -3000〜+3000 rpm 連続
}
```

#### exitVelocity（打球初速）
```
base = 70 + 80 * barrelRate  // 70-150 km/h レンジ
adjustment = (1 - decisionPressure * 0.1)  // プレッシャーで微減
noise = gaussian(0, 4 * (1 - contactQuality * 0.5))  // contactQuality 高いほどブレ小
exitVelocity = clamp(base * adjustment + noise, 30, 180)
```

#### launchAngle（打球角度）
```
basAngle = -5 + 50 * (barrelRate - 0.5)  // -30° 〜 +20° の幅で揺れる中心
locationEffect = (2 - pitch.actualLocation.row) * 5  // 高めはフライ、低めはゴロ
timingEffect = timingWindow * 8  // 早打ちはフライ気味
noise = gaussian(0, 6 * (1 - contactQuality * 0.4))
launchAngle = clamp(baseAngle + locationEffect + timingEffect + noise, -30, 80)
```

#### sprayAngle（水平角度）
```
baseSpray = 45 + swingIntent * 30  // -1 → 15° (流し), +1 → 75° (引っ張り)
timingShift = -timingWindow * 12  // 早=引っ張り側にずれ, 遅=流し側にずれ
noise = gaussian(0, 10 * (1 - batter.technique / 200))
sprayAngle = baseSpray + timingShift + noise  // ファウル方向への振れも許容
```

#### spin（スピン）
```
backSpin = launchAngle > 10 ? 1500 + barrelRate * 1500 + gaussian(0, 200) : -500 + gaussian(0, 300)
sideSpin = swingIntent * 1000 + gaussian(0, 400)
spin = { back: backSpin, side: sideSpin }
```

→ Step B も全て O(1) 算術。中間潜在量 → 4 軸の変換が **直交的・独立**に行えるため、デバッグもしやすい。

### 4.5 二段構造の利点まとめ

1. **チューニング容易**: contactQuality だけ低めにする / barrelRate だけ高めにする等、独立調整可能
2. **デバッグ容易**: 「打球が変」のとき、まず潜在量を見れば原因特定が早い
3. **拡張容易**: 新しい入力（例: 球場差）を加えるとき、どの潜在量に効かせるかだけ決めれば良い
4. **テスト容易**: Step A と Step B を独立にテスト可能

---

## §5 走者判断と decisionMargin（v3 新規）

### 5.1 設計意図

走者判断を単純な ETA 比較（送球到着 vs 走者到達）にすると、**全プレーが同じパターンに収束**する。

例: 「この走者はこの送球より 50ms 速いから必ず進む」→ 同じ走者 + 同じ守備 + 同じ角度なら毎回同じ判断。

しかし実際の野球では:
- 足が速くても「読みを誤って戻れず、アウト」がある
- 監督方針で「無理しない」と進塁を諦める
- 接戦終盤では強引な走塁で「ギリギリセーフ」を狙う
- 外野手の肩が強いとわかってる相手には消極的になる

これを表現するため、**ETA 比較 + decisionMargin** で走者判断する。

### 5.2 decisionMargin の定義

```ts
interface BaserunningDecision {
  /** 走者の進塁意思の強さ */
  willingnessToAdvance: number;  // 0-1
  /** 判断の余裕度（マージン）— 大きいほど積極的に進む */
  decisionMargin: number;  // ms 単位、-500 〜 +500
  /** 進塁する/しないの最終判定 */
  willAdvance: boolean;
}

// 判定ロジック
function shouldAdvance(
  runnerEtaMs: number,
  throwArrivalMs: number,
  decisionMargin: number,
): boolean {
  // throwArrivalMs - runnerEtaMs > decisionMargin なら進む
  // すなわち、走者が送球より decisionMargin ms 以上 早く着くと判断したら進む
  return (throwArrivalMs - runnerEtaMs) > decisionMargin;
}
```

→ `decisionMargin` が **大きい**（例: +200ms） = 慎重（200ms 余裕がないと進まない）
→ `decisionMargin` が **小さい/負**（例: -100ms） = 積極的（100ms 不利でもチャレンジ）

### 5.3 decisionMargin を決める入力

| 入力 | 効果 |
|---|---|
| **走者.speed** | 高いほどマージン縮小（自信ある）|
| **走者.baserunningSense（走塁センス・新規）** | 高いほどマージン縮小（読みが正確） |
| **order.aggressiveness** | aggressive→マージン縮小、passive→拡大 |
| **outs（アウトカウント）** | 0/1 アウトでは慎重（+50ms）、2 アウトでは強引（-100ms） |
| **scoreDiff（点差）** | 大量リード時は慎重、ビハインド終盤は強引 |
| **isKeyMoment** | キー局面はマージン拡大（慎重） |
| **defenderArmStrength（外野手の肩）** | 強い肩を相手にすると拡大（慎重） |
| **inning** | 終盤ほど采配色が強くなる |
| **走者.confidence（試合中の自信）** | 高いほど縮小 |
| **走者.traits（性格）** | aggressive_runner→縮小、cautious→拡大 |
| **manager_style（将来）** | 監督方針で全体補正 |

### 5.4 公式概念

```
baseMargin = 100  // デフォルト 100ms 余裕欲しい
speedAdjust = -(runner.speed - 50) * 1.5  // 速い走者ほど縮小
senseAdjust = -(runner.baserunningSense - 50) * 1.0
aggressivenessAdjust = orderAggressivenessMap[order.aggressiveness]  // -100 / 0 / +100
outsAdjust = outs === 2 ? -100 : (outs === 0 ? 50 : 0)
scoreSituationAdjust = computeScoreSituationAdjust(scoreDiff, inning, runnerSide)
keyMomentAdjust = isKeyMoment ? 80 : 0
armStrengthAdjust = (defenderArm - 50) * 1.0  // 強肩は + に
traitsAdjust = sumTraitsBaserunningEffect(runner.traits)
confidenceAdjust = -(runner.confidence - 50) * 0.6

decisionMargin = baseMargin
  + speedAdjust
  + senseAdjust
  + aggressivenessAdjust
  + outsAdjust
  + scoreSituationAdjust
  + keyMomentAdjust
  + armStrengthAdjust
  + traitsAdjust
  + confidenceAdjust
  + gaussian(0, 30)  // 個体差ノイズ
```

→ `decisionMargin` は -300〜+400ms の範囲で動く。同じ走者でも状況・采配・心理で結果が変わる。

### 5.5 baserunning AI への独立拡張可能性

`baserunning-resolver` モジュール（§6 で詳述）を**独立した AI モジュール**として将来拡張できる:

- Phase R5 までは公式ベース
- Phase R6 以降で「学習型走者 AI」（強化学習・行動ツリー等）に置き換え可能
- インタフェースは `(state, runner, context) → decisionMargin` で固定

---

## §6 Play Resolver の内部分割（v3 新規）

### 6.1 設計意図

Layer 5 を 1 ファイルで実装すると **数百〜千行の神クラス**になる。
これを防ぐため、責務ごとに **6 サブモジュール**に分割する。各モジュールは単独でテスト可能。

```
engine/physics/resolver/
  ├── fielding-resolver.ts     - 野手到達 + 捕球判定
  ├── throw-resolver.ts         - 送球先選択 + 送球時間
  ├── baserunning-resolver.ts   - 走者判断 + decisionMargin（§5）
  ├── timeline-builder.ts       - イベント収集 + 時刻ソート
  ├── play-validator.ts         - 不変条件チェック
  ├── result-deriver.ts         - timeline → FieldResult 派生
  └── index.ts                  - resolvePlay 公開関数（オーケストレータ）
```

### 6.2 各サブモジュールの責務と入出力

#### ① fielding-resolver
**責務**: 打球に対してどの野手がいつ到達し、捕球できるか判定

**入力**:
- `BallTrajectoryParams`, `BallFlight`
- `MatchTeam`（守備側）, `fieldPositions`
- `RNG`（捕球失敗の揺らぎ用）

**出力**:
```ts
interface FieldingResult {
  primaryFielder: { id: string; position: Position; arrivalTimeMs: number };
  catchAttempt: {
    success: boolean;       // クリーン捕球?
    error: boolean;         // エラー発生?
    bobble: boolean;        // ボブル（ファンブル後拾い直し）?
  };
  /** バウンド後に処理する場合の各バウンド点と時刻 */
  bouncePoints?: Array<{ pos: FieldPosition; t: number }>;
}
```

**ロジック概要**:
1. 着弾点近傍の野手リスト取得（field-geometry より）
2. 各野手の ETA（movement レイヤー）算出
3. 最早到達者を primary に
4. 捕球判定:
   - 打球種・速度・コース・野手能力から成功率を算出
   - エラー率は能力ベース（fielding stat）+ 状況補正

#### ② throw-resolver
**責務**: 捕球後の送球先選択と送球時間計算

**入力**:
- `FieldingResult`, `BaseState`, `outs`
- 送球側野手の能力（armStrength, fielding）
- `RNG`（送球エラー揺らぎ）

**出力**:
```ts
interface ThrowResult {
  /** 送球するか（しないなら走者を見送る） */
  willThrow: boolean;
  /** 送球先 */
  toBase: 'first' | 'second' | 'third' | 'home' | 'cutoff';
  /** カットオフ経由の場合の中継野手 */
  cutoffFielder?: string;
  /** 送球リリース時刻 (ms) */
  releaseTimeMs: number;
  /** 送球到達時刻 (ms) */
  arrivalTimeMs: number;
  /** 送球品質 (0-1) — 暴投・短い送球の確率 */
  throwQuality: number;
}
```

**ロジック概要**:
1. 送球先候補 = 必要なフォースアウト先 + 進塁狙いの走者がいる塁
2. 各送球先の有用度を評価（フォースアウト > 任意進塁 > 見送り）
3. 体勢補正（後ろ向き捕球は遅い、ジャンプキャッチ後は遅い）
4. throwQuality は arm + fielding + 体勢補正 + ノイズ

#### ③ baserunning-resolver
**責務**: 各走者の進塁判断と進塁時刻計算（§5 の decisionMargin を実装）

**入力**:
- `BaseState`, 各走者の能力 + traits
- `FieldingResult`, `ThrowResult`
- `MatchState`（状況・采配）, `RNG`

**出力**:
```ts
interface BaserunningResult {
  /** 走者ごとの進塁判定 */
  decisions: Array<{
    runnerId: string;
    fromBase: BaseId;
    targetBase: BaseId;
    decisionMargin: number;
    willAdvance: boolean;
    arrivalTimeMs: number;
    /** safe/out 結果（送球到達 vs 走者到達） */
    outcome: 'safe' | 'out' | 'still_running';
  }>;
}
```

**ロジック概要**:
1. 各走者について `targetBase` 候補を列挙（強制 + 任意）
2. `decisionMargin` を §5.4 の公式で計算
3. ETA を movement で算出
4. 送球到達と比較して safe/out 判定

#### ④ timeline-builder
**責務**: 上記 3 つのモジュールから出たイベントを時刻順にソートして CanonicalTimeline を構築

**入力**:
- `FieldingResult`, `ThrowResult`, `BaserunningResult`
- 開始イベント情報（pitch_release, ball_contact, etc.）

**出力**:
```ts
interface CanonicalTimeline {
  events: TimelineEvent[];  // 時刻昇順ソート済
}
```

**ロジック概要**:
1. 各モジュールから生のイベントを収集
2. 時刻でソート
3. 整合性が必要な箇所（runner_safe の前に throw_arrival 等）の順序確認
4. 不整合がある場合は play-validator で検出

#### ⑤ play-validator
**責務**: timeline の不変条件をチェックし、違反があれば例外を投げる

**入力**: `CanonicalTimeline`

**出力**: `void` または `throw new ValidationError`

**チェック項目**（§7.2 の不変条件すべて）:
1. 時刻単調性
2. 因果整合（runner_out の前に対応する throw_arrival がある）
3. 物理整合（out 判定 → throw < runner）
4. 進塁整合（runner_advance の前に lead_off）
5. 完結性（必ず play_end で終わる）

**重要**: バリデーションは **dev 環境では fail-fast、production では warning + fallback**にすると安全。

#### ⑥ result-deriver
**責務**: 完成した CanonicalTimeline から既存型の FieldResult / DetailedHitType を派生

**入力**: `CanonicalTimeline`, `BallTrajectoryParams`, `BallFlight`

**出力**:
```ts
interface DerivedResult {
  fieldResult: FieldResult;       // 既存型（後方互換）
  detailedHitType: DetailedHitType;  // 21種分類
  rbiCount: number;
  baseStateAfter: BaseState;
}
```

**ロジック概要**:
1. timeline から最終的に成立したイベント抽出（home_run, runner_safe at first base 等）
2. FieldResult.type を決定（home_run / single / double / triple / out / error / etc.）
3. detailedHitType は §8 の分類器で派生
4. baseStateAfter は最終的な走者位置

### 6.3 オーケストレータ（resolver/index.ts）

```ts
// engine/physics/resolver/index.ts
export function resolvePlay(
  state: MatchState,
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  rng: RNG,
): PlayResolution {
  // 1. 野手解決
  const fielding = resolveFielding(state, trajectory, flight, rng);

  // 2. 送球解決
  const throwResult = resolveThrow(state, fielding, rng);

  // 3. 走塁解決
  const baserunning = resolveBaserunning(state, fielding, throwResult, rng);

  // 4. timeline 構築
  const timeline = buildTimeline({ fielding, throwResult, baserunning });

  // 5. バリデーション
  validateTimeline(timeline);

  // 6. 結果派生
  const derived = deriveResult(timeline, trajectory, flight);

  return {
    trajectory,
    flight,
    timeline,
    fieldResult: derived.fieldResult,
    detailedHitType: derived.detailedHitType,
    rbiCount: derived.rbiCount,
    baseStateAfter: derived.baseStateAfter,
  };
}
```

→ **6 ファイル × 100-200 行 + index 50 行 = 計 700-1300 行**で Layer 5 全体が収まる。神クラス化を構造的に防止。

---

## §7 Canonical Timeline（v3 確定）

### 7.1 型定義

```ts
interface CanonicalTimeline {
  /** 各イベントは絶対時刻 (ms, 0=ピッチリリース or 打球発生) */
  events: TimelineEvent[];
  /** ソート済み・整合性検証済み（play-validator 通過） */

  /** 補助情報: 開始時刻のオフセット（リプレイ・resume 用） */
  baseTimestamp?: number;

  /** RNG seed（リプレイ再現用） */
  rngSeed?: string;
}

type TimelineEvent =
  | { t: number; kind: 'pitch_release'; pitcherId: string }
  | { t: number; kind: 'ball_at_plate' }
  | { t: number; kind: 'swing_start'; batterId: string; timingError: number }
  | { t: number; kind: 'ball_contact'; trajectory: BallTrajectoryParams }
  | { t: number; kind: 'foul'; reason: 'line' | 'tip' | 'late_swing' }
  | { t: number; kind: 'ball_landing'; pos: FieldPosition }
  | { t: number; kind: 'ball_bounce'; pos: FieldPosition; remainingEnergy: number }
  | { t: number; kind: 'fielder_react'; fielderId: string }
  | { t: number; kind: 'fielder_field_ball'; fielderId: string; pos: FieldPosition; cleanCatch: boolean }
  | { t: number; kind: 'fielder_throw'; fromId: string; toBase: BaseId; throwQuality: number }
  | { t: number; kind: 'throw_arrival'; toBase: BaseId; pos: FieldPosition }
  | { t: number; kind: 'runner_lead_off'; runnerId: string; fromBase: BaseId }
  | { t: number; kind: 'runner_advance'; runnerId: string; fromBase: BaseId; toBase: BaseId }
  | { t: number; kind: 'runner_safe'; runnerId: string; base: BaseId }
  | { t: number; kind: 'runner_out'; runnerId: string; base: BaseId; cause: 'force_out' | 'tag_out' | 'caught_stealing' }
  | { t: number; kind: 'fence_hit'; pos: FieldPosition }
  | { t: number; kind: 'home_run'; runnerId: string }
  | { t: number; kind: 'play_end' };
```

### 7.2 不変条件（5 つ、必ず守る）

1. **時刻単調**: events は t 昇順
2. **因果整合**: `runner_out` の前に対応する `throw_arrival` または `fielder_field_ball` がある
3. **物理整合**: アウト判定の場合 `throw_arrival.t + decisionMargin < runner.eta_to_base.t`
4. **進塁整合**: `runner_advance` の前に走者がそのベースから離れている（`runner_lead_off` または前イベント）
5. **完結性**: 必ず `play_end` で終わる

→ play-validator で構築直後にチェック。違反したら例外。これにより v0.42.0 のような 150ms ハックは構造的に発生しえない。

### 7.3 Replay / Resume / Debug 価値（v3 新規）

canonical timeline は単なる UI 再生用ではなく、**ゲーム運用全体での価値**を持つ。

#### Replay（試合リプレイ）
- 任意の打席を時刻 t=0 から再生可能
- timeline 自体が完全な記録 → 動画より軽く、検索可能
- 試合終了後の名場面ハイライト生成に使える

#### Resume（試合途中再開）
- 試合中断時、現在の `MatchState` + 進行中の partial timeline を保存
- 再開時は MatchState から続行（completed timeline は履歴として残す）
- セーブデータ容量は MatchState のシリアライズで完結（既存 persist middleware と整合）

#### Debug（バグ再現）
- timeline と RNG seed を同梱保存すれば、**任意のプレーを完全再現可能**
- バグ報告に「seed=xxx, inning=5, batter=yyy」だけ書けば再現できる
- リグレッションテストの bug fixture として timeline + seed を保存できる

#### 設計上の要件
- **timeline は不変**: 一度 validate を通ったら変更不可（readonly）
- **seed は timeline に同梱**: 再生時に同じ seed で再構築可能
- **MatchState のシリアライズに timeline 履歴を含める**: 直近 N 打席分（容量と相談）

### 7.4 snapshot の単位

| 対象 | 単位 | 保存先 |
|---|---|---|
| MatchState 全体 | 打席終了時 | localStorage（既存） |
| timeline（直近 N 打席） | 打席終了時 | MatchState 内 |
| RNG seed（その打席分） | 打席開始時 | timeline 内 |
| 全打席 timeline 履歴 | 試合終了時 | MatchResult 内（リプレイ用） |

### 7.5 再現性の保証範囲

- **保証する**: 同じ seed + 同じ MatchState なら **必ず同じ timeline、同じ結果**
- **保証する**: timeline → fieldResult の派生は決定論的
- **保証しない**: UI の演出タイミング（easing は変えてよい、結果は変えない）
- **保証しない**: 浮動小数点演算の桁レベル一致（CPU/環境差）→ 結果ラベル一致は保証

---

## §8 21 種分類は「物理結果からの読み取りラベル」（v3 確定）

### 8.1 位置づけ（再確認）

**21 種分類は最初に抽選するものではない**。Resolver が物理結果として確定した `BallTrajectoryParams` + `BallFlight` + 守備イベントを **読み取って分類**する純粋な後段ラベル付け処理。

```
[物理計算] ──→ trajectory + flight + timeline ──→ [分類] ──→ DetailedHitType
   ↑必然                                              ↑読み取り
```

### 8.2 分類ロジックの所在

`engine/physics/resolver/result-deriver.ts` 内の専用関数:

```ts
function classifyDetailedHit(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  timeline: CanonicalTimeline,
  baseState: BaseState,
): DetailedHitType
```

ルールベース、O(1) 算術。

### 8.3 21 種品質条件（v3 拡張：4 段階に分割）

v2 では「全種出現 + 目標頻度」を 1 つの完了条件にしていたが、これは粒度が粗い。
v3 では **4 段階の品質条件**に分けて評価する。

#### A. 存在確認（必須）
- 1000 試合シミュ × 5 seed で **全 21 種が少なくとも 1 回ずつ出現**
- 1 種でも欠落していたら分類器/物理パラメータのバグ

#### B. 頻度レンジ確認（必須）
- 各分類が「常識的範囲内の頻度」で出現
- 例: ホームランが全打席の 10% 出るのは異常
- 各分類に「期待頻度レンジ」を設定（§9.4）

#### C. 主要分類の安定出現（必須）
- 「センター前ヒット」「二遊間ゴロ」「中距離フライ」など **頻出 8 種**は単一試合 (300 球) でも 1-3 回出現するべき
- 単一試合で安定的に出ないと「同じパターンの繰り返し」感が出る

#### D. 希少分類の長期確認（推奨）
- 「ライナー性HR」「フェンス直撃」など **希少 5 種**は単試合で出ないこともある
- 10-30 試合の長期シミュで適切な頻度に収束することを確認
- 短期テストで頻度が出ない場合があっても、それは正常

### 8.4 21 種一覧と分類カテゴリ

| # | 分類 | カテゴリ | 単一試合期待 |
|---|---|---|---|
| 1 | 一塁線ゴロ | 主要 | 0-2 回 |
| 2 | 二遊間ゴロ | 主要 | 1-3 回 |
| 3 | 三遊間ゴロ | 主要 | 1-3 回 |
| 4 | 三塁線ゴロ | 主要 | 0-2 回 |
| 5 | ピッチャー返し | 中頻度 | 0-1 回 |
| 6 | 内野ライナー | 中頻度 | 0-2 回 |
| 7 | 高い内野フライ | 中頻度 | 0-2 回 |
| 8 | 内野手の頭越しヒット | 中頻度 | 0-1 回 |
| 9 | 一二塁間抜けヒット | 主要 | 0-2 回 |
| 10 | センター前ヒット | 主要 | 1-3 回 |
| 11 | 三遊間抜けヒット | 主要 | 0-2 回 |
| 12 | 浅いフライ | 主要 | 1-2 回 |
| 13 | 中距離フライ | 主要 | 2-4 回 |
| 14 | 深いフライ | 主要 | 0-2 回 |
| 15 | ライナー性のヒット | 中頻度 | 0-2 回 |
| 16 | 外野フェンス直撃 | 希少 | 0-1 回 |
| 17 | ライナー性HR | 希少 | 0-1 回 |
| 18 | 高弾道HR | 希少 | 0-1 回 |
| 19 | ライン際打球 | 希少 | 0-1 回 |
| 20 | ファウルフライ | 中頻度 | 0-1 回 |
| 21 | 当たり損ね投手前 | 中頻度 | 0-1 回 |

→ 主要 8（赤）/ 中頻度 8 / 希少 5 の構成。

### 8.5 利用先

- **実況ログ**: 「センター前へ抜けるクリーンヒット！」「フェンス直撃の二塁打！」
- **試合後成績**: 内野安打率・引っ張り/流し/センター返し別打率
- **演出**: HR 種別ごとに異なるカメラワーク
- **思考コメント**: 「あと数センチでフェンスオーバーだったか…」
- **採配 AI**: 守備シフト判断材料（打者の打球分布から）

---

## §9 UI 再生方針（v3 修正版）

### 9.1 役割の再確定（v2 修正）

v2 では「UI 側に物理計算が残っていない」と書いたが、これは厳しすぎた。
**v3 では「UI 側に結果決定ロジックが残っていない」**と整理する。

```
engine                       UI
─────────────────            ──────────────────
canonical timeline    ───→   タイムライン再生
（変更不可）                  - フレーム補間（許可）
RNG seed              ───→   - easing（許可）
                             - カメラワーク（許可）
                             - 効果音タイミング（許可）
                             - 表示遅延（許可）
                             - 演出オーバーレイ（許可）
                             ────────────────────
                             結果決定ロジック → 禁止
                             out/safe 変更 → 禁止
                             到達順反転 → 禁止
                             timeline 改変 → 禁止
```

### 9.2 UI 側に許可される操作

#### ✅ 補間・演出
- フレーム補間（30fps の中間フレーム生成）
- easing（走者の加減速曲線、線形補間より自然に）
- 効果音・テロップの遅延・重ね合わせ
- カメラ追従（ボール・打者・走者を追う視点切替）
- 粒子演出（バット軌跡、砂ぼこり）

#### ✅ 補助計算
- 表示用のフレームごと位置補間（trajectory.positionAt(t) を細かい t で呼ぶのは OK）
- アニメーション速度のスケーリング（倍速・スロー）
- 視覚効果のための独自パラメータ（カメラ揺れ強度、エフェクト強度）

#### ✅ 結果に影響しない演出強化
- HR 種別による異なるカメラワーク
- 21 種分類による異なる SE
- キー局面での視覚エフェクト（光・スローモーション）

### 9.3 UI 側に禁止される操作

#### ❌ 結果改変
- out → safe / safe → out への変更
- ヒット → エラー / エラー → ヒットへの変更
- timeline イベントの順序変更

#### ❌ 結果決定ロジック
- out/safe の独自判定（必ず timeline から読み取る）
- 走者進塁の独自判定
- 打球軌道の独自再計算（演出補間は OK、結果決定は NG）

#### ❌ 到達順の反転
- 送球先着 → 走者先着 のような順序入れ替え

### 9.4 v0.42.0 ハックの完全削除

現在 `useBallAnimation.ts` にある:
```ts
// v0.42.0: out 判定なら throwEnd = batterEnd - 150ms
// v0.42.0: safe 判定なら batterEnd = throwEnd - 150ms
```

これは canonical timeline 導入後 **完全削除**。timeline がすでに整合しているので、UI は **timeline の時刻をそのまま使う**だけ。

### 9.5 接続インタフェース

```ts
// engine からの出力（変更不可・読み取り専用）
interface PlayResolution {
  readonly trajectory: BallTrajectoryParams;
  readonly flight: BallFlight;
  readonly timeline: CanonicalTimeline;  // canonical truth
  readonly fieldResult: FieldResult;
  readonly detailedHitType: DetailedHitType;
  readonly rbiCount: number;
  readonly baseStateAfter: BaseState;
}

// UI 側のシーケンス構築
function buildAnimationSequence(resolution: PlayResolution): AnimationSequence {
  // resolution.timeline をそのまま読み、各 event に対して
  // - 描画コマンド（位置補間）
  // - 効果音
  // - テロップ
  // を割り当てる。タイミング自体は決して動かさない。
  // ただし easing や補間で「見せ方」は調整できる。
}
```

---

## §10 runner / inning / result の責務再定義（v3 重要）

### 10.1 設計意図

v0.43.0 までの runner.ts には「防衛コード」が大量にある:

```ts
// runner.ts L688-690
this.state = { ...nextState, count: { balls: 0, strikes: 0 } };
// processAtBat 内でもリセットするが、全ケースでの確実性を保証するため

// runner.ts L711-713
this.advanceBatterIndex();
// processAtBat は currentBatterIndex を +1 しない設計

// runner.ts L724-726
if (!this.state.isOver && this.state.outs >= 3) {
  this.switchHalfInning();
}
// processAtBat 内で 3アウトに達したが、switchHalfInning が呼ばれない
```

これは **責務が曖昧で、エンジン出力の不変条件が保証されていない**ことが原因。
v3 では責務を明確化し、防衛コードを不要にする。

### 10.2 責務対応表（v3 確定）

| 責務 | 担当ファイル | 役割 |
|---|---|---|
| **1 球の物理解決** | `engine/physics/resolver/index.ts` | trajectory → timeline → fieldResult |
| **打席の確定** | `engine/match/at-bat.ts` | 1 球を集めて打席結果を構築 |
| **打順の更新** | `engine/match/at-bat.ts`（ここで完結） | currentBatterIndex を +1 |
| **3 アウト判定** | `engine/match/at-bat.ts`（ここで判定） | outs === 3 を返す |
| **イニング切替** | `engine/match/inning.ts` | 3 アウトを受けて switchHalfInning |
| **試合終了判定** | `engine/match/inning.ts` | 規定回 + 点差で finalizeGame |
| **成績反映** | `engine/match/result.ts` | atBat 結果を player stats へ |
| **采配適用** | `engine/match/runner.ts` (Orchestrator) | TacticalOrder を state へ |
| **状態遷移オーケストレーション** | `engine/match/runner.ts` | 上記をつなぐ |
| **timeline 履歴管理** | `engine/match/runner.ts` | 直近 N 打席の timeline 保持 |

### 10.3 責務分離の核心ルール

#### ルール1: 不変条件は出力時に保証
- `processAtBat` の戻り値で **count は必ずリセットされている**
- `processAtBat` の戻り値で **currentBatterIndex は次の打者**
- `processAtBat` の戻り値で **outs が 3 なら結果がそれを示す（in_play_continues=false）**

→ これにより runner.ts の防衛コードは不要

#### ルール2: 各レイヤーは「自分の責務だけ」担当
- `processPitch` は 1 球の物理解決のみ。打席確定はしない
- `processAtBat` は打席確定のみ。イニング切替はしない
- `processHalfInning` はイニング進行のみ。試合終了は inning.ts に
- `runner.ts` は state 管理のみ。物理計算はしない

#### ルール3: ログは Orchestrator が一元管理
- 各処理関数は **events 配列を返す**だけ
- `runner.ts` がそれらを `state.log` に蓄積
- これにより各関数が純粋関数化、テストしやすい

### 10.4 既存ファイル別の改修方針

#### `engine/match/runner.ts`
- 物理計算呼び出しを `engine/physics/resolver` に委譲
- 防衛コード削除（処理関数の不変条件で保証）
- timeline 履歴管理を新規追加
- 既存インタフェース維持

#### `engine/match/at-bat.ts`
- 不変条件保証を強化（count/batterIndex/outs）
- 戻り値に「打席終了か継続か」のフラグを追加
- timeline を AtBatResult に同梱

#### `engine/match/inning.ts`
- 3 アウト到達時の switchHalfInning を確実に実行
- 試合終了判定を一元化
- 規定回処理を整理

#### `engine/match/result.ts`
- 成績集計のみ。物理依存なし
- timeline 履歴を試合結果に同梱

#### `engine/match/pitch/process-pitch.ts`
- 内部実装を **resolver 呼び出し**に変更
- 既存の `bat-contact.ts` / `field-result.ts` 呼び出し削除
- 既存インタフェース（戻り値型）維持

### 10.5 防衛コード削除の例

#### Before（v0.43.0）
```ts
// runner.ts stepOneAtBat()
const { nextState, result } = processAtBat(this.state, order, rng, overrides);
// ⚠️ 打席終了時にカウントを必ずリセット（防衛コード）
this.state = { ...nextState, count: { balls: 0, strikes: 0 } };
this.advanceBatterIndex();
if (!this.state.isOver && this.state.outs >= 3) {
  this.switchHalfInning();
}
```

#### After（v3）
```ts
// runner.ts stepOneAtBat()
const { nextState, result } = processAtBat(this.state, order, rng, overrides);
// 防衛コード不要: processAtBat が不変条件を保証
this.state = nextState;
// 3 アウト到達時のイニング切替も processAtBat → inning へ伝播
if (!this.state.isOver && this.state.outs >= 3) {
  this.state = switchHalfInning(this.state);
}
```

→ **約 30% のコード行数削減**を見込む。各処理関数の単体テストも書きやすくなる。

---

## §11 実装フェーズ（v3 確定）

### Phase R1: 軽量物理基盤（1 週間）
**目的**: 物理計算の核を最小実装。テスト駆動で確実に。

- R1-1. `engine/physics/types.ts` （型定義のみ、§4 §7 の型を全て）
- R1-2. `field-geometry.ts` （座標・距離・ファウルライン）
- R1-3. `movement.ts` （直線等加速度モデル + ETA）
- R1-4. `trajectory.ts` （解析式 + 抗力減衰、4 軸入力）
- R1-5. 単体テスト 30 件以上（物理妥当性）

**完了条件**:
- 物理ユーティリティが単体で動く
- `simulateTrajectory({...})` が物理的に妥当な結果を返す
- **benchmark 計測**: Layer 1-4 で目標時間内（§2.1）

### Phase R2: Bat-Ball Physics（半週）
**目的**: 25 入力 → 中間潜在量 → 4 軸打球パラメータの二段構造を実装。

- R2-1. `bat-ball/latent-state.ts` （Step A: 25入力 → 中間潜在量 5 軸）
- R2-2. `bat-ball/trajectory-params.ts` （Step B: 中間潜在量 → 4 軸）
- R2-3. `bat-ball/perceived-quality.ts` （投球の打者認知品質）
- R2-4. 単体テスト 40 件以上（潜在量の独立性、入力差→結果差）

**完了条件**:
- 潜在量 5 軸が独立にチューニング可能
- 入力差が結果差を生む（power=99 vs 100 で滑らか変化）
- **benchmark 計測**: Layer 3 で目標時間内

### Phase R3: Play Resolver（1.5 週間）
**目的**: 6 サブモジュールに分割した Resolver の実装。

- R3-1. `resolver/fielding-resolver.ts` + テスト
- R3-2. `resolver/throw-resolver.ts` + テスト
- R3-3. `resolver/baserunning-resolver.ts` + decisionMargin 計算 + テスト
- R3-4. `resolver/timeline-builder.ts` + テスト
- R3-5. `resolver/play-validator.ts` + テスト（不変条件 5 つ）
- R3-6. `resolver/result-deriver.ts` + 21 種分類器 + テスト
- R3-7. `resolver/index.ts` オーケストレータ
- R3-8. 統合テスト 80 件以上（timeline 整合性）

**完了条件**:
- `resolvePlay(state, trajectory, flight, rng)` が `PlayResolution` を返す
- timeline 不変条件が常に守られる（validator で検証）
- out/safe が物理時刻一貫で決まる
- 21 種分類器が動く

### Phase R4: 既存 engine への統合（1 週間）
**目的**: 既存 851 件のテストを壊さず、内部実装だけ差し替え。

- R4-1. `process-pitch.ts` 内部を Resolver 呼び出しに変更
- R4-2. 互換層: `BatContactResult` / `FieldResult` を timeline + trajectory から復元
- R4-3. `at-bat.ts` 改修（不変条件保証、防衛コード削除）
- R4-4. `inning.ts` 改修（3 アウト処理一元化）
- R4-5. `runner.ts` 改修（防衛コード削除、timeline 履歴管理）
- R4-6. 既存テスト全パス確認
- R4-7. 旧 `bat-contact.ts` / `field-result.ts` を deprecation コメント化

**完了条件**:
- 851/851 テストパス、新規 Resolver テストもパス
- runner.ts の防衛コード 30% 削減
- timeline 履歴が MatchState に同梱される

### Phase R5: UI 再生統一（1 週間）
**目的**: UI 側の重複物理計算を削除、timeline 再生に統一。

- R5-1. `useBallAnimation.ts` の build*Sequence を timeline 入力ベースに書き換え
- R5-2. v0.42.0 の 150ms ハック削除
- R5-3. UI 側の物理ユーティリティを engine/physics/ から再エクスポートに変更
- R5-4. 倍速 / スロー / 1球送り対応
- R5-5. UI テスト 65 件パス維持 + Viewer 整合テスト追加（§12.5）

**完了条件**:
- アウト/セーフが engine timeline と完全一致
- UI 側に結果決定ロジックが残っていない（補間・easing は許可）
- v0.42.0 ハック完全削除

### Phase R6: 表現拡張（1 週間）
**目的**: 21 種分類とドラマ性の演出強化。

- R6-1. 21 種を実況ログ・成績集計に組み込み
- R6-2. HR 種別演出（ライナー性 vs 高弾道）
- R6-3. ポテンヒット演出
- R6-4. フェンス直撃演出
- R6-5. NarrativeHook の生成 + 心理システム接続

**完了条件**:
- 21 種すべての出現確認（§8.3.A）
- 主要 8 種の単一試合での安定出現（§8.3.C）

### Phase R7: 戦術・感情・思考への接続（1 週間）
**目的**: 既存システムを Layer 3 / hook に接続して、ドラマ性を強化。

- R7-1. 既存 `BatterDetailedOrder` を Layer 3 入力 E に接続
- R7-2. 既存心理システム（v0.21.0）を hook 購読側に
- R7-3. 1 球ごと思考コメント生成（NarrativeHook → コメントテンプレ）
- R7-4. 実況パターン拡張（21 種 × 投球種 × カウント）

**完了条件**:
- 同じ打席を再現しても、心理状態・采配が違えば結果が変わる
- 思考コメントが状況に応じて多様化

### Phase R8: バランス調整（独立フェーズ、1-2 週間）
**目的**: 統計的に野球らしい結果分布へのチューニング。

- R8-1. 1000 試合シミュ自動実行スクリプト
- R8-2. 統計集計ダッシュボード（打率・HR率・三振率・21 種分布）
- R8-3. 物理パラメータ調整（exit velocity 分布・抗力係数等）
- R8-4. 多様性指標（同型プレー連発率）の計測と調整
- R8-5. 21 種頻度レンジ確認（§8.3.B）と希少分類の長期確認（§8.3.D）

**完了条件**: §12.3 の目標範囲に収束、多様性指標が許容範囲。

**合計**: 約 7-8 週間（フェーズ単位でリリース可能、Phase R4 完了時点で本番投入可）

---

## §12 テスト戦略（v3 拡張: 5 層）

### 12.1 Layer 1: 物理基礎テスト（Layer 1-4 単体）

**目的**: 物理計算が破綻しないこと。

| 種類 | 例 |
|---|---|
| 単調性 | exitVelocity を上げると range が単調増加 |
| 値域 | hangTime > 0、apex >= 0、speed >= 0 |
| 境界 | exitVelocity=0 で range=0、max angle で range 最大 |
| 一貫性 | positionAt(0) == startPos, positionAt(hangTime) == landingPoint |
| 走者・送球 | 反応時間後に必ず移動、最高速で頭打ち |
| 中間潜在量 | 各潜在量が独立に変化する（barrel と timing は独立） |

**件数目安**: 70 件

### 12.2 Layer 2: 解決整合テスト（Layer 5）

**目的**: timeline の不変条件が守られること、out/safe が物理一貫であること。

| 種類 | 例 |
|---|---|
| 時刻単調 | events が必ず昇順 |
| 因果 | runner_out の前に throw_arrival がある |
| 物理整合 | out 判定なら throw + decisionMargin < runner |
| タッチアップ | 捕球時刻と離塁時刻の関係が正しい |
| 強制進塁 | force_out が正しく発生 |
| decisionMargin | 同じ走者でも采配・状況で結果が変わる |

**件数目安**: 100 件

### 12.3 Layer 3: 野球分布テスト（統合・統計）

**目的**: ゲームとして妥当な結果分布。

| 指標 | 目標範囲 |
|---|---|
| リーグ打率 | .240 - .300 |
| 出塁率 | .300 - .380 |
| HR/試合 | 0.4 - 1.5 |
| 三振率 | 18% - 25% |
| 四球率 | 7% - 12% |
| 内野安打率（全安打中） | 8% - 15% |
| エラー/試合 | 0.3 - 1.0 |

**件数目安**: 1000 試合シミュを 1 ケース、複数 seed で 10 ケース

### 12.4 Layer 4: 多様性テスト（ゲーム体験品質）

**目的**: 「同じ打球が二度と起きない」が実現されているか。

| 種類 | 例 |
|---|---|
| 21 種出現確認（§8.3.A） | 1000 打席で全 21 種出現 |
| 主要 8 種安定（§8.3.C） | 単一試合で頻出 8 種が 1 回以上出現 |
| 希少 5 種長期（§8.3.D） | 30 試合シミュで希少 5 種が出現 |
| 同型連発率 | 連続 5 打席が同じ detailedHitType の確率 < 1% |
| 能力差反映 | power=99 と power=100 で HR 率が単調変化 |
| 采配差反映 | aggressiveness 別に出塁率・HR 率が異なる |
| decisionMargin 多様性 | 同走者でも采配で進塁判断が変わる |
| ボール座標分散 | 同じ batter vs pitcher 1000 打席で exitVelocity 分散 >10mph |

**件数目安**: 50 件（統計的検定込み）

### 12.5 Layer 5: 再生 E2E / Viewer 整合テスト（v3 新規）

**目的**: timeline と UI 再生が常に整合すること、UI 操作で結果が変わらないこと。

| 種類 | 例 |
|---|---|
| 固定 seed 一致 | 同じ seed → スコア・アウト・塁状況・実況ログ・アニメイベントが完全一致 |
| 倍速再生 | 等速 / 倍速 / スロー で結果が同じ |
| 1球送り | 1球ずつ進めても、最後まで進めても、結果が一致 |
| timeline順 vs UI順 | timeline のイベント順と UI 描画イベント順が一致 |
| リプレイ再現 | 試合終了後 timeline+seed で完全再現 |
| Resume | 中断 → 再開で MatchState が一致 |
| Debug fixture | bug fixture（seed + state）で症状再現 |
| easing 整合 | easing 適用しても到達順は変わらない |

**件数目安**: 30 件

→ 計 **250+ 件のテスト**で物理〜ゲーム品質〜UI 再生まで検証可能。

---

## §13 リスクと対策（v3 確定）

| リスク | 影響度 | 対策 |
|---|---|---|
| 既存 851 件の互換性破壊 | 高 | Phase R4 で互換層を厚く、新旧並行運転期間を設ける |
| 物理パラメータのチューニング困難 | 中 | Phase R8 を独立フェーズに切り出し、自動シミュ + ダッシュボードで反復 |
| timeline 構築のバグで out/safe 矛盾 | 高 | play-validator を strict にし、違反は例外で fail-fast（dev環境） |
| UI 側の演出補間不足で「ガクガク」見える | 中 | R5 で easing 必須化、Viewer 整合テスト追加 |
| パフォーマンス劣化 | 中 | §2.1 の目標を benchmark で確認、未達なら局所最適化 |
| 21 種分類のルールが現実と乖離 | 低 | R6 でルール調整、シニア視聴者レビュー |
| 実装期間が伸びる | 中 | Phase 単位でリリース可能な設計、R4 完了時点で本番投入可能 |
| Resolver が神クラス化 | 中 | §6 の 6 サブモジュール分割で構造的に防止 |
| 走者判断が単調化 | 中 | §5 decisionMargin の入力多様化で対応 |
| 再現性破綻（seed → timeline 不一致） | 高 | RNG seed の timeline 同梱、derive キー命名厳格化 |
| 中間潜在量のチューニング難航 | 中 | Step A / Step B の独立テスト、潜在量可視化ツール |
| ACP サブエージェント spawn 失敗 | 中 | /new で別チャット利用、または main 直接実装に切替 |

---

## §14 次のステップ

### 即時（Step 1.6 完了後）
1. **本ドキュメントのレビュー**（高橋さん）
2. Phase R1 着手判断:
   - 案 A: main 直接実装（確実、低リスク、所要 4-6 時間/ファイル）
   - 案 B: /new で別チャット作成し ACP 経由（並列性あり、ただし spawn 信頼性懸念）
   - 案 C: ハイブリッド（型定義は main、計算実装は ACP）

### 短期（Phase R1-R3 完了）
3. R1 物理基盤実装 + benchmark
4. R2 Bat-Ball Physics 実装（中間潜在量検証）
5. R3 Resolver 実装（6 サブモジュール）

### 中期（Phase R4-R5 完了）
6. R4 既存 engine 統合（互換性確認、851 件パス）
7. R5 UI 再生統一（v0.42.0 ハック削除）

### 長期（Phase R6-R8 完了）
8. R6 表現拡張（21 種実況・演出）
9. R7 戦術・感情接続（既存心理システム + 新 NarrativeHook）
10. R8 バランス調整（1000 試合シミュ）

---

## §15 まとめ：Step 1.6 で達成したこと

Step 1（v1）が **「何を作るか」のスケッチ**、
Step 1.5（v2）が **「どう軽く強く作るか」の設計指針**だったとすれば、
Step 1.6（v3）は **「このまま実装タスクに分解できる仕様書」**である。

### 主な達成
- 物理シミュ路線維持しつつ、性能値を「設計目標」として benchmark 検証する形に整理
- 投球の打者認知抽象品質パラメータを Layer 3 入力に追加（perceivedPitchQuality）
- Play Resolver を 6 サブモジュールに分割（神クラス化を構造的に防止）
- 走者判断に decisionMargin を導入（能力・采配・状況で揺れる判断）
- 25 入力 → 中間潜在量 5 軸 → 4 軸打球パラメータの二段構造（チューニング容易）
- 21 種分類の品質条件を 4 段階に分割（存在 / 頻度 / 安定 / 希少）
- UI 側の制約を「結果決定ロジック禁止」に整理（補間・easing は許可）
- runner / inning / result の責務対応表を明示（防衛コード削除）
- Timeline の Replay / Resume / Debug 価値を設計に組み込み
- テスト 5 層化（物理 / 整合 / 分布 / 多様性 / 再生 E2E）

### 次に取るべき判断
- Phase R1 着手の GO/STOP
- 実装方式（main 直接 / ACP 並列 / ハイブリッド）
- 各 Phase の優先順位（R4 完了で本番投入可能）

これにより、**「同じ打球が二度と起きない、過程にドラマがある、能力差が手触りに出る、納得感のある高校野球体験」** の基盤を、軽量に・拡張可能に・テスト可能に・実装可能なレベルで構築する設計が固まった。

---

# 付録 A: Step 1.5 → Step 1.6 差分要約

## 維持した点
- ✅ 物理シミュ路線（軽量で説得力のある物理）
- ✅ 6 レイヤーアーキテクチャ
- ✅ engine が canonical truth、UI は再生
- ✅ 25 入力変数の連続性で「同じ打球が二度と起きない」
- ✅ 21 種打球分類の存在意義
- ✅ timeline ベースの 1 球解決
- ✅ 既存 851 テストの互換性方針
- ✅ Phase 区切りでリリース可能な設計
- ✅ 将来拡張（采配・感情・実況・球場差・守備シフト・配球学習）の接続点

## 強化した点
- 🔧 §1.3 厳密化と近似の使い分け表に「投球3D軌道は持たない / 打者認知品質は持つ」を明記
- 🔧 §2.1 計算コストを「保証値」から「設計目標 + benchmark 検証」に変更
- 🔧 §3.2 投球の打者認知品質パラメータ（perceivedPitchQuality）を Layer 3 入力に追加
- 🔧 §4 中間潜在量 5 軸（contactQuality / timingWindow / swingIntent / decisionPressure / barrelRate）の二段構造を新設
- 🔧 §5 走者判断に decisionMargin を導入、§5.4 で公式概念を明示
- 🔧 §6 Play Resolver の 6 サブモジュール分割を新設
- 🔧 §7.3 Timeline の Replay / Resume / Debug 価値を新設
- 🔧 §8.3 21 種分類の品質条件を 4 段階に分割（存在 / 頻度 / 安定 / 希少）
- 🔧 §9.1 UI 側制約を「物理計算禁止」から「結果決定ロジック禁止」に修正
- 🔧 §10 runner / inning / result の責務対応表を新設
- 🔧 §11 Phase 構成を R1-R8 に再編（Bat-Ball Physics と Resolver を分離、戦術接続を独立化）
- 🔧 §12 テストを 5 層化（再生 E2E / Viewer 整合テストを追加）

## 修正した点
- ✏️ v2 §2.1「1 球 <150μs」を「設計目標 <200μs（実装後 benchmark 検証）」に修正
- ✏️ v2 §6.3 UI 側「物理計算が残っていない」を「結果決定ロジックが残っていない」に修正
- ✏️ v2 §8 21 種完了条件「全種出現 + 目標頻度」を 4 段階に分割
- ✏️ v2 §8（Phase R5 完了条件）の単一基準を §8.3.A-D に分けて記述
- ✏️ Phase 区切りを R5 → R8 に拡張（実装範囲を明確化）

## 後段に回した点
- ⏬ 詳細な分類器コード実装 → Phase R3 R3-6 で詳細化
- ⏬ 球場差・天候の係数定義 → Phase R8 以降
- ⏬ baserunning AI の独立化 → Phase R7 以降
- ⏬ 学習型走者 AI（強化学習等）→ 将来拡張枠
- ⏬ 実況テンプレ拡張の網羅 → Phase R7

## 新規追加した観点
- ➕ perceivedPitchQuality（投球の打者認知品質）
- ➕ 中間潜在量 5 軸 + 二段構造
- ➕ decisionMargin（走者判断のマージン）
- ➕ Play Resolver の 6 サブモジュール
- ➕ Timeline の Replay / Resume / Debug 価値
- ➕ 21 種品質条件 4 段階
- ➕ runner / inning / result 責務対応表
- ➕ Layer 5 再生 E2E / Viewer 整合テスト
- ➕ benchmark 計測項目（性能目標達成検証）

---

**結語**: Step 1.6 設計書は「物理を本気でやる、ただし軽く・強く・拡張可能に・実装可能に」を全体テーマとし、Step 1.5 のレビューで指摘された 10 のポイントすべてを構造に組み込んだ。これは **「リアルに見えるだけ」ではなく「物理・能力・判断・感情がつながった、ドラマのある高校野球試合体験」** の基盤を作るための、**実装タスクに分解できる精度**まで固めた最終設計指針である。次のステップは Phase R1 の着手判断と、main 直接実装 / ACP 並列 / ハイブリッドの方式選択である。
