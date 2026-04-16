# Phase 6.1 実装レポート — 公開前仕上げ

**実施日**: 2026-04-16  
**ブランチ**: main（b0b90c3 ベース）  
**担当**: Phase 6.1 公開前仕上げ作業

---

## 概要

Phase 6.0 完了時点（489テスト全パス）から、以下の5領域の仕上げ作業を実施した:
1. 現状確認（テスト・ビルド検証）
2. セーブ/ロードの追加テスト
3. 初回プレイ導線改善
4. モバイル対応
5. ドキュメント整備

---

## ステップ1: 現状確認

### テスト結果
```
Test Files  48 passed (48)
Tests       489 passed (489)
Duration    64.62s
```
全489テスト パス確認。

### ビルド結果
```
✓ Compiled successfully in 5.6s
✓ Generating static pages using 1 worker (9/9)
```
本番ビルド成功確認。TypeScript エラーなし。

### コードレベル画面確認
全7ページ（`/`, `/team`, `/team/[id]`, `/scout`, `/tournament`, `/results`, `/ob`）の import・Projector呼び出し・リンク先を確認。問題なし。

---

## ステップ2: セーブ/ロードの追加テスト

**新規ファイル**: `tests/engine/save/phase6/world-save-extended.test.ts`

### 追加したテストシナリオ（16件）

#### 30日間進行後のセーブ/ロード
- `advanceWorldDay()` を30回呼び出した後の WorldState をセーブ→ロード
- 日付・選手能力値（`stats.batting.contact`, `stats.base.stamina`）の完全一致を検証
- Map フィールド（scoutReports, recruitAttempts, personRegistry.entries）の復元確認

#### 複数スロットへの同時セーブ/ロード
- 3スロット全てに異なる学校名・日付をセーブし独立性を確認
- スロット上書き時に最新データが返ることを検証
- 特定スロット削除が他スロットに影響しないことを確認

#### 年度替わり後のセーブ/ロード
- Year 2 開始・Year 3 夏大会中などの日付で正確に復元されることを検証

#### 破損データの検出
- localStorage の stateJson を改ざんしてチェックサム不一致エラーを検証
- 空 JSON・完全破損 JSON・必須フィールド欠け・空 schools 配列のロード失敗を検証

#### シリアライザ追加ケース
- `middleSchoolPool` の各エントリに `firstName`/`lastName` フィールドがあることを確認
- 全48校の復元確認
- 空 Map の персонRegistry.entries 復元確認

### テスト結果
```
Test Files  1 passed (1)
Tests       16 passed (16)
```

---

## ステップ3: 初回プレイ導線改善

**変更ファイル**: `src/app/page.tsx`, `src/app/page.module.css`

### 追加コンポーネント

#### `WelcomeBanner` コンポーネント
- 表示条件: `date.year === 1 && date.month === 4 && date.day === 1`（ゲーム開始直後のみ）
- 「ようこそ、新任監督！」メッセージ
- 最初の3ステップをナンバー付きリストで案内
  1. チームを確認する → `/team` リンク
  2. 練習メニューを選ぶ → ホーム画面の練習選択
  3. 1日進める → 進行ボタン
- オレンジ/金色系の和風デザイン（#f5a623 アクセント）

#### `ProgressIndicator` コンポーネント
- 常時表示（全ゲーム期間）
- ヘッダー直下に横一列で表示
- 表示項目:
  - 現在の日付（和暦風表示）
  - 現在のシーズン
  - 次の大会名とおよその時期
  - チーム総合力（数値）
- 大会期間中は「〇〇大会 開催中！」と表示

### CSS 追加
- `.welcomeBanner` / `.welcomeTitle` / `.welcomeText` / `.welcomeSteps` / `.stepNum` / `.stepText` / `.stepLink`
- `.progressBar` / `.progressItem` / `.progressLabel` / `.progressValue` / `.progressSub` / `.progressOverall` / `.progressDivider`

---

## ステップ4: モバイル対応

全8 CSS Module に `@media (max-width: 768px)` セクションを追加。

### 変更ファイル一覧

| ファイル | 主な変更 |
|---------|---------|
| `src/app/page.module.css` | 1カラムグリッド・ナビ横スクロール・ボタン拡大・セットアップ画面縮小 |
| `src/app/team/page.module.css` | statsBar 2カラム・テーブル横スクロール |
| `src/app/team/[playerId]/page.module.css` | 1カラムグリッド・recordTable横スクロール |
| `src/app/scout/page.module.css` | 1カラムグリッド・scoutTable横スクロール・filterBar縦並び |
| `src/app/tournament/page.module.css` | roundTabs横スクロール（既存 bracketScroll を補強） |
| `src/app/results/page.module.css` | atBatTable横スクロール・matchHeaderラップ |
| `src/app/ob/page.module.css` | statsBar 2カラム・obTable横スクロール |
| `src/app/layout.module.css` | ヘッダー縦並び・ナビ横スクロール・ボタン最小44px |

### モバイル対応のポイント
- **ナビゲーション**: `overflow-x: auto; flex-wrap: nowrap;` で横スクロール対応
- **テーブル**: `overflow-x: auto; min-width: Xpx;` で横スクロール対応
- **タップターゲット**: ナビリンク・ボタンの `min-height: 44px`（Apple HIG 基準）
- **グリッド**: 2カラム→1カラムへの切り替え
- **フォント**: デスクトップの 11-12px の部分をモバイルでは 12-14px に維持

---

## ステップ5: layout.tsx viewport メタ

**変更ファイル**: `src/app/layout.tsx`

### 変更内容
- `Viewport` 型を Next.js 16 の推奨方法でエクスポート
- `width: "device-width"`, `initialScale: 1`, `maximumScale: 5` を設定
- title を `"甲子園シミュレーター"` → `"甲子園への道 — 高校野球シミュレーション"` に変更
- description を日本語の詳細説明に更新

---

## ステップ6: README 整備

**変更ファイル**: `README.md`（create-next-app デフォルトから全面書き直し）

### 構成
1. 遊び方（6ステップ）
2. 操作説明（全7画面）
3. 練習メニュー一覧
4. 技術スタック
5. デザインシステム（配色変数一覧）
6. セットアップ（npm install → npm run dev）
7. テスト（vitest run）
8. デプロイ（Vercel）
9. ライセンス・GitHub URL

---

## ステップ7: KNOWN_ISSUES.md 作成

**新規ファイル**: `KNOWN_ISSUES.md`

### 分類

| 優先度 | 件数 | 内容 |
|--------|-----|------|
| 🔴 高 | 3 | ラインナップ手動編集未実装、試合観戦モードなし、勧誘確率バランス |
| 🟡 中 | 5 | 今季勝敗非表示、練習効果フィードバック、ウェルカム監督名ハードコード、セーブパネルタップ難、選手詳細導線 |
| 🟢 低 | 7 | 長期バランス、OB詳細、秋大会→センバツ連鎖、施設投資、練習季節対応、セーブエクスポート、OGP |
| 🔧 技術 | 3 | advanceWeek エラー処理、LocalStorage 容量、処理パフォーマンス |

---

## 最終確認

### テスト結果
```
Test Files  49 passed (49)
Tests       505 passed (505)  ← 489 + 16（新規）
Duration    64.08s
```

### ビルド結果
```
✓ Compiled successfully in 5.5s
✓ Generating static pages using 1 worker (9/9)
```

### 成果物一覧

| 成果物 | 説明 |
|--------|------|
| `tests/engine/save/phase6/world-save-extended.test.ts` | セーブ/ロード追加テスト（16件） |
| `src/app/page.tsx` | WelcomeBanner + ProgressIndicator 追加 |
| `src/app/page.module.css` | 新コンポーネント CSS + モバイル対応 |
| `src/app/team/page.module.css` | モバイル対応 |
| `src/app/team/[playerId]/page.module.css` | モバイル対応 |
| `src/app/scout/page.module.css` | モバイル対応 |
| `src/app/tournament/page.module.css` | モバイル対応 |
| `src/app/results/page.module.css` | モバイル対応 |
| `src/app/ob/page.module.css` | モバイル対応 |
| `src/app/layout.module.css` | モバイル対応 |
| `src/app/layout.tsx` | viewport メタ + タイトル/description 更新 |
| `README.md` | 遊び方・操作説明・セットアップを全面整備 |
| `KNOWN_ISSUES.md` | 既知課題18件を分類整理 |

---

## 完了条件チェック

- [x] `npx vitest run` で全テスト（489 + 16 = 505件）がパスすること
- [x] `npx next build` が成功すること
- [x] README.md が整備されていること
- [x] KNOWN_ISSUES.md が作成されていること
- [x] PHASE6_1_REPORT.md が作成されていること
- [x] 全画面のモバイル対応 CSS が入っていること（8ファイル）
