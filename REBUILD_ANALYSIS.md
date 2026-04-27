# 試合エンジン再構築 — 分析と設計書

**作成**: 2026-04-27 / **作成者**: マギ（main）/ **対象バージョン**: v0.43.0 (af22c01)
**状態**: Step 1（分析・設計） / Step 2 以降で段階実装

---

## 序文

高橋さんから「現状の試合エンジンに矛盾が多く、根本的に再構築したい」との依頼。
v0.41.0 で「俯瞰リアルタイム物理シミュ」を導入したが、実態は **UI アニメーションだけが物理ベースで、エンジン本体は確率テーブル**という二重構造。
v0.42.0 でアウト/セーフの矛盾を「結果から逆算してタイミングを150msズラす」という対症療法でしのいでいる。

この設計書は **エンジンと UI を統一した物理シミュレーション**に作り直すための分析と方針をまとめる。

---

## §1 根本原因分析

### 1.1 二重シミュレーション問題

**現状の構造（v0.43.0）:**

```
[エンジン側] (engine/match/)
  bat-contact.ts        … 確率テーブルで打球種別・方向・距離を生成
  field-result.ts       … 確率で out/single/double/triple/HR を判定
  process-pitch.ts      … 走者進塁を確率テーブルで処理
                          ↓ 結果として確定した FieldResult を返す

[UI側] (ui/match-visual/)
  physics.ts            … 物理速度定数（playerSpeedFtPerSec 等）
  useBallAnimation.ts   … build*Sequence で「物理時刻」を計算してアニメ
                          ↓ ただし engine の結果に整合させる必要がある

  └── v0.42.0 ハック:
      isOut=true  → throwEnd = batterEnd - 150ms（無理やり送球先着）
      isOut=false → batterEnd = throwEnd - 150ms（無理やり走者先着）
```

**問題:** 「engine が確率で結果を決めて、UI がその結果に合わせて物理時刻を後付けで偽造する」構造になっている。
本来は **物理シミュを先にやって、その結果として out/safe が決まる**べき。

### 1.2 具体的な矛盾の事例

| バグ | 症状 | 該当コミット | 根本原因 |
|---|---|---|---|
| アウト/セーフ矛盾 | 走者が先に塁到達してるのに out 表示 | v0.42.0 ハック修正 | **エンジン判定 → UI 偽造**の順序 |
| ポジション割り当て | マウンドの選手と表示選手名が不一致 | v0.41.1 fix | `fieldPositions` Map と `currentPitcherId` の整合性が取れてない |
| 継投後の投手名 | 交代後も前投手の名前表示 | v0.40.1 fix | 同上 |
| ヒット後の同打者再登場 | processAtBat が currentBatterIndex を進めない設計だが runner 側で進めるのを忘れる | runner.ts L711 修正 | エンジン責務が曖昧 |
| カウント引き継ぎ | 三振したカウントが次打席に残る | runner.ts L688 防衛コード | **engine 出力の不変条件が保証されない** |
| 3アウトでイニング切替忘れ | processAtBat 内で 3アウト到達するが switchHalfInning は呼ばれない | runner.ts L724 防衛コード | 同上 |

→ **共通点**: エンジン側の API が「次状態」を返すが、その次状態の不変条件（カウント・打順・イニング遷移）を厳密に保証していない。runner.ts に防衛コードが多数。

### 1.3 確率テーブルベースの限界

`bat-contact.ts` の打球生成：

```ts
// L46-65: 確率分布の合算で打球種を決める
let pGround = 0.40 - deltaFromBase * 0.20;
let pLine   = 0.20 + deltaFromBase * 0.10;
let pFly    = 0.30 + deltaFromBase * 0.20;
let pPopup  = 0.10 - deltaFromBase * 0.10;
// 各種補正後に正規化して 1つを抽選
```

**問題点:**

1. **打球の物理量（速度・角度・スピン）が直接モデリングされていない**
   - HitSpeed = 'weak' | 'normal' | 'hard' | 'bullet' の 4段階
   - 飛距離は `40 + powerFactor * 60 + rng.next() * 40`（120-140mが上限）
   - 真の物理速度・打球角度（launch angle）が無いため、**「ライナー性のホームラン」「天高い犠牲フライ」**といった分類ができない

2. **打球種別がアウトカム駆動**
   - `popup`（凡フライ）になるか `fly_ball`（深いフライ）になるかが事前に確率で決まる
   - **打者のスイング軌道 × 投球コースから物理的に決まるべき**
   - 結果、「最大級のパワーで popup（弱いフライ）」が起こりうる（不自然）

3. **守備位置が固定マッピング**
   - `getNearestFielder(direction)` が direction 角度から守備位置を直接返す
   - 野手の守備位置は実際には移動するが、エンジン側ではそういう表現がない
   - シフト守備・前進守備などの戦術が表現できない

### 1.4 必ず出るべき打球21種が出ない問題

野球で起こりうる主要な打球タイプ（高橋さんが想定する21種、推定）:

```
内野系:
1. 一塁線ゴロ          2. 二遊間ゴロ
3. 三遊間ゴロ          4. 三塁線ゴロ
5. ピッチャー返し       6. 内野ライナー
7. 高い内野フライ      8. 内野手の頭越しヒット

外野ゴロ抜け:
9. 一二塁間抜けヒット   10. センター前ヒット
11. 三遊間抜けヒット

外野系:
12. 浅いフライ         13. 中距離フライ
14. 深いフライ         15. ライナー性のヒット
16. 外野フェンス直撃    17. ホームラン（ライナー性）
18. ホームラン（高弾道）

特殊:
19. ライン際の打球（フェアファウル微妙）
20. ファウルフライ（捕球可能）
21. 当たり損ね小フライ（投手前）
```

**現状の bat-contact.ts では:**
- contactType が4種（ground/line/fly/popup）しかなく、上記21種を表現する解像度が無い
- direction (0-90度) と distance だけで守備位置を逆引きしている → 「内野手の頭越しヒット」「外野フェンス直撃」のような距離帯ごとの結果が表現できない
- ライナー性HR と高弾道HR の区別がつかない

### 1.5 時間軸の不在

エンジン側には **「時間」の概念が無い**:
- 投球→打撃→打球発生→野手到達→送球→塁到達 は離散イベント
- UI 側で `physics.ts` を使って後付けで時間を計算している
- そのため engine 側で「タッチアップが間に合うか」を物理判定できず、確率テーブルでお茶を濁している

---

## §2 再構築アーキテクチャ案（6レイヤー）

### 2.1 全体像

```
┌─────────────────────────────────────────────────────────┐
│ Layer 6: Match Orchestrator (runner.ts 相当)            │
│  - 試合進行制御、采配適用、停止判定                     │
└─────────────────────────────────────────────────────────┘
                         ↑↓
┌─────────────────────────────────────────────────────────┐
│ Layer 5: Play Resolution (1球の解決)                    │
│  - 投球選択 → 打撃判定 → 打球生成 → 守備処理 → 走塁    │
│  - 物理タイムラインを生成して結果を確定                 │
└─────────────────────────────────────────────────────────┘
                         ↑↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Ball Trajectory (打球軌道)                     │
│  - 打球初速・打球角度・スピンから着弾点・滞空時間を算出 │
│  - 物理ベース（重力＋空気抵抗の簡易モデル）             │
└─────────────────────────────────────────────────────────┘
                         ↑↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Bat-Ball Physics (打撃物理)                    │
│  - 投球タイミング × スイング軌道 → 打球初速・角度       │
│  - 打者ステータス + 投球種・コースから決定              │
└─────────────────────────────────────────────────────────┘
                         ↑↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Player Movement (野手・走者の移動)             │
│  - 各エージェントの位置・速度・反応時間                 │
│  - 物理時刻でのポジション更新                           │
└─────────────────────────────────────────────────────────┘
                         ↑↓
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Field Geometry (球場座標系)                    │
│  - 各塁・守備位置・フェンスの座標（feet）               │
│  - 距離計算ユーティリティ                               │
└─────────────────────────────────────────────────────────┘
```

### 2.2 各レイヤーの責務

#### Layer 1: Field Geometry
- 球場の座標系を定義（ホームベース原点、x=右翼方向, y=外野方向）
- 各塁・守備位置・フェンスの座標
- ファウルライン判定
- **既存 `field-coordinates.ts` を拡張**

#### Layer 2: Player Movement
- 野手と走者を Agent として表現
- 各 Agent は `position(t)`, `velocity(t)`, `reactionTime`, `topSpeed` を持つ
- 反応時間後に目標地点に向かって移動を開始
- **新規ファイル**: `engine/physics/movement.ts`

#### Layer 3: Bat-Ball Physics
- 投球（球速・球種・コース）と打者のスイング判定から **打球初速・打球角度（launch angle）・水平角度（spray angle）・スピン** を生成
- 確率は「打者の能力＋タイミングずれ」のばらつきとして導入するが、結果は連続値
- **新規ファイル**: `engine/physics/bat-ball.ts`

#### Layer 4: Ball Trajectory
- 初速・打球角度・スピンから時刻 t における打球位置 `ball(t) = (x, y, z)` を返す
- 簡易物理モデル（重力g=32 ft/s²、空気抵抗は係数で近似）
- 着弾点・滞空時間・最高到達点を返す
- **新規ファイル**: `engine/physics/trajectory.ts`

#### Layer 5: Play Resolution
- Layer 1-4 を組み合わせて 1球の結果を確定
- タイムラインベース: 「t=0 で打球発生、t=2.3s で野手 SS が捕球、t=2.8s で送球到着、t=2.9s で打者一塁到達 → セーフ」
- `FieldResult` (out/single/double/triple/HR) はここで **物理時間の比較**で決まる
- **新規ファイル**: `engine/physics/play-resolver.ts`

#### Layer 6: Match Orchestrator
- 既存の `runner.ts` を維持（インタフェースは変えない）
- 内部で Layer 5 を呼ぶ

### 2.3 既存コードとの関係

- **保持**: types.ts, runner.ts のインタフェース、tactics.ts, inning.ts（イニング遷移）, result.ts（成績集計）
- **置換**: bat-contact.ts, field-result.ts, process-pitch.ts のうち打撃〜守備の部分
- **拡張**: physics.ts（UI側）は廃止し、engine/physics/ に統合

### 2.4 互換性方針

**既存テスト 851件を壊さない**ため：
- `processPitch(state, order, rng) -> {nextState, pitchResult}` のシグネチャを保持
- 内部実装だけを差し替え
- `PitchResult.batContact.contactType` は既存4種に集約してマップする（互換層）
- 新しい詳細データ（21種分類、launch angle 等）は `pitchResult.physics` フィールドに追加

---

## §3 時間軸モデル

### 3.1 タイムラインベースの 1球解決

```ts
interface PlayTimeline {
  events: PlayEvent[];  // 時刻順ソート済み
  // 各イベント: { t: ms, type: 'ball_contact' | 'fielder_arrives' | 'throw_release' | 'throw_arrives' | 'runner_passes_base' | ... }
}
```

### 3.2 標準的な内野ゴロのタイムライン例

```
t=0      投手リリース
t=400ms  打者ミート（球が打者位置に到達するまで）
t=400ms  打球発生（初速85mph、launch=10°、spray=-15°（三遊間方向））
t=410ms  野手 SS が反応（reactionTime=10ms）
t=850ms  打球が SS の位置に到達 → SS 捕球
t=1200ms SS 送球リリース
t=1500ms 送球が一塁到達
t=1480ms 打者が一塁到達（speed=70 → 4.8s/90ft）
                ↓
        塁到達 < 送球到着 → セーフ（内野安打）
```

→ 結果は **物理計算で決定**。確率は「捕球失敗率（エラー率）」「送球エラー率」「打球初速のばらつき」など限定的。

### 3.3 タッチアップ判定の例（v0.42.0 のような後付けは不要）

```
t=0       打球発生（外野フライ）
t=2800ms  外野手が捕球
t=0       走者三塁が捕球を確認するためフライを見る
t=2800ms  捕球確認 → 走者離塁開始
t=4600ms  走者がホーム到達（90ft / 自走時間）
t=2900ms  外野手が送球リリース
t=4500ms  送球がホーム到達
                ↓
        送球到着 < 走者到達 → アウト
```

### 3.4 並行アクションの統合

野球の同時進行（盗塁＋投球、犠牲フライでの送球＋走塁、など）は **すべて同一タイムライン上に並べる**ことで自然に解決される。
→ runner.ts の盗塁特殊処理（L195「投球前に実行」）が不要になる。

---

## §4 必要な型定義一覧

### 4.1 新規型（engine/physics/types.ts）

```ts
// 球場座標系（feet）
type FieldPosition = { x: number; y: number };

// Agent（野手・走者）
interface Agent {
  id: string;
  position: FieldPosition;
  velocity: { x: number; y: number };
  topSpeedFtPerSec: number;
  reactionTimeMs: number;
}

// 打球の物理パラメータ
interface BallTrajectory {
  /** 打球初速 (ft/s) */
  exitVelocity: number;
  /** 打球角度 (degrees, 0=水平, 90=真上) */
  launchAngle: number;
  /** 打球水平角度 (degrees, 0=右翼線, 45=センター, 90=左翼線) */
  sprayAngle: number;
  /** スピン量 (rpm) — 簡易: backspin / sidespin */
  spin: { back: number; side: number };
}

// 打球の物理計算結果
interface BallFlight {
  /** 着弾点 */
  landingPoint: FieldPosition;
  /** 滞空時間 (ms) — 着弾までの時間（ゴロは最初の着弾、フライは最終着弾） */
  hangTime: number;
  /** 最高到達点 (ft) */
  apex: number;
  /** 詳細: t における位置を返す関数 */
  positionAt: (tMs: number) => FieldPosition & { z: number };
}

// プレイイベント
type PlayEvent =
  | { t: number; kind: 'pitch_release' }
  | { t: number; kind: 'ball_contact' }
  | { t: number; kind: 'foul' }
  | { t: number; kind: 'ball_landing'; pos: FieldPosition }
  | { t: number; kind: 'fielder_arrival'; fielderId: string; pos: FieldPosition }
  | { t: number; kind: 'fielder_field_ball'; fielderId: string }
  | { t: number; kind: 'fielder_throw'; fromId: string; toBase: 'first'|'second'|'third'|'home' }
  | { t: number; kind: 'throw_arrival'; toBase: 'first'|'second'|'third'|'home' }
  | { t: number; kind: 'runner_safe'; runnerId: string; base: string }
  | { t: number; kind: 'runner_out'; runnerId: string; base: string }
  | { t: number; kind: 'home_run' };

// プレイ全体の結果
interface PlayResolution {
  trajectory: BallTrajectory;
  flight: BallFlight;
  timeline: PlayEvent[];
  /** 既存互換: FieldResult */
  fieldResult: FieldResult;
  /** 詳細分類（21種のいずれか） */
  detailedHitType: DetailedHitType;
}

// 打球の詳細分類（21種）
type DetailedHitType =
  | 'first_line_grounder'    // 一塁線ゴロ
  | 'right_side_grounder'    // 二遊間ゴロ
  | 'left_side_grounder'     // 三遊間ゴロ
  | 'third_line_grounder'    // 三塁線ゴロ
  | 'comebacker'             // ピッチャー返し
  | 'infield_liner'          // 内野ライナー
  | 'high_infield_fly'       // 高い内野フライ
  | 'over_infield_hit'       // 内野手の頭越しヒット
  | 'right_gap_hit'          // 一二塁間抜けヒット
  | 'up_the_middle_hit'      // センター前ヒット
  | 'left_gap_hit'           // 三遊間抜けヒット
  | 'shallow_fly'            // 浅いフライ
  | 'medium_fly'             // 中距離フライ
  | 'deep_fly'               // 深いフライ
  | 'line_drive_hit'         // ライナー性のヒット
  | 'wall_ball'              // 外野フェンス直撃
  | 'line_drive_hr'          // ライナー性HR
  | 'high_arc_hr'            // 高弾道HR
  | 'fence_close_call'       // ライン際打球
  | 'foul_fly'               // ファウルフライ
  | 'check_swing_dribbler';  // 当たり損ね投手前
```

### 4.2 既存型の拡張

```ts
// types.ts の PitchResult に追加
interface PitchResult {
  // ... 既存フィールド
  /** 新規: 物理シミュ結果（後方互換のため optional） */
  physics?: PlayResolution;
}
```

---

## §5 改修対象ファイル一覧

### 5.1 新規作成（engine/physics/）

| ファイル | 行数目安 | 内容 |
|---|---|---|
| `types.ts` | 100 | 物理レイヤーの型定義 |
| `field-geometry.ts` | 150 | 球場座標・距離計算 |
| `movement.ts` | 200 | Agent 移動シミュ |
| `bat-ball.ts` | 250 | 打球生成（投球→打撃→打球軌道パラメータ） |
| `trajectory.ts` | 200 | 打球軌道計算（重力・空気抵抗） |
| `play-resolver.ts` | 400 | タイムライン構築・結果確定 |
| `detailed-classifier.ts` | 150 | 21種分類器 |

### 5.2 改修

| ファイル | 改修内容 |
|---|---|
| `engine/match/pitch/process-pitch.ts` | bat-contact + field-result を呼んでいた部分を play-resolver に置換 |
| `engine/match/pitch/bat-contact.ts` | **廃止**（後方互換のために型のみ残す） |
| `engine/match/pitch/field-result.ts` | **廃止**（後方互換のために型のみ残す） |
| `engine/match/types.ts` | PitchResult に physics?: PlayResolution 追加 |

### 5.3 UI 側の追従

| ファイル | 改修内容 |
|---|---|
| `ui/match-visual/physics.ts` | **廃止**（engine/physics/field-geometry.ts に統合） |
| `ui/match-visual/useBallAnimation.ts` | build*Sequence を **PlayResolution.timeline から構築**に変更（生成しない、変換するだけ） |

→ **これが本来の姿**: エンジンが生成したタイムラインを UI が「再生」するだけ。整合性問題は構造的に発生しない。

---

## §6 実装順序

### Phase R1: 物理基盤（1週間想定）
- [ ] R1-1. `engine/physics/types.ts` 作成
- [ ] R1-2. `field-geometry.ts` 作成（既存 field-coordinates.ts を移植・拡張）
- [ ] R1-3. `movement.ts` 作成 + 単体テスト
- [ ] R1-4. `trajectory.ts` 作成 + 単体テスト（飛距離検証）
- [ ] R1-5. `bat-ball.ts` 作成 + 単体テスト（打者ステータスごとの打球分布検証）

### Phase R2: 解決器（1週間想定）
- [ ] R2-1. `play-resolver.ts` の骨格作成
- [ ] R2-2. ゴロ系の resolve 実装 + テスト
- [ ] R2-3. フライ系の resolve 実装 + テスト
- [ ] R2-4. ライナー・HR の resolve 実装 + テスト
- [ ] R2-5. 走者進塁の resolve 実装 + テスト
- [ ] R2-6. `detailed-classifier.ts` 作成 + 21種分類テスト

### Phase R3: 統合（半週想定）
- [ ] R3-1. `process-pitch.ts` を play-resolver 呼び出しに変更
- [ ] R3-2. 既存テスト 851件を全て走らせて通す（互換層調整）
- [ ] R3-3. `engine/match/pitch/bat-contact.ts` を後方互換シム化
- [ ] R3-4. `engine/match/pitch/field-result.ts` を同上

### Phase R4: UI 追従（半週想定）
- [ ] R4-1. `useBallAnimation.ts` を timeline から build に書き換え
- [ ] R4-2. v0.42.0 ハック（150ms ズラし）を削除
- [ ] R4-3. 21種分類を UI に表示（実況ログでの言及など）

### Phase R5: バランス調整（1週間想定）
- [ ] R5-1. シーズン丸ごとシミュレートしてリーグ全体の打率・本塁打率を実計算
- [ ] R5-2. 必要な物理パラメータ調整（係数チューニング）
- [ ] R5-3. 必ず出るべき21種が出るか統計検証

**合計: 約3.5〜4週間**（高橋さんと進めながら段階的に）

---

## §7 最初に直すべき最重要3点

サブエージェント / ACP 経由で「Step 2」として最初に取り組むべき部分：

### 優先1: 物理基盤の最小セット
**ファイル**: `engine/physics/types.ts`, `field-geometry.ts`, `trajectory.ts`
**目的**: 「打球初速・角度から着弾点と滞空時間を返す関数」が動く状態にする
**完了条件**:
- `simulateTrajectory({ exitVelocity: 100, launchAngle: 30, sprayAngle: 45 })` が `{ landingPoint: {x,y}, hangTime: ms, apex: ft }` を返す
- テスト10件: 物理的に妥当な範囲か検証（HR が出る exitVelocity 閾値、滞空時間の単調性等）

### 優先2: 打球生成器（bat-ball.ts）
**ファイル**: `engine/physics/bat-ball.ts`
**目的**: 「打者ステータス + 投球コース・球速 → BallTrajectory」を返す
**完了条件**:
- 既存 `BatterParams` + `PitchSelection` + `PitchLocation` を入力に、`BallTrajectory` を返す
- power=100 の打者なら exitVelocity が高い、というような分布が確認できる

### 優先3: タイムラインベースの簡易 play-resolver
**ファイル**: `engine/physics/play-resolver.ts`
**目的**: ゴロ系のみ、物理時間で out/safe を判定する最小実装
**完了条件**:
- `resolveGroundOut(trajectory, batter, defenders, runners)` が PlayResolution を返す
- 「足の速い打者は内野安打、遅い打者は内野ゴロ」が物理計算だけで再現される

→ ここまでで **物理エンジンの「動く骨格」**が出来る。残りはこれを拡張していくだけ。

---

## §8 テスト観点一覧

### 8.1 単体テスト（各 Layer）

| Layer | テスト観点 |
|---|---|
| L1 Field | 距離計算精度・座標変換・ファウルライン判定 |
| L2 Movement | 反応時間後の到達時間・最高速制限・障害物（ベース）回避 |
| L3 Bat-Ball | 打者ステータスと打球パラメータの相関（power vs exitVelocity 等）・タイミングずれの分布 |
| L4 Trajectory | 物理整合性（HR ライン到達時刻、フライの滞空時間が exitVelocity に応じて単調変化等） |
| L5 Resolver | タイムライン整合性、不変条件（送球到着時刻 < 打者到着時刻 → out 等） |

### 8.2 統合テスト

- 既存 851件を全パス（互換性保証）
- バランステスト: 1試合平均の打率・本塁打率が現実的範囲（打率.250-.300、HR/試合 0.5-2 程度）
- 21種統計: 1000試合シミュで各分類が妥当な頻度で出現

### 8.3 リグレッションテスト

- v0.42.0 のハック削除後、アウト/セーフ判定が物理計算と整合
- ポジション割り当てが engine 内で完結（runner.ts の防衛コード不要に）

### 8.4 視覚的整合テスト

- UI 描画が timeline をそのまま再生して破綻しない
- スローモード / ファストモードでも視覚的に同じ結果

---

## §9 打球分布調整方針 + 必ず出るべき打球21種

### 9.1 調整方針

**目標**: 1000試合シミュで以下を満たす

| 指標 | 目標範囲 |
|---|---|
| 打率（リーグ全体） | .240 〜 .300 |
| 出塁率 | .300 〜 .380 |
| 本塁打/試合 | 0.4 〜 1.5 |
| 三振率 | 18% 〜 25% |
| 四球率 | 7% 〜 12% |
| 内野安打率 | 全安打の 8% 〜 15% |
| エラー率 | 試合あたり 0.3 〜 1.0 個 |

### 9.2 21種出現頻度の目標（1000打席あたり）

| # | 打球タイプ | 想定頻度 | 備考 |
|---|---|---|---|
| 1 | 一塁線ゴロ | 25 | アウト多め |
| 2 | 二遊間ゴロ | 60 | 最も多いゴロ |
| 3 | 三遊間ゴロ | 55 | |
| 4 | 三塁線ゴロ | 25 | |
| 5 | ピッチャー返し | 15 | 投手の反応速度依存 |
| 6 | 内野ライナー | 30 | アウト率高 |
| 7 | 高い内野フライ | 30 | ほぼアウト |
| 8 | 内野手の頭越しヒット | 20 | ポテンヒット |
| 9 | 一二塁間抜けヒット | 30 | |
| 10 | センター前ヒット | 50 | 最多ヒット種 |
| 11 | 三遊間抜けヒット | 30 | |
| 12 | 浅いフライ | 50 | アウト中心 |
| 13 | 中距離フライ | 80 | |
| 14 | 深いフライ | 50 | |
| 15 | ライナー性のヒット | 40 | |
| 16 | 外野フェンス直撃 | 8 | 二塁打or三塁打 |
| 17 | ライナー性HR | 4 | パワー打者 |
| 18 | 高弾道HR | 3 | パワー打者 |
| 19 | ライン際打球 | 6 | |
| 20 | ファウルフライ | 25 | |
| 21 | 当たり損ね投手前 | 15 | |
| (空振り・見逃し三振・四球は別扱い) |

**注**: 上記は仮の目標値。リーグ平均の打者で計算した想定。

### 9.3 分類器のロジック概要（detailed-classifier.ts）

```
入力: BallTrajectory (exitVelocity, launchAngle, sprayAngle), BallFlight (landingPoint, hangTime)

ルール:
- launchAngle < 10° && hangTime < 1.5s          → ゴロ系（spray から方向決定）
- launchAngle 10-25° && exitVelocity > 90 mph   → ライナー系
- launchAngle 25-50° && exitVelocity > 95 mph   → HR候補（飛距離次第）
- launchAngle > 50°                              → 高い飛球（ポップ・浅いフライ）
- spray < 5° or > 85°                            → ファウル系
- 着弾点が内野範囲内                             → 内野系打球
- 着弾点が外野範囲                               → 外野系打球
- 着弾点がフェンス付近 && z(t_max) > 10ft        → wall_ball or HR
```

### 9.4 調整プロセス

1. Phase R5 にて 1000試合シミュ実行
2. 各分類の出現頻度を計測
3. 目標とのギャップから物理パラメータ（exitVelocity 分布、launchAngle 分布等）を調整
4. 統計テストで目標範囲内に収束するまで繰り返す

---

## §10 リスクと対策

| リスク | 対策 |
|---|---|
| 既存テスト 851件の互換性破壊 | Phase R3 で互換層を厚く実装、bat-contact / field-result を完全シム化 |
| 物理計算が重すぎてパフォーマンス劣化 | trajectory は解析解（放物線+空気抵抗テーブル）で O(1) に |
| バランス調整が難航する | Phase R5 を独立して時間確保。シミュ自動実行スクリプトを最初に整備 |
| UI 側の整合性破壊 | Phase R4 で v0.42.0 ハック削除を慎重に。`useBallAnimation.ts` のテスト 65件を維持 |
| サブエージェント実装の品質不足 | Phase R1 の 5ファイルは私（main）が直接書く案も検討 |

---

## §11 次のステップ

1. **本ドキュメントのレビュー**（高橋さん）
2. **Phase R1 着手**: 物理基盤の最小セット（types / field-geometry / trajectory）
   - 案A: 私（main）が直接書く（確実・低リスク）
   - 案B: /new で別チャット作って ACP に依頼（並列性あり）
3. R1 完了後、R2 以降を順次

---

**結語**: 現状の試合エンジンの根本問題は「engine が結果を確率で先に決めて、UI が物理時刻を後付けで偽造する」二重シミュレーション構造。これを「engine が物理時間軸でシミュして結果を返す」一元構造に変える。21種の打球分類と必要なバランス指標を達成するための物理基盤を Phase R1〜R5 で構築する。
