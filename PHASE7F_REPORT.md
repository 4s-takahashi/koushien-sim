# Phase 7-F 完了レポート — 細かい修正5件実装

**バージョン**: v0.22.0
**実装日**: 2026-04-20
**ベース**: v0.21.0 (Phase 7-E)
**コミット**: `5ef1806`

---

## 概要

Phase 7-F は高橋さんから指摘された試合画面の細かい修正5件を全て実装した。
ユーザビリティ向上、ゲーム仕様の完成度が大幅に上がった。

| # | タスク | 規模 | ステータス |
|---|--------|------|-----------|
| 1 | 試合画面からの詳細画面遷移 | 中 | ✅ |
| 2 | 学校名3文字短縮表記 + 移行 | 中 | ✅ |
| 3 | 采配の前回選択継続 | 小 | ✅ |
| 4 | 盗塁の可視化（実況ログ統合） | 中 | ✅ |
| 5 | アウトの詳細説明 | 中 | ✅ |

**変更**: 19 ファイル、+960 行、-50 行、新規テスト 368 行

---

## 実装詳細

### Task 1: 試合画面からの詳細画面遷移

**作業内容:**
- 試合画面の「高校名」（ホーム・アウェイ）と「選手名」（打者・投手）をクリック可能に
- `matchProjector` に `homeSchoolId`, `awaySchoolId` を追加
- 試合画面のスコアボード、打者パネル、投手パネルを`<button>` で wrap
- 詳細ページへの遷移: `/play/school/[schoolId]`, `/play/player/[playerId]`
- `sessionStorage` に `matchId` を保存して、詳細ページから「試合に戻る」ボタンで復帰
- 既存の詳細ページを拡張：戦績・能力・特性表示 + 戻るボタン

**ファイル**:
- `src/app/play/match/[matchId]/page.tsx` — コンポーネント clickable 化
- `src/app/play/match/[matchId]/match.module.css` — clickable スタイル（cursor, hover）
- `src/app/play/school/[schoolId]/page.tsx` — 詳細ページ拡張
- `src/app/play/player/[playerId]/page.tsx` — 詳細ページ拡張
- `src/ui/projectors/matchProjector.ts` — schoolId 追加

### Task 2: 学校名の3文字短縮表記

**作業内容:**
- `School` 型に `shortName: string` フィールド追加（3文字上限）
- 短縮名生成ロジック `generateShortName()` 実装：
  - 基本: 学校名から日本語3文字抽出
  - 「高校」「中学」「学園」など接尾辞は除外
  - 漢字が3文字未満なら元のまま
  - 例：「新潟県立長岡商業高等学校」→「長岡商」
- 世界生成時に全学校に `shortName` を事前生成
- 既存セーブデータ移行：`world-store.ts` の `getItem` で自動 migrate
- 試合画面表示：`選手名 (短縮名)` で攻撃側/守備側を識別可能に
- スコアボードには完全校名、スペース不足時は shortName フォールバック

**ファイル**:
- `src/engine/world/types.ts` — `School.shortName` 追加
- `src/engine/world/school-generator.ts` — `generateShortName()` 実装、全学校に shortName セット
- `src/stores/world-store.ts` — migration ロジック追加

**移行戦略**:
- 新規ゲーム: `createInitialWorld()` で `shortName` を生成
- 既存セーブ: ロード時に未設定の学校に自動生成

---

### Task 3: 采配の前回選択継続

**作業内容:**
- `match-store.ts` に `lastOrder: TacticalOrder | null` 状態追加
- `applyOrder()` で詳細采配（batter_detailed, pitcher_detailed）を実行した時点で `lastOrder` に記録
- 新しい打者に変わった時点で `lastOrder` をリセット（`stepOneAtBat` で batter index 変更検知）
- `DetailedOrderModal` に `lastOrder` を props で受け渡し
- `BatterForm` / `PitcherForm` の初期値を `lastOrder` から復元
- 「前回と同じ」ボタン追加：1クリックで前回の采配を自動適用

**UIフロー**:
1. 打者が采配モーダルを開く
2. モーダルに前回選択が pre-populate される
3. 「前回と同じ」ボタンでワンクリック採用
4. 打者が変わると `lastOrder` は自動リセット

**ファイル**:
- `src/stores/match-store.ts` — `lastOrder` state + `applyOrder()` 拡張
- `src/app/play/match/[matchId]/DetailedOrderModal.tsx` — `lastOrder` props 受け取り
- `src/app/play/match/[matchId]/page.tsx` — `lastOrder` を subscription で fetch
- `src/app/play/match/[matchId]/detailedOrderModal.module.css` — `sameAsLastBtn` スタイル

---

### Task 4: 盗塁の可視化

**作業内容:**
- 盗塁ロジック（`attemptSteal()`）が実装されていなかった → 完全実装
- ランナーが盗塁を仕掛ける際の成功確率：ランナー速度 vs 捕手肩力で判定
- 成功時: ランナーが次の塁に移動、実況ログに「〇〇、二塁へ盗塁成功！」
- 失敗時: ランナー out、実況ログに「△△、二塁盗塁失敗！タッチアウト」
- steal order が `pending` に入ると、pitch 実行前に steal を自動実行
- `buildNarrationForPitch()` / `buildNarrationForAtBat()` で steal イベントを検出・実況化

**実装**:
- `src/engine/match/tactics.ts` — `attemptSteal()` 完全実装（成功判定 + 状態更新）
- `src/engine/match/runner.ts` — `stepOnePitch()` / `stepOneAtBat()` で steal order を解決
- `src/ui/narration/buildNarration.ts` — steal narration 検出・生成

**テスト**: 新規テストファイル `tests/engine/match/steal.test.ts`（368行）
- steal 成功パターン
- steal 失敗パターン
- ランナー位置による steal 制約（3塁は盗塁不可）
- outs 増加の検証

---

### Task 5: アウトの詳細説明

**作業内容:**
- 実況ログで「アウト」と表示されていたのを詳細化
- pitch 結果から打球方向・守備位置を抽出して具体的なプレイを説明

**詳細化内容**:
- **ゴロアウト**: 「サード正面のゴロ、ファースト送球アウト」
- **フライアウト**: 「センターフライ、アウト」「ライトへの大飛球」
- **三振**: 「空振り三振」「見逃し三振」
- **併殺**: 「ショートゴロ、ゲッツー！」
- **犠打**: 「スクイズ成功、1アウト」

**実装**:
- `src/ui/narration/buildNarration.ts` に位置マップ（1B, 2B, 3B, SS, OF）を追加
- `batResultJP()` 関数の詳細化：pitch 結果の groundBallDirection 情報から守備位置を特定
- `buildNarrationForPitch()` / `buildNarrationForAtBat()` で in-play を詳細化

---

## テスト結果

**全体**: ✅ **843 tests passed**（新規テスト含む）
- Phase 7-E との後方互換性: 100% 維持
- steal テスト: 新規 15 件追加
- build: ✅ Next.js strict build 通過

---

## デプロイ

**VPS**: SSH → rsync → npm ci && npm run build && pm2 restart
**本番URL**: https://kokoyakyu-days.jp/ → **HTTP 307** ✅

---

## チェックリスト

| 項目 | ステータス |
|------|-----------|
| 1. 試合画面のリンク機能 | ✅ clickable, sessionStorage, 詳細ページ復帰 |
| 2. 学校短縮名 3 文字表示 | ✅ 全国学校に自動生成、既存セーブ移行 |
| 3. 采配前回継続「前回と同じ」ボタン | ✅ lastOrder state + UI |
| 4. 盗塁成功/失敗実況ログ表示 | ✅ attemptSteal 実装 + narration 統合 |
| 5. アウトの詳細説明（守備位置・プレイ内容） | ✅ batResultJP 詳細化 |
| テスト全パス | ✅ 843 tests |
| VPS デプロイ完了 | ✅ HTTP 307 |
| コミット & push | ✅ `5ef1806` |

---

## 次のステップ候補

- Phase 11-A: 監督の戦術スタイル（指揮官パーソナリティシステム）
- Phase 11-B: 記録・ランキング（年度別スタッツ、伝説選手殿堂）
- Phase 11-C: **甲子園システム**（都道府県制・地方大会 → 甲子園ブラケット）← **目玉機能**

高橋さん、次フェーズの指示をお待ちしています！
