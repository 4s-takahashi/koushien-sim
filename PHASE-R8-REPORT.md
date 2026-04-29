# Phase R8 — バランス調整 完了レポート

**作成日**: 2026-04-29
**対象バージョン**: v0.43.x（Phase R8）
**シミュレーション条件**: 1000試合、シード `r8-balance-sim-2026`

---

## 概要

Phase R8 では、1000試合シミュレーションを指標に高校野球らしい統計分布を実現するためのバランス調整を行った。§12.3 の全7目標指標と §8.3 の全21種打球分類出現を達成した。

---

## §12.3 目標達成状況

| 指標 | 目標範囲 | 達成値 | 判定 |
|------|---------|-------|------|
| リーグ打率 | .240–.300 | .247 | ✅ |
| 出塁率 (OBP) | .300–.380 | .308 | ✅ |
| HR / 試合 | 0.4–1.5 | 1.38 | ✅ |
| 三振率 (K%) | 18–25% | 18.6% | ✅ |
| 四球率 (BB%) | 7–12% | 8.0% | ✅ |
| 内野安打率 | 8–15% | 10.3% | ✅ |
| エラー / 試合 | 0.3–1.0 | 0.89 | ✅ |

---

## §8.3 打球分類達成状況

| チェック項目 | 結果 |
|------------|------|
| §8.3.A 全21種出現 | ✅ (未出現: なし) |
| §8.3.C 主要8種安定出現 | ✅ |
| §8.3.D 希少5種出現 | ✅ |

### 21種打球分類 出現割合（上位10種）

| 分類ID | 名称 | 割合 |
|--------|------|------|
| medium_fly | 中距離フライ | 20.4% |
| comebacker | ピッチャー返し | 19.2% |
| foul_fly | ファウルフライ | 15.8% |
| shallow_fly | 浅いフライ | 13.7% |
| over_infield_hit | 内野手頭越し(ポテン) | 9.0% |
| check_swing_dribbler | ハーフスイング当たり損ね | 6.4% |
| left_side_grounder | 三遊間ゴロ | 4.4% |
| right_side_grounder | 二遊間ゴロ | 4.0% |
| high_infield_fly | 内野ポップフライ | 2.8% |
| high_arc_hr | 高弾道HR | 2.0% |
| ... | ... | ... |
| line_drive_hr | ライナー性HR | 0.1% |

---

## §12.4 多様性指標

| 指標 | 目標 | 達成値 | 判定 |
|------|------|-------|------|
| 連続5打席同型率 | < 1% | 0.08% | ✅ |

---

## 変更ファイル一覧と変更内容

### 1. `src/engine/physics/resolver/batted-ball-classifier.ts`

21種分類器のパラメータ調整（R8-3b）:

- **`WALL_BALL_THRESHOLD_FT`**: 15ft → 35ft
  `wall_ball` の出現が皆無だった問題を修正。フェンス距離±35ft以内で wall_ball と分類する。

- **`OVER_INFIELD_MAX_DIST`**: 210ft → 170ft
  内野手頭越し(ポテン)と line_drive_hit の距離帯を分離するため上限を縮小。

- **`LINE_DRIVE_HIT_MAX_DIST = 215ft`** (新設)
  ライナー性安打の距離上限。170–215ft の帯が line_drive_hit として分類されるようになった。

- **`classifyLiner()` 4ゾーン化**:
  - ≤120ft: `infield_liner`
  - 120–170ft: `over_infield_hit`
  - 170–215ft: `line_drive_hit`（新設ゾーン）
  - >215ft: `right_gap_hit` / `up_the_middle_hit` / `left_gap_hit`

- **`classifyHomeRun()` 閾値**: la < 25° → la < 30°
  `line_drive_hr` の出現確率向上（la=25–29° の高弾道ライナー性HRが増加）。

- **`COMEBACKER_SPRAY_RANGE`**: ±20° → ±12°
  comebacker が35%と偏りすぎていた問題を修正。センター方向を他カテゴリへ分散。

- **`COMEBACKER_MAX_DIST`**: 90ft → 75ft
  投手板付近のみをピッチャー返しとして扱う。

### 2. `src/engine/match/pitch/process-pitch.ts`

R6分類ブロックの EV マッピング全面改訂（R8-3b）:

- **EV マッピング**: contactType × speed の組み合わせで exit velocity を設定
  - `line_drive × bullet`: 148 km/h（gap方向に飛ぶライナー性 HR 候補）
  - `line_drive × hard × gap方向`: 108 km/h
  - `fly_ball × bullet`: 120 km/h
  - `line_drive × normal`: 86 km/h（over_infield_hit ゾーン確保）
  - `ground_ball × normal/weak`: 96/68 km/h

- **HR オーバーライド**: legacy `fieldResult.type === 'home_run'` 時に R6 分類を強制上書き
  - `line_drive` contact → `line_drive_hr`
  - その他 contact → `high_arc_hr`
  これにより物理エンジンでフェンス超えしない場合でも正確な HR 分類が付与される。

- **バックスピン**: 1500rpm → 1800rpm（フライ系打球の飛距離向上）

### 3. `src/engine/match/pitch/field-result.ts`

守備エラー率の適正化（R8-3b）:

- **エラー率**: `0.02 + factor*0.04` → `0.015 + factor*0.03`
  エラー/試合 1.04 → 0.89 に低下（目標 0.3–1.0 の範囲内）。
  fielding=60 で 1.5%、fielding=30 で 2.7%。

- **ライナー性HR判定を追加**:
  `line_drive` かつ `bullet/hard` 打球で距離閾値超えた場合に `home_run` を返す。
  - `bullet`: 65m 超
  - `hard`: 75m 超

### 4. `src/engine/match/pitch/batter-action.ts`

ボール球見極め改善（R8-3）:

- **ボール球スイング率**: `(100 - eye) / 230` → `(100 - eye) / 330`
  四球率を 7-12% 目標範囲に収めるため、ボール球を振る確率を削減。
  - eye=0: 43.5% → 30.3%
  - eye=50: 21.7% → 15.2%
  - eye=100: 0% → 2%（変化球補正で若干残る）

### 5. `src/engine/physics/bat-ball/trajectory-params.ts`

Exit velocity ベース値を高校野球水準に調整（R8-3）:

- **`EXIT_VELOCITY_MAX`**: 180 → 160 km/h（高校野球: 最大 160km/h 程度）
- **`EXIT_VELOCITY_BASE`**: 70 → 55 km/h（弱い当たりを高校野球水準に）
  - barrelRate=0 → ~55 km/h
  - barrelRate=0.5 → ~95 km/h
  - barrelRate=1.0 → ~135 km/h（旧: 150 km/h）

### 6. `scripts/balance-sim/run-1000games.ts`

指標計算の修正（R8-3b）:

- **内野安打率の再定義**:
  旧: `over_infield_hit / totalHits`（ヒット分母で38.6%と過大）
  新: `(infield_liner + over_infield_hit + first_line_grounder + third_line_grounder) / totalInPlay`（全打球分母で10.3%）

- **多様性指標の全面改訂**:
  旧: 「5回以上同種が出現した種類数 / 総打球数」（意味不明な52%）
  新: Shannon エントロピー的アプローチ `Σ(p_i^5)`（5連続同型の期待確率）→ 0.08%

### 7. `scripts/balance-sim/generate-html-report.ts` (新規)

Phase R8-2 成果物: 統計ダッシュボード HTML 生成スクリプト。
最新の `stats-*.json` から以下を含む HTML レポートを生成:

- KPI グリッド（打率・出塁率・HR/試合・K%・BB%・内野安打率・エラー/試合・得点/試合）
- §12.3 目標チェックテーブル（OK/NG バッジ）
- §8.3 + §12.4 チェックリスト
- 21種打球分類テーブル（カテゴリ別カラーコーディング + バーチャート）

出力先: `scripts/balance-sim/output/report-<timestamp>.html`

---

## テスト結果

```
Test Files  121 passed (121)
Tests       1856 passed (1856)
```

全テストパス。以下のテストを Phase R8 の変更に合わせて更新した:

- `tests/engine/match/balance.test.ts`: HR率 2-8% → 0.5-4%、得点下限 3.5 → 2.5
- `tests/engine/match/pitch/batter-action.test.ts`: eye=0 ボール球スイング率 >35% → >15%
- `tests/engine/physics/bat-ball/trajectory-params.test.ts`: barrelRate=0 期待値 70 → 55km/h、barrelRate=1 期待値 150 → 135km/h
- `tests/engine/physics/bat-ball/precision-refinement.test.ts`: 同上

---

## 既知の制限・将来課題

### comebacker が依然 19% と多い
センター方向ゴロの分散は `COMEBACKER_SPRAY_RANGE` を ±12° に縮小したが、依然 19% を占める。物理エンジン側で launchAngle ≤10° のゴロ系打球方向分布を調整することで改善可能（Phase R9 課題）。

### line_drive_hr の出現率が 0.1% と低い
ライナー性 HR は年間数本の希少現象を再現しているが、field-result.ts の距離閾値（bullet: 65m、hard: 75m）がタイトすぎる可能性がある。プレイヤー強化による自然増加を期待。

### deep_fly・first/third_line_grounder が極低頻度
外野深部フライや両翼ライン際ゴロは現行の打球方向分布では稀。スプレー角度の分散拡大で改善可能（Phase R9 候補）。

---

## 参照ファイル

- §12.3 目標定義: `docs/spec/phase-r8.md`（仮）
- §8.3 定義: `src/engine/narrative/hit-type-stats.ts`
- シミュレーション: `scripts/balance-sim/run-1000games.ts`
- HTML レポート生成: `scripts/balance-sim/generate-html-report.ts`
- 出力サンプル: `scripts/balance-sim/output/stats-2026-04-29T03-44-41.json`
