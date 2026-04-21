# Phase 12: 実装計画 — サブフェーズ分割・完了基準・テスト戦略

**作成日:** 2026-04-21
**総工数見積:** 2〜3週間（Phase 12-A〜E）

---

## 全体フロー

```
Phase 12-A（基盤整備）
  ↓ 完了基準クリア後
Phase 12-B（ストライクゾーン）
  ↓ 完了基準クリア後
Phase 12-C（グラウンド表示）
  ↓ 完了基準クリア後（B/C は並行可能）
Phase 12-D（ボールアニメーション）
  ↓ 完了基準クリア後
Phase 12-E（演出強化・最適化）
```

B と C は独立して実装可能（グラウンドとストライクゾーンは別コンポーネント）。
**A完了後 → B/C 並行 → D → E** が効率的。

---

## Phase 12-A: 基盤整備

**期間:** 3〜5日
**担当範囲:**
- Canvas/SVG 基盤クラスの作成
- スコア票の表示タイミング制御
- ストライクゾーン UI（静的、マーカーなし）
- FPS 計測プロトタイプ

### タスクリスト

```
□ src/ui/match-visual/ ディレクトリ作成
□ pitch-marker-types.ts — マーカー型定義
□ field-coordinates.ts — フィールド座標変換ユーティリティ
□ Scoreboard.tsx — AnimatedScoreboard コンポーネント
□ useScoreboardVisibility.ts — 表示タイミング制御フック
□ MatchHUD.tsx — 左上HUD コンポーネント
□ StrikeZone.tsx — ストライクゾーン（静的グリッドのみ）
□ StrikeZoneSvg.ts — SVG描画ロジック（グリッドのみ）
□ match-visual-store.ts — ビジュアル状態ストア（空のマーカー履歴）
□ view-state-types.ts に pitcherHand を追加（オプショナル）
□ matchProjector.ts に getPitcherHand() を追加
□ page.tsx — Scoreboard コンポーネント差し替え（既存 Scoreboard / InningScoreTable を置換）
□ match.module.css — スコアボードオーバーレイ CSS 追加
□ jest-canvas-mock を devDependency に追加（npm install -D jest-canvas-mock）
□ FPS 計測ページ（/play/match/fps-test）を開発用に作成
```

### データモデル変更

| ファイル | 変更内容 |
|---|---|
| `view-state-types.ts` | `MatchViewState.pitcherHand?: 'left' | 'right'` 追加 |
| `matchProjector.ts` | `getPitcherHand()` ヘルパー追加、戻り値に `pitcherHand` 追加 |

### 完了基準

| # | 基準 | 確認方法 |
|---|---|---|
| A-1 | スコア票が表/裏の始まりにスライドインし、約2秒後にスライドアウトする | ブラウザで試合を進めて目視確認 |
| A-2 | スコア票非表示中も左上HUDでスコア・カウントが確認できる | ストライクゾーン画面で目視確認 |
| A-3 | `prefers-reduced-motion` 時はアニメーションなしで即時表示/非表示 | Chrome DevTools の Rendering でモーション低減を有効化して確認 |
| A-4 | ストライクゾーンの3×3グリッドが表示される（マーカーは空でよい） | ブラウザで目視確認 |
| A-5 | 既存テスト 743/743 件が全てパス | `npm test` |
| A-6 | TypeScript strict モードでエラーなし | `npm run type-check` |
| A-7 | デスクトップ Chrome でスコア票アニメーションが 60fps を維持 | Chrome DevTools Performance タブで計測 |

### テスト戦略

```typescript
// 新規テストファイル
src/ui/match-visual/__tests__/
  useScoreboardVisibility.test.ts  // フックのフェーズ遷移テスト
  field-coordinates.test.ts         // 座標変換の数値テスト
  pitch-marker-types.test.ts        // UV座標変換テスト
```

---

## Phase 12-B: ストライクゾーン実装

**期間:** 3〜5日（Phase 12-A 完了後、Phase 12-C と並行可能）
**担当範囲:**
- 投球ごとの◯/△マーカー描画
- 変化球方向の三角形回転
- バットスイング位置マーカー
- 打席間クリア

### タスクリスト

```
□ StrikeZone.tsx — マーカー描画追加（◯/△/スイング位置）
□ StrikeZoneSvg.ts — PitchMarkerSvg, TriangleMarker, SwingMarkerSvg コンポーネント
□ pitch-marker-types.ts — getBreakDirection(), PITCH_BREAK_DIRECTION テーブル追加
□ match-visual-store.ts — addPitchMarker / setSwingMarker / clearForNextBatter 実装
□ match-store.ts — stepOnePitch/stepOneAtBat で breakDirection, swingLocation を計算し PitchLogEntry に追加
□ page.tsx — pitchLog 変化時に addPitchMarker を呼ぶ useEffect 追加
□ page.tsx — batterId 変化時に clearForNextBatter を呼ぶ useEffect 追加
□ マーカーアニメーション（スケールイン + ストライクパルス）
```

### データモデル変更

| ファイル | 変更内容 |
|---|---|
| `view-state-types.ts` | `PitchLogEntry.breakDirection?`, `swingLocation?` 追加 |
| `match-store.ts` | `stepOnePitch/stepOneAtBat` に breakDirection, swingLocation 計算追加 |

### 完了基準

| # | 基準 | 確認方法 |
|---|---|---|
| B-1 | 投球ごとにストライクゾーンにマーカーが追加される | 試合を進めて目視確認（5球投げてマーカーが5個表示） |
| B-2 | ストレート = ◯、変化球 = △ で表示される | 変化球が来るまで試合を進めて確認 |
| B-3 | スライダーの三角形が「右斜め下」を向いている（右投げ右打） | 目視確認 |
| B-4 | ストライク = 赤系、ボール = 緑系 | 目視確認 |
| B-5 | 投球番号①②③...が表示される | 目視確認 |
| B-6 | 打者交代でマーカーがクリアされる | 打席が終わるまで進めてクリア確認 |
| B-7 | スイングした場合にバット位置マーカーが表示される | 空振り or ファウルで確認 |
| B-8 | 既存テスト全パス | `npm test` |

### テスト戦略

```typescript
src/ui/match-visual/__tests__/
  StrikeZone.test.tsx           // マーカーレンダリングの snapshot test
  pitch-marker-types.test.ts    // getBreakDirection() の球種×利き腕テスト

// match-visual-store の単体テスト
src/stores/__tests__/
  match-visual-store.test.ts    // addPitchMarker / clearForNextBatter の動作テスト
```

---

## Phase 12-C: グラウンド鳥瞰表示

**期間:** 3〜5日（Phase 12-A 完了後、Phase 12-B と並行可能）
**担当範囲:**
- フィールドSVG/Canvas描画
- 選手マーカー9人（チーム別色分け）
- 左上HUDの最終調整

### タスクリスト

```
□ BallparkCanvas.ts — renderBallpark() 純関数実装
□   drawStands(), drawOutfield(), drawInfield() — フィールド背景
□   drawBaselines(), drawFoulPoles(), drawBases() — ラインマーカー
□   drawFielders() — 選手マーカー（守備位置固定版）
□   drawRunnerHighlight() — 走者強調
□ Ballpark.tsx — React Canvas ラッパー、ResizeObserver
□ field-coordinates.ts — POSITION_TO_FIELD マッピング完成
□ matchProjector.ts — fieldPositions, runnerTeams を MatchViewState に追加
□ view-state-types.ts — fieldPositions, runnerTeams のオプショナルフィールド追加
□ page.tsx — <Diamond> を <Ballpark> に置き換え（またはBallparkを追加）
□ match.module.css — 2カラムレイアウト（グラウンド左 + ストライクゾーン右）
□ Retina 対応（devicePixelRatio の適用）
□ ResizeObserver polyfill の確認
```

### データモデル変更

| ファイル | 変更内容 |
|---|---|
| `view-state-types.ts` | `MatchViewState.fieldPositions?`, `runnerTeams?` 追加 |
| `matchProjector.ts` | `buildFieldPositions()`, `buildRunnerTeams()` 追加 |

### 完了基準

| # | 基準 | 確認方法 |
|---|---|---|
| C-1 | グリーンのフィールドと内野ベージュが正しく描画される | ブラウザ目視確認 |
| C-2 | 選手マーカー（丸）が9個、守備位置に配置される | 目視確認 |
| C-3 | 自校チームが青系、相手チームが赤系で表示される | 目視確認 |
| C-4 | 塁上の走者がオレンジ色で強調表示される | ランナーが出るまで進めて確認 |
| C-5 | 左上HUDにカウント・イニング・スコアが表示される | 目視確認 |
| C-6 | スマホ（375px）でレイアウトが崩れない | DevTools のモバイルエミュレーターで確認 |
| C-7 | Retina ディスプレイで滲まない | MacBook の Retina で目視確認（またはdevicePixelRatio=2でテスト） |
| C-8 | 既存テスト全パス | `npm test` |

### テスト戦略

```typescript
src/ui/match-visual/__tests__/
  BallparkCanvas.test.ts  // jest-canvas-mock を使った renderBallpark のスモークテスト
  field-coordinates.test.ts (追加)  // POSITION_TO_FIELD のマッピングテスト

// Visual snapshot テスト（Phase 12-E で検討）
// Playwright で /play/match/[matchId] のスクリーンショットを撮り比較
```

---

## Phase 12-D: ボール・打球アニメーション

**期間:** 3〜5日（Phase 12-B/C 完了後）
**担当範囲:**
- 投球時のボール移動（マウンド → ホームベース）
- 打球軌跡 Bezier 曲線アニメーション
- ボール影（高さ表現）
- 速度表現（速い球 = 短時間）

### タスクリスト

```
□ useBallAnimation.ts — アニメーションフック実装
□   triggerPitchAnimation() — 投球アニメーション
□   triggerHitAnimation() — 打球アニメーション
□   Bezier 補間 + easing ユーティリティ
□ BallparkCanvas.ts — drawBallWithShadow() 実装
□ computeTrajectory() — BatContactResult → BallTrajectory 変換
□ pitchSpeedToDuration() — 速度 → duration 変換
□ view-state-types.ts — PitchLogEntry.batContact? 追加
□ match-store.ts — stepOnePitch/stepOneAtBat で batContact を PitchLogEntry に含める
□ page.tsx — pitchLog 変化時に useBallAnimation.triggerPitchAnimation/triggerHitAnimation を呼ぶ
□ prefers-reduced-motion 対応（即時位置配置でアニメーションスキップ）
□ アニメーション完了後のボール消滅処理
```

### データモデル変更

| ファイル | 変更内容 |
|---|---|
| `view-state-types.ts` | `PitchLogEntry.batContact?` 追加 |
| `match-store.ts` | `stepOnePitch/stepOneAtBat` で batContact を格納 |

### 完了基準

| # | 基準 | 確認方法 |
|---|---|---|
| D-1 | 投球時にボールがマウンドからホームベースに向けて動く | 目視確認 |
| D-2 | 速い球（150km/h+）は遅い球（110km/h-）より短時間で通過する | 目視確認（速度差が体感できる） |
| D-3 | ボールの高さに応じて影が変化する（地面=大きい影、高空=小さい影） | 打球アニメーション中に目視確認 |
| D-4 | 打球が打球方向に Bezier 曲線で飛ぶ | インプレーが出るまで進めて確認 |
| D-5 | フライボールは山なり軌道、ゴロは低い軌道で飛ぶ | 打球種別で確認 |
| D-6 | デスクトップ Chrome で 60fps を維持（アニメーション中） | DevTools Performance タブで計測 |
| D-7 | iPhone Safari で 60fps を維持（実機 or BrowserStack） | 実機テスト |
| D-8 | 既存テスト全パス | `npm test` |

### テスト戦略

```typescript
src/ui/match-visual/__tests__/
  useBallAnimation.test.ts    // isAnimating 状態遷移テスト
  BallparkCanvas.test.ts (追加)  // drawBallWithShadow のスモークテスト

// パフォーマンステスト（手動）
// Chrome DevTools → Rendering → FPS Meter を有効化して計測
```

---

## Phase 12-E: 演出強化・パフォーマンス最適化

**期間:** 3〜5日（Phase 12-D 完了後）
**担当範囲:**
- イニング開始スコア票スライドイン演出の最終調整
- ホームラン演出（ファウルポール発光 + 軌跡トレイル）
- パフォーマンス最適化（オフスクリーンキャッシュ）
- Visual Regression Test の整備

### タスクリスト

```
□ ホームラン検知ロジック（fieldResult.type === 'home_run'）
□ drawHomeRunEffect() — ファウルポール発光 + トレイル
□ canvas-confetti の条件付き追加（npm install canvas-confetti）
□ オフスクリーン Canvas キャッシュ（静的背景の事前描画）
□   drawStaticBackground() — フィールド背景のみ OffscreenCanvas に事前描画
□   アニメーションフレームでは OffscreenCanvas を drawImage で転写
□ FPS モニタリングユーティリティ
□   measureFps() — 過去10フレームの平均FPSを計算
□   低FPS時の自動品質ダウングレード（影なしモード等）
□ Visual Regression Test（Playwright スクリーンショット）
□   試合開始後の初期状態スナップショット
□   ストライクゾーンにマーカーがある状態のスナップショット
□ framer-motion の再検討（導入 or 現状維持の最終判断）
□ スコア票演出の最終调整（イニングラベルのデザイン改善）
```

### 完了基準

| # | 基準 | 確認方法 |
|---|---|---|
| E-1 | ホームラン時にファウルポールが発光する | ホームランが出るまで試合を進めて確認 |
| E-2 | スマホ 60fps 達成（iPhone 12以上） | 実機テスト |
| E-3 | スマホ 30fps 以上（iPhone X相当） | BrowserStack or 実機 |
| E-4 | オフスクリーンキャッシュ有効時に計測FPSが 5% 以上改善 | Performance タブで before/after 比較 |
| E-5 | Visual Regression Test が通過 | `npm run test:e2e` |
| E-6 | 既存テスト全パス | `npm test` |
| E-7 | Phase 12 全体の TypeScript コンパイルエラーなし | `npm run build` |

---

## 独立リリース戦略

各サブフェーズは独立してリリース可能。推奨リリースポイント:

```
リリース 1: Phase 12-A 完了時
  → スコア票タイミング制御のみのリリース
  → ストライクゾーングリッドが静的表示
  → UI改善の最初の一歩として高橋さんにFBを得る

リリース 2: Phase 12-B/C 完了時
  → ストライクゾーンマーカー + グラウンド鳥瞰
  → ビジュアル化の主要機能が揃う
  → ユーザーからのFB収集（ビジュアルの見やすさ等）

リリース 3: Phase 12-D 完了時
  → ボールアニメーション追加
  → 「球場にいる感」が完成

リリース 4: Phase 12-E 完了時
  → ホームラン演出 + パフォーマンス最適化
  → Phase 12 全体完了
```

---

## テスト全体方針

### ユニットテスト（`npm test`）

| テストファイル | 担当サブフェーズ | 内容 |
|---|---|---|
| `useScoreboardVisibility.test.ts` | 12-A | フェーズ遷移 |
| `field-coordinates.test.ts` | 12-A/C | 座標変換数値検証 |
| `pitch-marker-types.test.ts` | 12-A/B | UV変換・変化球方向 |
| `match-visual-store.test.ts` | 12-B | マーカー追加・クリア |
| `BallparkCanvas.test.ts` | 12-C/D | jest-canvas-mock スモーク |
| `useBallAnimation.test.ts` | 12-D | アニメーション状態遷移 |
| `StrikeZone.test.tsx` | 12-B | Snapshot レンダリング |

### インテグレーションテスト（手動）

各サブフェーズの完了基準チェックリストをブラウザで目視確認。

### Visual Regression Test（Phase 12-E）

```bash
# Playwright E2E テスト
npm run test:e2e -- --grep "Phase 12"
```

- `tests/visual/match-scoreboard.spec.ts` — スコア票アニメーション
- `tests/visual/match-strikezone.spec.ts` — マーカー表示
- `tests/visual/match-ballpark.spec.ts` — グラウンド表示

---

## リスク管理

### Phase 12 全体のリスク

| リスク | 影響度 | 発生確率 | 対応 |
|---|---|---|---|
| スマホ 60fps 未達（Phase 12-A で判明） | 高 | 中 | Phase 12-A 完了後に実機測定し、設計見直し判断 |
| 既存テスト 743 件の破損 | 高 | 低 | engine/ 不変、型変更は optional のみ |
| Phase 11.5 との型衝突 | 中 | 低 | view-state-types.ts への追加は optional のみ |
| デザイン品質が低い | 中 | 高 | ballpark-reference.png のカラーパレット厳守。Phase 12-E でブラッシュアップ |
| 開発工数が見積を超過 | 中 | 中 | Phase 12-A/B を先行リリースし、C/D/E は後続スプリントへ延期可 |

### エスケープハッチ

Phase 12-D（ボールアニメーション）でFPS が 30fps を下回る場合:
1. アニメーションの `duration` を短縮（→ ボールが一瞬で移動）
2. 影描画を省略
3. アニメーション機能全体を OFF にするオプション追加
4. Canvas → SVG へのフォールバック（Phase 12-E で判断）

---

## 参照リファレンス

- グラウンド: [`assets/ballpark-reference.png`](./assets/ballpark-reference.png)
- ストライクゾーン: [`assets/strike-zone-reference.png`](./assets/strike-zone-reference.png)
