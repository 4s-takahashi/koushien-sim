# Step 1.5: 軽量物理シミュレーション前提の再設計書

**作成**: 2026-04-27 / **版**: v2（レビュー反映版） / **対象**: koushien-sim 試合エンジン再構築
**前版**: REBUILD_ANALYSIS.md (v1, 595行)
**位置づけ**: Step 1（v1 分析）→ **Step 1.5（v2 軽量化再設計）** → Step 2 以降で実装

---

## 序文

本ドキュメントは、v1 設計書（REBUILD_ANALYSIS.md）に対するレビューを踏まえた **再設計版**である。

v1 では「engine 側に物理シミュを導入し、UI 側との二重シミュ構造を解消する」という大方針を提示した。レビューはその方向性を全面的に支持しつつ、**以下の補強を要請**している:

1. 物理路線は維持。**ただし「軽くて成立する物理」**として設計しなおすこと
2. 各レイヤーで「何を連続値で持ち、何を近似で済ますか」を明確化
3. 「同じ打球が二度と起きない」を**入力変数の連続性と個体差**から導出
4. 21 種分類は **物理結果からの読み取りラベル**として位置づける
5. UI は engine の timeline を**再生する場**として確定（演出補間は許容、結果改変は禁止）
6. 将来の **采配・感情・実況**への接続点を最初から明記
7. 実装順は **最も軽くて価値が高い核から** 積み上げる
8. テストは **物理・整合・分布・多様性**の 4 層

このゲームは、結果テーブルを抽選する従来型野球ゲームではなく、**「同じ打球が二度と起きない・過程にドラマがある・能力差が手触りに出る」高校野球体験**を目指す。物理シミュはそのための基盤であり、目的ではない。本書は **「物理を本気でやる、ただし軽く・強く・拡張可能に」** という前提で全章を書き直したものである。

---

## §1 設計哲学：軽量で説得力のある物理

### 1.1 基本テーゼ

> **流体力学的に厳密な物理ではなく、野球ゲームとして「説得力」と「個体差」と「揺らぎ」を生む最小限の物理を採用する。**

野球ゲームのドラマを生むのに必要なのは、**完全再現された流体力学**ではなく、

- 投球品質と打者タイミングの**連続値**による打球パラメータ生成
- 打球初速・打球角度・水平角度から**解析式で**到達点と滞空時間を算出
- 守備・走塁の**到達時刻比較**による out/safe 判定
- 入力の連続性が結果の連続性を生む構造

この4要素である。これらは O(1) 〜 O(N) で実装でき、毎打席数百μs で解決可能。重い数値積分は不要。

### 1.2 厳密化と近似の使い分け原則

| カテゴリ | 扱い | 理由 |
|---|---|---|
| 打球初速・打球角度・水平角度 | **連続値**で持つ | プレー差・能力差の本質変数 |
| 打球軌道計算 | **解析式 O(1)** | 二次関数 + 抗力減衰係数で十分 |
| バウンド後の挙動 | **減衰係数 + 単純運動** | 何度もバウンドするゴロは離散イベント化 |
| 野手・走者の移動 | **直線等加速度モデル** | 反応時間 + 最高速 + 加速度の3パラ |
| 送球 | **直線距離 / 送球速度** | 体勢補正だけ係数で表現 |
| スピン | **back/side の2 軸スカラー** | 結果バイアスとして粗く適用 |
| 空気抵抗 | **距離依存の単純減衰** | 数値積分はしない |
| 変化球の軌道 | 視覚演出のみで再現、エンジン上は到達点で表現 | 投球軌道は打撃判定に影響しない（コースだけ重要） |
| 風・天候 | **将来拡張（係数として差し込み可能な形だけ確保）** | 初期実装では係数 1.0 |

→ **核心**: 連続値で持つのは「打球生成の入力変数」と「打球初速・角度」。それ以降は解析式・到達時刻比較で O(1) 解決。

### 1.3 「説得力」の定義

物理的に正しい必要はないが、以下を満たす必要がある:

1. **入力差が結果差を生む**: 打者 power が高ければ exitVelocity が高い、足が速ければ内野安打になりやすい等
2. **整合性が崩れない**: アウトと表示されたなら送球が先着している、犠牲フライ成立なら捕球時刻 < 走者ホーム到達時刻
3. **境界が連続的**: 打率.250 と.300 の打者で、結果がスムーズに変わる（離散ジャンプしない）
4. **再現可能**: 同じ RNG seed なら同じ結果（デバッグ・リプレイ可能）

---

## §2 6 レイヤー構成（再定義）

```
┌────────────────────────────────────────────────────────────┐
│ Layer 6: Match Orchestrator (engine/match/runner.ts)       │
│  責務: イニング進行・采配適用・停止判定・状態遷移管理      │
│  計算: O(1) 状態遷移                                       │
│  保持: 既存インタフェース維持                              │
└────────────────────────────────────────────────────────────┘
                          ↑↓ canonical timeline
┌────────────────────────────────────────────────────────────┐
│ Layer 5: Play Resolver (engine/physics/play-resolver.ts)   │
│  責務: 1 球の解決・タイムライン構築・out/safe 判定         │
│  計算: 離散イベント駆動 (1 プレイあたり <50 イベント)       │
│  出力: PlayResolution { trajectory, timeline, fieldResult } │
└────────────────────────────────────────────────────────────┘
                          ↑↓
┌────────────────────────────────────────────────────────────┐
│ Layer 4: Ball Trajectory (engine/physics/trajectory.ts)    │
│  責務: 初速・角度から着弾点・滞空時間を返す                │
│  計算: 解析式 O(1)（重力 + 抗力減衰係数）                  │
│  値域: 連続値（landingPoint, hangTime, apex）              │
└────────────────────────────────────────────────────────────┘
                          ↑↓
┌────────────────────────────────────────────────────────────┐
│ Layer 3: Bat-Ball Physics (engine/physics/bat-ball.ts)     │
│  責務: 投球品質 × 打者反応 → 打球初速・角度・水平角度       │
│  計算: 連続値生成、確率は揺らぎ項としてのみ使用            │
│  入力変数: §4 で詳述                                       │
└────────────────────────────────────────────────────────────┘
                          ↑↓
┌────────────────────────────────────────────────────────────┐
│ Layer 2: Player Movement (engine/physics/movement.ts)      │
│  責務: 反応時間 + 加速 + 最高速での到達時刻計算            │
│  計算: 解析式 O(1) （直線等加速度）                         │
│  対象: 野手・走者・送球                                    │
└────────────────────────────────────────────────────────────┘
                          ↑↓
┌────────────────────────────────────────────────────────────┐
│ Layer 1: Field Geometry (engine/physics/field-geometry.ts) │
│  責務: 球場座標系・距離計算・ファウルライン判定            │
│  計算: O(1) 純粋関数                                       │
│  値: 静的定数（塁・守備位置・フェンス）                    │
└────────────────────────────────────────────────────────────┘
```

### 2.1 計算コスト設計

| Layer | 1 プレイあたり呼び出し回数 | 各呼び出しの計算量 | 総コスト目安 |
|---|---|---|---|
| L1 Field | ~10 回 | O(1) 算術 | <10μs |
| L2 Movement | ~10 回（野手 + 走者 + 送球） | O(1) 解析式 | <20μs |
| L3 Bat-Ball | 1 回（in_play 時） | O(1) ガウス + 補正 | <5μs |
| L4 Trajectory | 1 回（連続位置取得は別途） | O(1) 解析式 | <5μs |
| L5 Resolver | 1 回 | <50 イベントソート | <50μs |
| L6 Orchestrator | 1 回 | 状態コピー + ログ | <20μs |
| **合計** | 1 球あたり | | **<150μs** |

→ 1 試合 ~300 球で **45ms 程度**。9 試合並行シミュでも 1 秒未満。バランス調整に必要な 1000 試合シミュも数十秒で完了。

### 2.2 各レイヤーの責務（詳細）

#### Layer 1: Field Geometry
- **持つ**: 球場座標（feet）、塁座標、標準守備位置、フェンス座標、ファウルライン
- **持たない**: 動的な野手位置（Layer 2）、打球の今の位置（Layer 4）
- **連続/近似**:
  - 連続: 任意座標、任意距離
  - 近似: 球場形状はファウルライン2本＋外野フェンス（円弧近似）
- **拡張点**: 将来の球場差は座標定数の差し替えだけで対応

#### Layer 2: Player Movement
- **モデル**: 反応時間 → 等加速度で目標方向に直線移動 → 最高速で巡航
- **入力**: `from`, `to`, `topSpeed`, `acceleration`, `reactionTime`
- **出力**: `etaMs(t)`, `positionAt(t)`
- **連続/近似**:
  - 連続: 速度・加速度・到達時刻
  - 近似: 移動経路は直線（守備の回り込みなどは演出側で補間）
- **拡張点**: 守備シフトは初期位置を変えるだけ、性格による反応時間バイアスも係数で乗せられる

#### Layer 3: Bat-Ball Physics
- **モデル**: 投球品質 + 打者反応から **打球初速 / 打球角度 / 水平角度 / スピン** の連続値を生成
- **構造**: 入力ベクトルから期待値を決定 → ガウス揺らぎで個体差を出す
- **連続/近似**:
  - 連続: exitVelocity, launchAngle, sprayAngle, spin（4 軸）
  - 近似: スピンは back/side のスカラー 2 軸のみ
- **特徴**: ここに来る入力変数の数と質が「同じ打球が二度と起きない」を生む。§4 で詳述

#### Layer 4: Ball Trajectory
- **モデル**: 二次関数（重力）+ 距離依存抗力減衰 + バウンド減衰
- **公式**:
  ```
  z(t) = v0 * sin(angle) * t - 0.5 * g * t² (空気抵抗減衰係数 k 込み)
  range = v0² * sin(2*angle) / g * (1 - airDragK * v0)
  ```
- **連続/近似**:
  - 連続: 位置 (x, y, z)、速度
  - 近似: 空気抵抗は経路積分せず係数で
- **出力**: `landingPoint`, `hangTime`, `apex`, `positionAt(t)`（任意時刻の 3D 位置）

#### Layer 5: Play Resolver
- **モデル**: 離散イベントのタイムラインを構築。各エージェントの ETA を Layer 2-4 から計算し、時刻順ソート
- **判定ルール**:
  - out/safe は **塁到達時刻 vs 送球到着時刻** で決まる
  - エラー、暴投、トンネル、捕球失敗は **能力ベースの確率** を局所的に適用（揺らぎ）
  - タッチアップは **捕球時刻 vs 離塁可能時刻** で判定
- **出力**: `PlayResolution { trajectory, flight, timeline, fieldResult, detailedHitType }`
- **重要**: ここで生成された timeline が **canonical truth**。UI はこれを再生するだけ。

#### Layer 6: Match Orchestrator
- **責務のみに専念**: 既存 `runner.ts` のインタフェースを保ち、内部で Layer 5 を呼ぶ
- **持たない**: 物理計算・打球判定・走塁判定
- **持つ**: イニング遷移、采配適用、勝敗判定、ログ蓄積

---

## §3 入力変数設計：「同じ打球が二度と起きない」を生む構造

### 3.1 設計方針

「ランダムだから毎回違う」のではなく、**「入力が毎回少しずつ違うから結果も毎回少しずつ違う」**を実現する。これにより、揺らぎが**必然性を伴った揺らぎ**になる。

### 3.2 Layer 3 の入力変数群（5 カテゴリ × 計 25 変数）

#### A. 投球品質（投手側 7 変数）
| 変数 | 連続値 | 影響先 |
|---|---|---|
| pitch.velocity | km/h, 連続 | 打者タイミング、打球初速ベース |
| pitch.type | 離散カテゴリ | スピン傾向、減速プロファイル |
| pitch.breakLevel | 1-7 連続化 | コース誤差、スイング判断難度 |
| pitch.actualLocation.row/col | 5×5 グリッド + ノイズ | 接触ポイント、引っ張り/流し方向 |
| pitcher.control | 0-100 | 制球誤差の幅 |
| pitcher.stamina（残り） | 0-100 | 球速・制球の劣化 |
| pitcher.confidence | 0-100 | 揺らぎの分散 |

#### B. 打者特性（打者側 6 変数）
| 変数 | 連続値 | 影響先 |
|---|---|---|
| batter.contact | 0-100 | 期待タイミング誤差の小ささ |
| batter.power | 0-100 | exitVelocity ベース |
| batter.eye | 0-100 | コース見極め（boller見送り率） |
| batter.technique | 0-100 | 狙い通り打てる確率（spray 分散） |
| batter.battingSide | 左/右/スイッチ | 引っ張り方向 |
| batter.swingType | 離散（流し打ち/引っ張り/万能） | 期待 sprayAngle |

#### C. タイミング状態（打席内 4 変数）
| 変数 | 連続値 | 影響先 |
|---|---|---|
| timingError | -100ms 〜 +100ms 連続 | 接触ポイントずれ → exitVelocity 低下 + spray ズレ |
| ballOnBat（芯ズレ） | 0.0-1.0 | exitVelocity, launchAngle ばらつき |
| previousPitchVelocity | km/h | 緩急効果（タイミング崩しの履歴依存） |
| count.balls/strikes | 0-3 / 0-2 | 追い込まれた打者は守備的スイング |

#### D. 状況補正（試合状況 4 変数）
| 変数 | 連続値 | 影響先 |
|---|---|---|
| inning + score | リード差・回 | プレッシャー → mental 補正 |
| outs | 0-2 | アウトカウント別の積極性 |
| baseState | 走者状況 | 引っ張りバイアス（一塁→二塁進塁狙い等） |
| isKeyMoment | bool | キー打席は揺らぎ縮小 (focus 効果) |

#### E. 采配・性格（接続点 4 変数）
| 変数 | 連続値 | 影響先 |
|---|---|---|
| order.focusArea | inside/outside/low/high/middle | sprayAngle バイアス |
| order.aggressiveness | passive/normal/aggressive | スイング判断、ボール球追いかけ率 |
| traits[] | 性格特性配列（既存システム） | 各種補正係数 |
| mood | 当日のコンディション | 全体的な揺らぎ拡大/縮小 |

### 3.3 連続性の保証

**重要**: 上記 25 変数のほとんどが連続値（または高解像度離散値）。期待値計算は連続関数で、揺らぎは **正規分布（rng.gaussian）**で乗せる。これにより:

- power=99 と power=100 の打者で結果が**滑らかに**変わる
- 同じ打者でも疲労蓄積（stamina）に応じて結果が**徐々に**変わる
- 同じ状況が再現することが理論的にあっても、25 変数のすべてが揃うことは事実上ない

→ **「同じ打球が二度と起きない」は確率的偶然ではなく、入力空間の高次元性から構造的に保証される**

### 3.4 Bat-Ball Physics の出力（4 軸連続値）

```ts
interface BallTrajectoryParams {
  exitVelocity: number;   // 50-180 km/h 連続
  launchAngle: number;    // -20° 〜 +60° 連続
  sprayAngle: number;     // -10° 〜 +100° 連続（ファウル含む）
  spin: { back: number; side: number };  // 各 -3000〜+3000 rpm 連続
}
```

→ Layer 4 はこれらを受け取って軌道を計算するだけ。Layer 3 と Layer 4 のインタフェースが連続値 4 軸でクリーンに分離される。

---

## §4 Timeline モデル

### 4.1 Canonical Timeline

```ts
interface CanonicalTimeline {
  /** 各イベントは絶対時刻 (ms, 0=ピッチリリース or 打球発生) */
  events: TimelineEvent[];
  /** ソート済み・整合性検証済み */
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

### 4.2 Timeline の不変条件（Resolver で必ず守る）

1. **時刻単調**: events は t 昇順
2. **因果整合**: `runner_out` の前に対応する `throw_arrival` または `fielder_field_ball` がある
3. **物理整合**: アウト判定の場合 `throw_arrival.t < runner.eta_to_base.t`
4. **進塁整合**: `runner_advance` の前に走者がそのベースから離れている（`runner_lead_off` または前イベント）
5. **完結性**: 必ず `play_end` で終わる

→ Resolver 内で構築直後にバリデーションする。違反したら例外。これにより v0.42.0 のような 150ms ハックは構造的に発生しえない。

### 4.3 Resolver アルゴリズムの骨子

```
1. Layer 3 から BallTrajectoryParams 取得
2. Layer 4 から flight (landingPoint, hangTime, positionAt) 取得
3. Layer 1 から関連野手リスト取得（着弾点近傍）
4. Layer 2 から各野手の ETA 計算
5. 最初に到達する野手を fielder として選出
6. fielder_field_ball イベント生成（catch/cleanCatch 判定）
7. 走者の状態を見て、各走者の意思決定:
   - 強制進塁? → 必ず進む
   - 任意進塁? → 「進塁時間 < 送球時間」なら進む（マージン付き）
8. fielder_throw → throw_arrival → runner_safe/out を時刻比較で決定
9. timeline をソート + バリデーション
10. fieldResult（既存型）を timeline から導出
```

### 4.4 ファウル・空振り・見逃しの扱い

- 空振り: `ball_contact` を生成しない、`swing_start` だけ
- 見逃し: `swing_start` も無し、`ball_at_plate` のみ
- ファウル: `ball_contact` → `foul` イベントで終了。trajectory は持つが flight は ground 着弾扱い
- ファウルフライ: `ball_contact` → `ball_landing`（ファウル領域）→ 捕球可能なら `fielder_field_ball`

---

## §5 21 種分類は「物理結果からの読み取りラベル」

### 5.1 位置づけ

**21 種分類は最初に抽選するものではない。** Resolver が物理結果として確定した `BallTrajectoryParams` + `BallFlight` + 守備イベントを **読み取って分類**する、純粋な後段ラベル付け処理である。

```ts
// engine/physics/detailed-classifier.ts
function classifyDetailedHit(
  trajectory: BallTrajectoryParams,
  flight: BallFlight,
  timeline: CanonicalTimeline,
  baseState: BaseState,
): DetailedHitType { ... }
```

### 5.2 分類ロジック（ルールベース、O(1)）

```
判定順:
1. ファウル系
   - sprayAngle < -5° || > 95° → foul_*
2. 飛距離 + 高さ系
   - exitVelocity > 95mph && launchAngle 25-35° && range > 380ft → line_drive_hr
   - exitVelocity > 90mph && launchAngle 30-45° && range > 380ft → high_arc_hr
   - range > 320ft && fenceHit → wall_ball
3. 内野/外野系
   - landingPoint が内野ダイヤモンド内
     - launchAngle < 5° → ground_ball 系（spray で4方向分類）
     - launchAngle > 60° → high_infield_fly
     - 5°-25° → infield_liner
     - 内野手未到達 + 外野手前着地 → over_infield_hit
   - landingPoint が外野
     - hangTime > 4.5s → deep_fly
     - hangTime 3.0-4.5s → medium_fly
     - hangTime < 3.0s + range > 200ft → line_drive_hit
     - range < 200ft → shallow_fly
     - 内外野間（ポテン） → over_infield_hit
4. 特殊系
   - exitVelocity < 60mph && launchAngle 5-20° && pitcher 近辺 → comebacker / check_swing_dribbler
```

### 5.3 利点

- 物理結果が変われば自然に分類も変わる → 整合性が常に保たれる
- 21 種に新しい分類を足すのも、ルール追加だけで済む
- UI 表示・実況コメント・統計集計の基礎データとして使える

### 5.4 利用先

- **実況ログ**: 「センター前へ抜けるクリーンヒット！」「フェンス直撃の二塁打！」
- **試合後成績**: 内野安打率・引っ張り/流し/センター返し別打率
- **演出**: HR 種別ごとに異なるカメラワーク
- **思考コメント**: 「あと数センチでフェンスオーバーだったか…」

---

## §6 UI の役割：再生する場、演出を加える場

### 6.1 役割の確定

```
engine                      UI
─────────────────           ──────────────────
canonical timeline   ───→   タイムライン再生
（変更不可）                 - フレーム補間
                            - easing 適用
                            - カメラワーク
                            - 効果音タイミング
                            - 表示遅延
                            - 演出オーバーレイ
                          ↓
                          結果は変えない
                          到達順は変えない
                          時刻オフセットは
                          演出許容範囲内のみ
```

### 6.2 UI に許可される演出

- **時間スケーリング**: スロー再生・倍速再生（プレイヤー操作）
- **easing**: 走者の加減速を自然な曲線で見せる（線形補間より滑らか）
- **表示遅延**: 効果音・テロップを少し遅らせて見やすくする
- **カメラ追従**: ボール・打者を追いかける視点切替
- **粒子演出**: バット軌跡・砂ぼこり・歓声フェード

### 6.3 UI に禁止される操作

- **結果改変**: out/safe を変えない、ヒット/エラーを変えない
- **到達順反転**: 送球先着 → 走者先着など、イベント順を変えない
- **物理計算の重複実装**: trajectory も movement も engine が決定済み

### 6.4 接続インタフェース

```ts
// engine からの出力（変更不可・読み取り専用）
interface PlayResolution {
  readonly trajectory: BallTrajectoryParams;
  readonly flight: BallFlight;
  readonly timeline: CanonicalTimeline;  // canonical truth
  readonly fieldResult: FieldResult;
  readonly detailedHitType: DetailedHitType;
}

// UI 側のシーケンス構築（v0.42.0 ハック削除後の姿）
function buildAnimationSequence(resolution: PlayResolution): AnimationSequence {
  // resolution.timeline をそのまま読み、各 event に対して
  // - 描画コマンド（位置補間）
  // - 効果音
  // - テロップ
  // を割り当てる。タイミング自体は決して動かさない。
}
```

→ v0.42.0 の `throwEnd = batterEnd - 150ms` のような調整は不要。物理整合は engine が保証している。

---

## §7 将来拡張への接続点

設計書として、以下を **最初から接続可能な形**で確保しておく:

### 7.1 細かい采配（既存 BatterDetailedOrder / PitcherDetailedOrder の活用）
- **接続点**: Layer 3（Bat-Ball Physics）の入力 E カテゴリ
- 例: `order.focusArea === 'outside'` → 打者の sprayAngle 期待値が流し方向にバイアス
- 既存型 `BatterDetailedOrder` をそのまま渡せる

### 7.2 選手の能力差・性格差
- **接続点**: Layer 3 の入力 B + E カテゴリ
- 例: trait `aggressive_swinger` → ボール球スイング率 +15%、boller時の timingError 拡大
- 性格による反応時間バイアス（Layer 2）

### 7.3 感情表現・思考コメント
- **接続点**: Layer 5 の出力に `narrativeHooks: NarrativeHook[]` を追加
- 例: `{ kind: 'close_call', t: 4500, intensity: 0.9 }` → UI 側で「セーフ！危なかった！」コメント生成
- 既存の心理システム（v0.21.0 で導入）が hook をフックして思考メッセージ生成

### 7.4 実況の多様化
- **接続点**: detailedHitType + timeline + 状況コンテキストを実況テンプレに渡す
- 例: 「3-2 から外角スライダーを軽打、ライト前へ運ぶ流し打ち」
- 21 種分類 × カウント × 投球種 × 結果で組み合わせ爆発するが、テンプレ + 変数置換で対応

### 7.5 球場差・天候（将来）
- **接続点**: Layer 1（球場座標定数）+ Layer 4（trajectory の係数）
- 例: ドーム球場 → 風 0、屋外 → 風ベクトル × HR ライン補正
- 初期実装ではフックだけ用意（係数 1.0）

### 7.6 守備シフト
- **接続点**: Layer 2 の野手初期位置
- 例: 引っ張り傾向強い打者には三遊間寄り → 着弾点判定がそのまま影響
- 既存 `fieldPositions: Map<playerId, Position>` を拡張して座標も持てるように

### 7.7 配球学習・打者の慣れ
- **接続点**: Layer 3 の入力 C カテゴリ（履歴依存）
- 既存 `currentAtBatPitches: PitchHistoryEntry[]` を Layer 3 に渡す
- 緩急効果・コース慣れによる timingError 補正

→ **すべての拡張点が「Layer 3 の入力ベクトルに何かを加える」「Layer 5 の hook を購読する」という同じ形式に集約される**。設計が拡張に強い。

---

## §8 実装フェーズ（軽量から積み上げる順）

### Phase R1: 軽量物理基盤（1 週間）
**目的**: 物理計算の核を最小実装。テスト駆動で確実に。
- R1-1. `engine/physics/types.ts` （型定義のみ）
- R1-2. `field-geometry.ts` （座標・距離・ファウルライン）
- R1-3. `movement.ts` （直線等加速度モデル + ETA）
- R1-4. `trajectory.ts` （解析式 + 抗力減衰）
- R1-5. 単体テスト 30 件以上（物理妥当性）

**完了条件**: 物理ユーティリティが単体で動く。`simulateTrajectory({...})` が物理的に妥当な結果を返す。

### Phase R2: Play Resolver 最小版（1 週間）
**目的**: timeline 駆動の 1 球解決を成立させる。最小カバレッジ。
- R2-1. `play-resolver.ts` 骨格 + ゴロ系（送球競争で out/safe）
- R2-2. フライ系（捕球判定、犠牲フライ含む）
- R2-3. ライナー・HR の resolve
- R2-4. 走者進塁ロジック（強制 + 任意判断）
- R2-5. timeline バリデーター
- R2-6. 統合テスト 50 件（timeline 整合性）

**完了条件**: `resolvePlay(state, pitchInput, rng)` が `PlayResolution` を返し、out/safe が物理時刻一貫で決まる。

### Phase R3: 既存 engine への統合（半週）
**目的**: 既存 851 件のテストを壊さず、内部実装だけ差し替え。
- R3-1. `process-pitch.ts` 内部を Resolver 呼び出しに変更
- R3-2. 互換層: `BatContactResult` 型を timeline + trajectory から復元
- R3-3. 既存テスト全パス確認
- R3-4. 旧 `bat-contact.ts` / `field-result.ts` を deprecation コメント化

**完了条件**: 851/851 テストパス、新規 Resolver テストもパス。

### Phase R4: UI 再生統一（半週）
**目的**: UI 側の重複物理計算を削除、timeline 再生に統一。
- R4-1. `useBallAnimation.ts` の build*Sequence を timeline 入力ベースに書き換え
- R4-2. v0.42.0 の 150ms ハック削除
- R4-3. 旧 `physics.ts` (UI側) を engine/physics/ から再エクスポートに変更
- R4-4. UI テスト 65 件パス維持

**完了条件**: アウト/セーフが engine timeline と完全一致、UI 側に物理計算が残っていない。

### Phase R5: 表現拡張（1 週間）
**目的**: 21 種分類とドラマ性の演出強化。
- R5-1. `detailed-classifier.ts` 実装 + 単体テスト
- R5-2. 21 種を実況ログ・成績集計に組み込み
- R5-3. HR 種別演出（ライナー性 vs 高弾道）
- R5-4. ポテンヒット演出
- R5-5. フェンス直撃演出
- R5-6. NarrativeHook の生成

**完了条件**: 1000 試合シミュで 21 種すべての出現を確認、目標頻度に近い分布。

### Phase R6: 戦術・感情・思考への接続（1 週間）
**目的**: 既存システムを Layer 3 / hook に接続して、ドラマ性を強化。
- R6-1. 既存 `BatterDetailedOrder` を Layer 3 入力 E に接続
- R6-2. 既存心理システム（v0.21.0）を hook 購読側に
- R6-3. 1 球ごと思考コメント生成（NarrativeHook → コメントテンプレ）
- R6-4. 実況パターン拡張（21 種 × 投球種 × カウント）

**完了条件**: 同じ打席を再現しても、心理状態・采配が違えば結果が変わることを確認。

### Phase R7: バランス調整（1 週間、独立フェーズ）
**目的**: 統計的に野球らしい結果分布へのチューニング。
- R7-1. 1000 試合シミュ自動実行スクリプト
- R7-2. 統計集計ダッシュボード（打率・HR率・三振率・21 種分布）
- R7-3. 物理パラメータ調整（exit velocity 分布・抗力係数等）
- R7-4. 多様性指標（同型プレー連発率）の計測と調整

**完了条件**: §10.1 の目標範囲に収束、多様性指標が許容範囲。

**合計**: 約 5.5 〜 6 週間（並行可能なフェーズあり）。

---

## §9 テスト戦略（4 層）

### 9.1 物理基礎テスト（Layer 1-4 単体）

**目的**: 物理計算が破綻しないこと。

| 種類 | 例 |
|---|---|
| 単調性 | exitVelocity を上げると range が単調増加 |
| 値域 | hangTime > 0、apex >= 0、speed >= 0 |
| 境界 | exitVelocity=0 で range=0、max angle で range 最大 |
| 一貫性 | positionAt(0) == startPos, positionAt(hangTime) == landingPoint |
| 走者・送球 | 反応時間後に必ず移動、最高速で頭打ち |

**件数目安**: 50 件

### 9.2 解決整合テスト（Layer 5）

**目的**: timeline の不変条件が守られること、out/safe が物理一貫であること。

| 種類 | 例 |
|---|---|
| 時刻単調 | events が必ず昇順 |
| 因果 | runner_out の前に throw_arrival がある |
| 物理整合 | out 判定なら throw < runner、safe なら runner < throw |
| タッチアップ | 捕球時刻と離塁時刻の関係が正しい |
| 強制進塁 | force_out が正しく発生 |

**件数目安**: 80 件

### 9.3 野球分布テスト（統合・統計）

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

### 9.4 多様性テスト（ゲーム体験品質）

**目的**: 「同じ打球が二度と起きない」が実現されているか。

| 種類 | 例 |
|---|---|
| 21 種出現 | 1000 打席で全 21 種出現すること |
| 同型連発率 | 連続する 5 打席が全て同じ detailedHitType の確率 < 1% |
| 能力差反映 | power=99 と power=100 の打者で HR 率が単調変化 |
| 采配差反映 | aggressiveness 別に出塁率・HR 率が異なる |
| 状況差反映 | キー打席と通常打席で揺らぎ幅が違う（focus 効果） |
| ボール座標分散 | 同じ batter vs pitcher 1000 打席で exitVelocity の分散が >10mph |

**件数目安**: 30 件（統計的検定込み）

→ 計 **160+ 件のテスト**で物理〜ゲーム品質まで検証可能。

---

## §10 リスクと対策

| リスク | 影響度 | 対策 |
|---|---|---|
| 既存 851 件の互換性破壊 | 高 | Phase R3 で互換層を厚く、新旧並行運転期間を設ける |
| 物理パラメータのチューニング困難 | 中 | Phase R7 を独立フェーズに切り出し、自動シミュ + ダッシュボードで反復 |
| timeline 構築のバグで out/safe 矛盾 | 高 | timeline バリデーターを strict にし、違反は例外で fail-fast |
| UI 側の演出補間不足で「ガクガク」見える | 中 | R4 で easing 必須化、UI テストに視覚整合テスト追加 |
| パフォーマンス劣化 | 低 | §2.1 の予算（1 球 <150μs）を守る、R7 で benchmark テスト |
| 21 種分類のルールが現実と乖離 | 低 | R5 でルール調整、シニア視聴者レビュー |
| 実装期間が伸びる | 中 | Phase 単位でリリース可能な設計にし、R3 完了時点で本番投入可能 |
| ACP サブエージェント spawn 失敗 | 中 | /new で別チャット利用、または main 直接実装に切替 |

---

## §11 次のステップ

### 短期（即時）
1. **本ドキュメントのレビュー**（高橋さん）
2. Phase R1 着手判断:
   - 案 A: main 直接実装（確実、低リスク、所要 4-6 時間/ファイル）
   - 案 B: /new で別チャット作成し ACP 経由（並列性あり、ただし spawn 信頼性懸念）
   - 案 C: ハイブリッド（型定義は main、計算実装は ACP）

### 中期（Phase R1 完了後）
3. R2 Resolver 実装（最も核心、慎重に）
4. R3 統合（互換性確認）

### 長期（Phase R5 以降）
5. 21 種分類の実況・思考接続
6. 1000 試合シミュによるバランス調整
7. 球場差・天候等の拡張

---

## §12 まとめ：v1 → v2 で達成したこと

v1 が「**何を作るか**」のスケッチだったとすれば、v2 は「**どう軽く強く作るか**」の設計指針である。

- 物理シミュ路線は維持
- 各レイヤーの計算コストを明示（1 球 <150μs）
- 連続値で持つ変数を 25 個明示、揺らぎは正規分布で構造化
- 21 種分類は物理結果からの読み取りラベルに位置づけ確定
- timeline は canonical truth、UI は再生する場
- 将来の采配・感情・実況・球場差・守備シフトの接続点を最初から確保
- 実装順は軽くて価値が高い順（R1 物理基盤 → R2 Resolver → ...）
- テストは物理・整合・分布・多様性の 4 層 160+ 件

これにより、**「同じ打球が二度と起きない、過程にドラマがある、能力差が手触りに出る、納得感のある高校野球体験」** の基盤が、軽量に・拡張可能に・テスト可能に構築できる。

---

# 付録：v1 → v2 差分要約

## 維持した点
- ✅ 二重シミュレーション解消の根本方針
- ✅ engine が canonical truth、UI は再生
- ✅ 6 レイヤーアーキテクチャ
- ✅ 21 種打球分類の存在意義
- ✅ timeline ベースの 1 球解決
- ✅ 既存 851 テストの互換性方針
- ✅ Phase R1-R5 の大枠

## 強化した点
- 🔧 §1 設計哲学に「軽量で説得力のある物理」のテーゼを冒頭に追加
- 🔧 §1.2 で「厳密化と近似の使い分け」を表形式で明記
- 🔧 §2.1 で各レイヤーの計算コスト予算を数値で明示（1 球 <150μs）
- 🔧 §2.2 で各レイヤーの「持つ/持たない/連続/近似/拡張点」を明文化
- 🔧 §3 を新設し「同じ打球が二度と起きない」を入力 25 変数の連続性として構造化
- 🔧 §4 で timeline の不変条件を 5 つ明文化、Resolver で必ず守る
- 🔧 §5 で「21 種分類は物理結果からの読み取りラベル」と位置づけ確定
- 🔧 §6 で UI に許可される演出 / 禁止される操作を明文化
- 🔧 §7 で将来拡張（采配・感情・実況・球場差・守備シフト・配球学習）の接続点を全て一覧化
- 🔧 §8 で実装順を「軽くて価値が高い核から積む」順に再編、Phase R6/R7 を追加
- 🔧 §9 でテストを 4 層構造に整理（物理・整合・分布・多様性）

## 削った点 / 後段に回した点
- ⏬ v1 §9.3 の詳細分類器ロジック → §5.2 で同等内容を Step 2 に持ち越し（実装時詳細化）
- ⏬ v1 で「複雑なスピンモデル・流体力学・フレーム積分」を含意していた箇所 → 全て近似に置換（§1.2）
- ⏬ v1 の Phase 期間見積もり（4 週間） → 5.5-6 週間に修正（R6/R7 追加分）
- ⏬ v1 の「最重要 3 点」(§7) → §8 Phase R1 全体に格上げ、より具体化

## 新規追加した観点
- ➕ 計算コスト予算（§2.1）
- ➕ 入力変数 25 個の連続性設計（§3）
- ➕ timeline 不変条件 5 つ（§4.2）
- ➕ UI 禁止事項（§6.3）
- ➕ 拡張点の網羅一覧（§7）
- ➕ Phase R6 戦術・感情接続（§8）
- ➕ Phase R7 バランス調整独立化（§8）
- ➕ 多様性テスト層（§9.4）

---

**結語**: v2 設計書は「物理を本気でやる、ただし軽く・強く・拡張可能に」を全体テーマとし、レビューで指摘された 8 つのポイントすべてを構造に組み込んだ。これは **「リアルに見えるだけ」ではなく「物理・能力・判断・感情がつながった、ドラマのある高校野球試合体験」** の基盤を作るための、実装可能で検証可能な設計指針である。
