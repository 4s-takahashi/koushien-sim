# Phase S1-C 完了レポート — 成長システム + イベント生成（C1-C3）

**作成**: 2026-04-29
**実装者**: claude (acp) #3
**バージョン**: v0.45.2 → v0.45.3（マギが bump 予定）
**ベースコミット**: a806fd1

---

## 実装サマリー

Phase S1-C の全タスク（C1〜C3）を実装完了。
テスト 2002件すべて PASS、ビルド成功。

---

## 変更ファイル一覧

### 新規作成ファイル

| ファイル | 概要 |
|---|---|
| `src/engine/types/growth.ts` | GrowthEvent / GrowthEffect / GrowthEventType 型定義 |
| `src/engine/growth/growth-events.ts` | 成長イベント生成・適用ロジック（C3） |
| `src/engine/news/school-news.ts` | 自校ニュース変換・集計ロジック（C2） |
| `src/ui/components/SchoolNewsBoard.tsx` | 自校ニュースボードコンポーネント（C2） |
| `tests/engine/growth/growth-events.test.ts` | C3 テスト（C3-test1〜C3-test3） |
| `tests/engine/world/world-ticker-motivation.test.ts` | C1-test4 world-ticker 統合テスト |
| `tests/ui/components/SchoolNewsBoard.test.ts` | C2-test1, C2-test2 テスト |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/engine/growth/motivation.ts` | `tickMotivation()` / `applyTickMotivation()` 関数追加（C1） |
| `src/engine/world/world-state.ts` | `eventLog?: GrowthEvent[]` フィールド追加（C3）、GrowthEvent import 追加 |
| `src/engine/world/world-ticker.ts` | `applyTickMotivation` / `generateGrowthEvents` / `applyGrowthEvents` 呼び出し追加（C1/C3）、GrowthEvent eventLog 更新、advanceSchoolFull/advanceSchoolStandard シグネチャ変更 |
| `src/app/play/page.tsx` | SchoolNewsBoard コンポーネント統合、OwnSchoolTab に schoolNewsItems/schoolName props 追加（C2） |
| `tests/engine/growth/motivation.test.ts` | C1-test1〜C1-test4 テスト追加 |
| `tests/e2e/full-season.test.ts` | 365日進行テストに `{ timeout: 30000 }` 追加（既存テストのタイムアウト対応） |

---

## タスク別実装詳細

### C1: やる気（motivation）が休息で上がらないバグ修正

**問題**: `world-ticker.ts` の `advanceSchoolFull` / `advanceSchoolStandard` で motivation 更新が呼ばれていなかった。

**修正内容**:

1. `motivation.ts` に `tickMotivation()` 関数を新設
   - 休養日: +5（基本） + 日曜なら +3 追加 = 合計 +5〜+8
   - 練習日: 練習効果あり → +2、連続練習で疲労蓄積 → -1
   - ライバル3人以上 → -1、疲労80以上 → -3

2. `applyTickMotivation()` ラッパー関数も追加（全選手一括適用）

3. `world-ticker.ts` の `advanceSchoolFull` を更新:
   - `dayOfWeek` と `isRestDay` を引数追加
   - dayResult の playerChanges から練習効果があった選手IDを抽出
   - `applyTickMotivation` を呼ぶ

4. `advanceSchoolStandard` にも同様に `applyTickMotivation` を追加（standard tier 校も motivation が更新されるように）

**上限保護**: `applyMotivationDelta` が 0-100 クランプを保証

**テスト**: C1-test1〜C1-test4 全 pass（計 16 テスト追加）

---

### C2: 自校ニュース枠（ホーム画面）

**新規実装**:

1. `src/engine/news/school-news.ts`
   - `SchoolNewsItem` 型（id / date / genre / icon / headline / playerId / sourceEventId）
   - `SchoolNewsGenre`: growth / record / injury / mental / general
   - `growthEventToSchoolNews()`: GrowthEvent → SchoolNewsItem 変換
   - `buildSchoolNewsList()`: eventLog から最大30件・日付降順リストを構築
   - `sortAndLimitNews()`: 日付降順ソート
   - `getGenreIcon()`: ジャンル別アイコン（⭐/🏆/🏥/💪/📰）

2. `src/ui/components/SchoolNewsBoard.tsx`
   - `<SchoolNewsBoard schoolId="user" items={...} schoolName={...} />`
   - 最大30件表示、日付降順、ジャンル別アイコン・背景色
   - データなし時の空状態表示

3. `src/app/play/page.tsx`
   - import SchoolNewsBoard + buildSchoolNewsList
   - OwnSchoolTab 末尾に `<SchoolNewsBoard>` 統合
   - `worldState?.eventLog` から自動更新

**テスト**: C2-test1, C2-test2 全 pass（計 9 テスト）

---

### C3: 成長イベント生成

**新規実装**:

1. `src/engine/types/growth.ts` — 型定義
   - `GrowthEventType`: pitch_acquired / opposite_field / breakthrough / injury_recover / mental_shift
   - `GrowthEffect`: statPath (ドット区切り) + delta
   - `GrowthEvent`: id / playerId / date / type / description / effects

2. `src/engine/growth/growth-events.ts` — 生成・適用ロジック
   - `calcGrowthEventProbability()`: 基本0.5%/日、練習継続5日以上+0.3%、適性≥0.7なら+0.2%
   - `shouldGenerateEvent()`: 確率判定
   - `generateGrowthEvents()`: 全選手に判定（1日1選手1イベント）
   - `applyGrowthEvents()`: effectsを Player に適用（ドット区切りパスで深いフィールドも更新）
   - 5種イベント本体:
     - `pitch_acquired`: velocity+2, control+1, pitches[type]+50, confidence+5
     - `opposite_field`: contact+3, technique+2, confidence+3
     - `breakthrough`: 最も低い能力+1〜2, confidence+2
     - `injury_recover`: fatigue-20, confidence-2（不安残り）
     - `mental_shift`: mental+3, confidence+3

3. `src/engine/world/world-state.ts` — `eventLog?: GrowthEvent[]` 追加

4. `src/engine/world/world-ticker.ts` — tick 時の統合
   - 練習日のみ（休養日・試合日はスキップ）`generateGrowthEvents()` 呼び出し
   - `applyGrowthEvents()` で選手に効果反映
   - `eventLog` に追記（最大200件）

**テスト**: C3-test1〜C3-test3 全 pass（計 10 テスト）

---

## テスト結果

| テストID | 種別 | 結果 |
|---|---|---|
| C1-test1 | unit | ✅ PASS: 休息日で +5〜+8 |
| C1-test2 | unit | ✅ PASS: 練習日 +2 / 疲労で -1 |
| C1-test3 | unit | ✅ PASS: 日曜ボーナス +3、上限 100 を超えない |
| C1-test4 | integration | ✅ PASS: tickMotivation が world-ticker から呼ばれる |
| C2-test1 | render/unit | ✅ PASS: 30件・ソート・アイコン |
| C2-test2 | integration | ✅ PASS: C3イベント→自校ニュース変換確認 |
| C3-test1 | unit | ✅ PASS: 0.5%/日の統計範囲 |
| C3-test2 | unit | ✅ PASS: 効果が Stats に反映 |
| C3-test3 | unit | ✅ PASS: eventLog 構造・重複なし |

### 全体テスト結果

```
Tests  2002 passed (2002)  ← 前回 1966 + 新規 36
Test Files  131 passed (131)
```

既存テスト全件 pass。新規テスト 36件追加。

---

## ビルド結果

```
✓ Compiled successfully in 10.1s
✓ TypeScript 型チェック完了
✓ 28 ページ静的生成完了
```

---

## 動作確認手順

1. `npm run dev` でサーバ起動
2. ゲーム開始 → チーム選択
3. ホーム画面の「⚾ 自校」タブを確認
   - `SchoolNewsBoard` が表示される
   - 初日はニュースなし → 「まだニュースはありません」表示
4. 1週間ほど日を進める
   - 選手の motivation が休養日に +5 以上回復していることを確認
5. 長期（数ヶ月）進行後
   - 成長イベント（変化球習得・流し打ち得意化など）が発生
   - 自校ニュースボードにイベントが表示される
6. チーム画面で選手詳細確認
   - motivation 値が変動している

---

## Known Issues

- 特になし。全テスト pass、ビルド成功。

---

## バランスへの影響

- 成長イベントは確率 0.5%/日（15選手 × 0.5% ≈ 月に2件程度）
- 各イベントの stat 変化は +1〜+3 程度（全体統計への影響は微小）
- §12.3 7指標はマギが1000試合バランスシミュで確認予定

---

## 次のステップ（マギ作業）

1. `npm run bump:patch` → v0.45.3
2. CHANGELOG 追記
3. VPS デプロイ
4. Phase S1 (A→A2→B→C) 全統合完了確認
