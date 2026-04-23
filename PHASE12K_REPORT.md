# PHASE12K_REPORT.md — v0.30.0 実装完了レポート

**日時**: 2026-04-23 UTC
**実装者**: Claude Code
**バージョン**: v0.29.0 → v0.30.0
**ブランチ**: main

---

## 概要

高橋さん指示 2026-04-23 UTC 04:52 の3タスクを実装しました。

---

## タスク 1: 選手心理の切り替え時間延長

### 変更内容
- **PsycheWindow.tsx**: ローテーション間隔 `1000ms → 2000ms`
- **PsycheWindow.tsx**: フェードアウト待機 `200ms → 300ms`
- **psycheWindow.module.css**: トランジション `0.2s → 0.3s`

### 変更ファイル
- `src/app/play/match/[matchId]/PsycheWindow.tsx`
- `src/app/play/match/[matchId]/psycheWindow.module.css`

### 動作確認
- ローテーション位置インジケーター（ドット）の挙動は変更なし
- フェードアウト→表示切替→フェードインの視認性向上

---

## タスク 2: アナリストマネージャーによる相手投手分析コメント

### 新規ファイル

#### `src/engine/staff/analyst.ts`
- `generateAnalystComment(pitchLog, analyst, inning, half)` — 分析コメント生成
- `generateAnalystCommentFromManagers(pitchLog, managers, inning, half)` — マネージャーリストから最高レベルを選択
- 分析対象:
  - 球種の偏り（fastball/slider/curveball/changeup/splitter）
  - コースの偏り（9ゾーン: 内外高低）
  - カウント別配球傾向（2ストライク後の決め球）
  - ランナー時の傾向
- マネージャーレベル（level 1-100 → 1-5スケール）で精度制御:
  - レベル5: ノイズ係数 0.05（ほぼ正確）
  - レベル1: ノイズ係数 0.60（偶然の揺らぎを傾向と誤認）
  - レベル1-2でかつ analysisRoll < 0.3: ノイズコメントを生成
- 1回終了時: サンプル不足の弱コメント
- 2回以降: 本格分析（球種/コース/カウント/ランナー傾向から1つ）

#### `src/app/play/match/[matchId]/AnalystPanel.tsx`
- アナリストコメントをスクロール可能な吹き出しで表示
- コメント種別アイコン付き（⚾球種傾向 / 📍コース / 🔢カウント / 🏃ランナー / 📋不足 / ❓ノイズ）
- マネージャー名＋レベル（★☆表示）付き
- 新しいコメントで自動スクロール

#### `src/app/play/match/[matchId]/analystPanel.module.css`
- ダークグリーン系の独自スタイル（実況ログと差別化）

### 変更ファイル

#### `src/stores/match-store.ts`
- `analystComments: AnalystComment[]` フィールド追加（persist 対応・既存セーブ互換）
- `addAnalystComment(inning, half, managers)` アクション追加
- `initMatch()` でリセット

#### `src/app/play/match/[matchId]/page.tsx`
- `AnalystPanel` import 追加
- `analystComments`, `addAnalystComment` ストア購読追加
- イニング終了（`pauseReason.kind === 'inning_end'`）時にコメント自動生成
- `MatchPageInner` に `analystComments`, `hasAnalyst` props 追加
- `infoColumn` に `AnalystPanel` 配置（実況ログ・心理ウィンドウの下）

### テスト
- `tests/engine/staff/analyst.test.ts` — **19件**
  - コメント生成（サンプル不足・1回目・2回以降）
  - レベル変換（1-100 → 1-5）
  - マネージャー選択（最高レベル・analytics ロールなし）
  - 境界値（inning=9, level=0/100）

---

## タスク 3: アニメーション停止バグ修正

### 症状
1. スマホ画面サイズ切り替えでアニメーションが止まる（ResizeObserver 発火）
2. 中断→再開後にアニメーションが動かなくなる（visibilitychange）

### 修正内容

#### `src/ui/match-visual/Ballpark.tsx`

**[修正1] visibilitychange リスナー追加**
- `document.addEventListener('visibilitychange', ...)` を `useEffect` で登録
- タブ復帰時（`visibilityState === 'visible'`）:
  - アニメーション中かつループが死んでいたら再起動
  - 非アニメーション状態なら静止描画を1回実行

**[修正2] ResizeObserver 発火時の二重起動防止**
- `isLoopRunningRef.current` ガードを追加
- `start` 時に `if (isLoopRunningRef.current) return;` でスキップ
- `stop` 時に `isLoopRunningRef.current = false` にリセット

**[修正3] ballAnimStateRef で最新状態を参照**
- `ballAnimStateRef` を追加し `useEffect` で同期
- visibilitychange ハンドラからクロージャキャプチャなしで最新状態を参照

**[修正4] アンマウント時クリーンアップ強化**
- `isLoopRunningRef.current = false` をクリーンアップに追加

### テスト
- `tests/ui/match-visual/animation-lifecycle.test.ts` — **18件**
  - `isAnimating` 判定ロジック（null/undefined/各フラグ）
  - ループ制御: 二重起動防止・start/stop サイクル
  - visibilitychange: タブ復帰時の再起動・非アニメーション時の静止描画
  - rehydrate 後: フラグ変化でループ起動・静止描画

---

## テスト結果

| 項目 | 結果 |
|------|------|
| 新規テスト (analyst.test.ts) | ✅ 19件全パス |
| 新規テスト (animation-lifecycle.test.ts) | ✅ 18件全パス |
| 既存テスト（全体） | ✅ 1041件パス（25件は v0.29.0 以前からの既存失敗） |
| TypeScript strict | ✅ 新規ファイルにエラーなし |

### 既存の失敗テストについて
v0.29.0 時点から以下のテストが失敗していることを確認（本実装とは無関係）:
- `tests/engine/world/world-ticker-phase8.test.ts` — シーズンフェーズ遷移
- `tests/engine/match/career-stats.test.ts` — キャリア統計型定義
- `tests/engine/world/balance.test.ts` — マネージャー型
- その他

---

## バージョン

```
v0.29.0 → v0.30.0 (feat)
BUILD_DATE: 2026-04-23 05:13 UTC
```

---

## ファイル一覧

### 新規作成
- `src/engine/staff/analyst.ts`
- `src/app/play/match/[matchId]/AnalystPanel.tsx`
- `src/app/play/match/[matchId]/analystPanel.module.css`
- `tests/engine/staff/analyst.test.ts`
- `tests/ui/match-visual/animation-lifecycle.test.ts`
- `PHASE12K_REPORT.md`

### 変更
- `src/version.ts` (CHANGELOG + VERSION 0.30.0)
- `src/app/play/match/[matchId]/PsycheWindow.tsx`
- `src/app/play/match/[matchId]/psycheWindow.module.css`
- `src/app/play/match/[matchId]/page.tsx`
- `src/stores/match-store.ts`
- `src/ui/match-visual/Ballpark.tsx`
