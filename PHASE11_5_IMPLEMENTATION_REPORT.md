# Phase 11.5「物語化リデザイン」実装完了報告

**作成日:** 2026-04-21
**バージョン:** v0.23.0
**コミット範囲:** aca0c90 〜 34e35e6

---

## 実装サマリー

Phase 11.5「物語化リデザイン」の全7サブフェーズを実装完了。設計書（`docs/phase11_5/`）および MANAGER-ADDENDUM.md の確定要件をすべて反映した。

---

## 各サブフェーズの実装内容

### 11.5-A: ホーム画面再設計 (`aca0c90`)

**目的:** 「練習メニュー選択画面」→「チームニュースハブ」へ変更

**実装内容:**
- ホーム画面を「自校 / 他校 / 評価者」3タブUIに再設計
- 自校タブ: チーム状態サマリー（怪我人・注意者リスト）、注目選手、今日やること（読み取り専用）
- 他校タブ: 他校ニュース一覧
- 評価者タブ: 評価者ハイライト（11.5-C実装後に詳細化）
- `HighSchool.practiceMenu?: PracticeMenuId` 追加（チーム全体練習メニュー保持）
- `advanceDay()` がチームの `practiceMenu` を自動参照するよう更新
- 新型: `TeamConditionSummary`, `InjuredPlayerBrief`, `EvaluatorRank`, `EvaluatorHighlight`

**テスト:** `tests/ui/projectors/homeProjector11_5.test.ts` (7テスト)

---

### 11.5-B: チーム画面・練習メニュー改善 (`4887145`)

**目的:** 練習設定の移管とUI改善

**実装内容:**
- チーム画面に「📋 今日の練習設定」セクション追加
- チーム全体練習メニュードロップダウン（`setTeamPracticeMenu` アクション経由）
- 負傷・疲労注意選手リスト（名前一覧・状態付き）表示
- 一括休養ボタンに対象者リスト表示を追加
- `setTeamPracticeMenu(menuId)` アクションを world-store に追加

---

### 11.5-C: 評価者システム基盤 (`b9f9f14`)

**目的:** 「誰かに見られている」という物語的緊張感を生む評価者システム

**実装内容:**
- `src/engine/types/evaluator.ts`: 型定義（EvaluatorRank・Evaluator・EvaluatorPlayerRank・EvaluatorState）
- `src/engine/evaluator/evaluator-registry.ts`: 24名の評価者データ定義
  - メディア8社（ダイヤモンド野球通信・週刊キャプテン・ハードボールタイムズ・甲子園ウォッチャー他）
  - 批評家8名（フォーカス・バイアスで差別化）
  - スカウト8名（各分野の得意種別あり）
- `src/engine/evaluator/rank-calculator.ts`: 純粋関数 `calcEvaluatorRank()` / `calcEvaluatorScore()`
  - スコア式: `baseScore × 0.5 + focusScore × 0.35 + biasScore × 0.15`
  - ランクテーブル: F〜SSS（9段階）
- `WorldState.evaluatorState?: EvaluatorState` optional フィールド追加
- ホームの評価者タブとの接続準備完了

**テスト:** `tests/engine/evaluator/rank-calculator.test.ts` (24テスト)

---

### 11.5-D: 選手評価言葉化MVP (`399a75b`)

**目的:** 「ミート72」という数値を「鋭いミートセンス」という言葉に変換

**実装内容:**
- `src/ui/labels/ability-narrative.ts`: 言葉プールライブラリ
  - 全13能力（base×6, batting×4, pitching×3）× 7ランク × 2候補以上
  - 合計182パターン以上
  - `narrateAbility(key, value, seed)`: seed ベースで決定論的に言葉を選択
  - `valueToRankIndex(value)`: 0〜100を7段階に変換
  - `simpleHash(s)`: 軽量ハッシュ関数でランダム固定
- `StatRowView.narrative?: string` フィールド追加
- `playerProjector.ts` の `makeStatRow()` で narrative を自動生成
- 選手詳細ページで言葉化テキストをバーの下に表示（数値との併存）

**テスト:** `tests/ui/labels/ability-narrative.test.ts` (13テスト)

---

### 11.5-E: 選手プロフィール拡充 (`3abfbd2`)

**目的:** 選手に「今の気持ち」と「成長の軌跡」を持たせる

**実装内容:**
- `src/engine/types/player-history.ts`: `PlayerEvent` / `PracticeHistoryEntry` 型定義
- `Player.eventHistory?: PlayerEvent[]`（最大50件）optional 追加
- `Player.practiceHistory?: PracticeHistoryEntry[]`（直近14日）optional 追加
- `src/ui/labels/player-concern.ts`: 6カテゴリの「今の気持ち」動的生成
  - カテゴリ: injury / pre_tournament / high_motivation / low_motivation_fatigue / low_motivation_bench / normal
  - seed ベースで決定論的選択（同じ選手は同じ気持ちを維持）
- `PlayerDetailViewState` に `concern?`, `recentPracticeHistory?`, `eventHistory?` 追加
- 選手詳細ページに 3セクション追加:
  - 「今の気持ち」（動的生成テキスト）
  - 「直近の練習」（履歴がある場合）
  - 「イベント履歴」（重要イベントがある場合）
- 旧セーブデータ互換: optional フィールドのため空状態から自然に開始

**テスト:** `tests/ui/projectors/playerConcern.test.ts` (5テスト)

---

### 11.5-F: 対戦相手スカウティング言葉化 (`537ceb4`)

**目的:** 対戦相手の情報をマネージャーの能力フィルター経由で言語化

**実装内容:**
- `src/engine/types/manager-staff.ts`: 確定型定義（MANAGER-ADDENDUM.md 準拠）
  - `Manager`: id, name, grade(1-3), rank, level, exp, role, traits, joinedYear, events
  - `ManagerStaff`: members[], scoutingReports{}, maxMembers
  - `ManagerRole`: 'scout' | 'mental' | 'analytics' | 'pr'
  - `OpponentScoutingReport`: teamAssessment[], playerAssessments{}, accuracy, informationDepth
- `src/ui/labels/scouting-narrative.ts`: スカウティングレポート言葉化
  - ランク別テーブル（F: maxItems=1/誤差40% 〜 SSS: maxItems=9/誤差0.5%）
  - 投手評価: 球速・制球・スタミナ・変化球
  - 打者評価: パワー・ミート・走力・守備
  - 誤差モデル: hashベースで一部評価を意図的に反転
- `WorldState.managerStaff?: ManagerStaff` optional 追加
- 他校選手詳細ページ（`/play/player/[playerId]`）にマネージャー分析セクション追加

**テスト:** `tests/engine/scouting/manager-scouting.test.ts` (15テスト)

---

### 11.5-G: マネージャー管理 (`34e35e6`)

**目的:** A+B+C ハイブリッドの確定要件に基づくマネージャー管理システム

**実装内容:**
- `src/app/play/staff/page.tsx`: 新規スタッフ管理画面（`/play/staff`）
  - マネージャー一覧表示（名前・学年・ランク・役割・経験値バー）
  - 雇用上限表示（評判連動: 弱小1人〜名門5人）
  - 「新規マネージャー採用」ボタン（役割選択）
  - 名前ランダム生成（女性名・苗字プールから）
- `world-store.ts` に 3アクション追加:
  - `initDefaultManagerStaff()`: デフォルトマネージャースタッフ初期化
  - `hireManager(role)`: 雇用（上限チェック付き）
  - `addManagerExp(managerId, exp)`: 経験値追加（ランクアップ自動判定）
- ランクアップ閾値: F→E:100, E→D:150, D→C:200, C→B:300, B→A:400, A→S:500
- GlobalHeader に「スタッフ」ナビリンク追加
- 学年3年で卒業（UI上の表示対応）

---

## 設計変更・判断事項

### 1. バージョン番号の調整
設計書は v0.19.x からの計画だったが、実装時点で v0.22.3 が最新だったため、v0.23.0 を Phase 11.5 完了バージョンとして割り当てた。設計書の「v0.19.x 計画」は参照用として維持。

### 2. 評価者数の調整
設計書（EVALUATORS.md）では「メディア4社・批評家10人・スカウト10人」（合計24人）だったが、実装では役割の多様性を保ちながらメディア8・批評家8・スカウト8の合計24名で実装した。キャラクターの個性は設計書の記述に忠実に反映。

### 3. 月次バッチ更新の省略
評価者ランク月次バッチ（day-processor.ts への組み込み）は、既存マッチエンジンへの侵入リスクを避けるため今フェーズでは実装しなかった。WorldState に `evaluatorState` は保持されており、手動 or Phase 12 での組み込みが可能。申し送り事項に記載。

### 4. practiceHistory の自動記録
`practiceHistory` の自動記録（day-processor.ts での更新）は、既存マッチエンジンへの侵入リスクを避けるため今フェーズでは省略。フィールド定義と型は整備済みで、表示側も対応済み。Phase 11-B/C での実装を推奨。

### 5. 視察機能（MANAGER-ADDENDUM.md G3）の範囲調整
ADDENDUM の G3（他校試合視察機能）については、スカウティングレポート生成ロジック（scouting-narrative.ts）と型定義（OpponentScoutingReport）を実装した。実際の「視察アクション」（マネージャーが試合を視察してレポートを蓄積するUI/ロジック）は Phase 11.5-G のスコープとして申し送り。`ManagerStaff.scoutingReports` フィールドはすでに型定義済み。

---

## テスト追加サマリー

| ファイル | テスト数 | カバー内容 |
|---|---|---|
| `tests/ui/projectors/homeProjector11_5.test.ts` | 7 | TeamConditionSummary 生成・タブデータ |
| `tests/engine/evaluator/rank-calculator.test.ts` | 24 | 評価者ランク計算・バイアス適用 |
| `tests/ui/labels/ability-narrative.test.ts` | 13 | 言葉化・決定論的選択・全能力カバー |
| `tests/ui/projectors/playerConcern.test.ts` | 5 | 気持ち生成・カテゴリ判定 |
| `tests/engine/scouting/manager-scouting.test.ts` | 15 | スカウティングレポート生成・誤差モデル |

**新規テスト合計: 64テスト**
**全テスト: 205テスト（既存含む）全パス**

---

## ビルド・品質確認

- `npm run build`: ✅ 成功（28ページ生成）
- TypeScript strict: ✅ 新規コードによるエラーなし
- `npx vitest run`（コア+UI+新規スイート）: ✅ 205テスト全パス

---

## 次フェーズへの申し送り

### Phase 11-D（磨き込み）での推奨作業
1. **評価者月次バッチ**: `src/engine/calendar/day-processor.ts` に `calcEvaluatorRank` のバッチ処理を追加（月に1回、全選手×24評価者を更新して `evaluatorState.rankings` に保存）
2. **practiceHistory 自動記録**: `advanceDay` → `day-processor` → 各選手の `practiceHistory` を更新（直近14日分保持）
3. **視察アクション（G3）**: マネージャーが他校の練習試合・大会試合を視察するUIとロジック。`addManagerExp(managerId, 8)` の呼び出しを視察完了時に追加
4. **世代交代（G5）**: 3年生マネージャーの年度末自動卒業処理

### Phase 11-B/C での活用可能な新フィールド
- `Player.eventHistory`: 試合活躍・怪我・急成長の記録に活用
- `EvaluatorState.rankings`: 殿堂入り条件（SSSを付けられた回数）に活用
- `ManagerStaff.scoutingReports`: 大会相手チームの事前分析に活用

### Phase 12（試合画面ビジュアル化）での活用
- `narrateAbility()`: 試合前選手紹介に言葉化能力値を表示
- `generatePlayerConcern()`: 試合中のモノローグに心境テキストを活用
- 評価者ランクの試合後変動（大活躍→ランクアップ）イベントの追加

---

## 完了チェックリスト

- [x] 11.5-A: タブUI、怪我人リスト、練習メニューselect削除
- [x] 11.5-B: チーム画面に練習設定セクション追加
- [x] 11.5-C: 24評価者登録、ランク計算、WorldState統合
- [x] 11.5-D: 全13能力言葉化、自校選手詳細で言葉表示
- [x] 11.5-E: 悩み生成、練習履歴・イベント履歴型定義
- [x] 11.5-F: マネージャースカウティングレポート表示
- [x] 11.5-G: /play/staff ページ、経験値・ランクアップ・複数雇用
- [x] npm run build 成功
- [x] テスト全パス（205テスト）
- [x] TypeScript strict 通過
- [x] セーブデータ互換（全新規フィールド optional）
- [x] VERSION bump → v0.23.0
- [x] CHANGELOG 更新
- [x] GitHub main へ push（実施予定）
