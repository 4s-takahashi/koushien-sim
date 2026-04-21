# Phase 11.5-B — チーム画面と練習メニュー管理

**作成日:** 2026-04-21
**対象ファイル:** `src/app/play/team/page.tsx`、`src/stores/world-store.ts`、`src/engine/types/calendar.ts`

---

## 1. 目的

- ホーム画面から移管された「チーム全体の練習メニュー設定」をチーム画面に統合する
- 怪我人・怪我注意者を「一括休養」できるボタンは既に実装済み（Issue #5）だが、UI 上の配置とフィードバックを改善する
- 翌日は自動で「いつもの練習メニュー」に戻る一時休養設定の仕組みは **既に実装済み**（`restOverride` フィールド、`individualPracticeOverrides` 機構）

---

## 2. 現状の実装状況確認

### 既実装（変更不要）
- `Player.restOverride?: { remainingDays: number; setOn: GameDate } | null`
  - 日次処理後に `remainingDays--` し、0 になったら null にリセット
  - つまり「翌日自動復帰」は既に動作している
- `HighSchool.individualPracticeOverrides?: Record<string, PracticeMenuId>`
  - 選手ごとの個別練習設定（空 = チーム共通）
- `restAllInjuredAndWarned()` ストアアクション
  - 疲労50以上・負傷中の選手全員に `restOverride: { remainingDays: 1 }` をセット

### 変更が必要な箇所
1. **チーム全体の練習メニュー設定UIをホームから移管**
2. **一括休養ボタンのUI改善**（現状はある、配置・説明文の改善）
3. **「今日の練習メニュー」の表示と変更フロー明確化**

---

## 3. チーム画面の新レイアウト

### 変更前（現状）

```
[ヘッダー: 学校名 / 都道府県 / 評判]
[ナビゲーション]
[チーム力サマリー（総合力・投手力・打撃力・守備力）]
[監督情報]
[スターティングラインナップ]
[選手一覧]
  ← 一括休養ボタン（既存）
  ← 個別練習選択ドロップダウン（既存）
```

### 変更後

```
[ヘッダー: 学校名 / 都道府県 / 評判]
[ナビゲーション]
[チーム力サマリー]
[監督情報]

[===== 今日の練習設定 ===== ]  ← NEW セクション（ホームから移管）
  チーム全体の練習メニュー: [ドロップダウン: 打撃・基礎 ▼]
  ┌─────────────────────────────────────────────────┐
  │ 🛌 けが人・けが注意を一括休養（1日）              │
  │    [田中 一郎] [鈴木 二郎] など 3名が対象         │
  │ ボタン: [🛌 対象者を一括休養する]                │
  └─────────────────────────────────────────────────┘

[スターティングラインナップ]
[選手一覧]
  ← 個別練習選択ドロップダウン（既存、維持）
  ← 一括休養ボタン（移動・改善済み）
```

---

## 4. ワイヤーフレーム（ASCII）

```
┌────────────────────────────────────────────────────────┐
│  桜葉高校 — チーム                   新潟 / 評判 B (45) │
├────────────────────────────────────────────────────────┤
│ ホーム  [チーム]  ニュース  スカウト  大会  試合結果  OB │
├────────────────────────────────────────────────────────┤
│  [チーム総合力: 382] [投手力: 75] [打撃力: 68] [守備: 62]│
├────────────────────────────────────────────────────────┤
│  監督: 山田太郎  通算 5勝3敗                            │
├────────────────────────────────────────────────────────┤
│  ─────────────────────────────────────────             │
│  📋 今日の練習設定                                      │
│  ─────────────────────────────────────────             │
│  チーム全体メニュー: [打撃・基礎練習       ▼]           │
│                                                        │
│  ⚠️ けが・要注意選手 (3名)                              │
│    🏥 田中 一郎  軽い肉離れ（残5日）                    │
│    ⚠️ 鈴木 二郎  疲労蓄積（要休養）                     │
│    ⚠️ 佐藤 三郎  疲労蓄積（要休養）                     │
│  [ 🛌 対象者を全員1日休養にする ]                       │
│  ※ 翌日は自動でいつもの練習に戻ります                   │
│  ─────────────────────────────────────────             │
│                                                        │
│  スターティングラインナップ                              │
│  ...                                                   │
│                                                        │
│  選手一覧（25名）  🛌 休養中 2名                        │
│  ┌────┬──────┬──┬────────┬────┬────┬────┬───┬──────┐│
│  │ #  │名前  │年│ポジション│総合│状態│やる気│打順│個別練習││
│  ├────┼──────┼──┼────────┼────┼────┼────┼───┼──────┤│
│  │ 1  │田中太│3 │ 投手   │ S  │負傷│🔥 72│  - │（共通）││
│  │ 2  │鈴木次│3 │ 一塁   │ A  │正常│   55│  3 │（共通）││
│  └────┴──────┴──┴────────┴────┴────┴────┴───┴──────┘│
└────────────────────────────────────────────────────────┘
```

---

## 5. 型定義・ストアアクションの変更

### 5.1 HighSchool 型の変更

```ts
// src/engine/world/world-state.ts に追加

interface HighSchool {
  // 既存フィールド...

  /**
   * チーム全体の練習メニュー（Phase 11.5-B）
   * ホームから移管。homeProjector で todayPracticeLabel を読む際もここを参照。
   */
  practiceMenu: PracticeMenuId;

  // 既存（維持）
  individualPracticeOverrides?: Record<string, PracticeMenuId>;
}
```

> **注意:** `practiceMenu` フィールドは既に存在している可能性が高い（`advanceDay(menuId)` の引数として使われていた）。
> もし既存の store に `selectedPracticeMenu` などの名前で保持していれば、名前を統一する。

### 5.2 ストアアクションの追加・変更

```ts
// src/stores/world-store.ts

interface WorldStore {
  // 既存アクション（維持）
  restAllInjuredAndWarned(): { count: number };
  setIndividualMenu(playerId: string, menuId: PracticeMenuId | null): void;
  clearAllIndividualMenus(): void;

  // 変更（Phase 11.5-A との連動）
  // advanceDay の menuId 引数を削除し、store の practiceMenu から自動取得
  advanceDay(): WorldDayResult | null;
  advanceWeek(): WorldDayResult[];

  // 追加（Phase 11.5-B）
  /** チーム全体の練習メニューを設定する */
  setTeamPracticeMenu(menuId: PracticeMenuId): void;
}
```

### 5.3 advanceDay() の変更

```ts
// 変更前
advanceDay(menuId: PracticeMenuId): WorldDayResult | null

// 変更後
advanceDay(): WorldDayResult | null
// 内部で worldState.playerSchool.practiceMenu を使う
```

---

## 6. 一括休養ロジック（既実装の確認・改善）

### 既実装の動作（変更なし）

```
restAllInjuredAndWarned():
  対象: fatigue >= 70 OR injury !== null の選手
  処理: player.restOverride = { remainingDays: 1, setOn: currentDate }

day-processor.ts の processDay() 内:
  restOverride がある選手は practiceMenu = 'rest' として扱う
  処理後: remainingDays-- → 0 になったら restOverride = null
  → 翌日は自動で元の pract習meに戻る ✓
```

### UI 改善（新規）

現状: ボタンを押すとトーストメッセージのみ
変更後:
1. ボタン押下前に「対象者リスト」を表示（怪我人/注意者の名前一覧）
2. 確認後に「〇名を1日休養にしました」のトーストを表示
3. 一括休養後、画面上の「休養中」バッジを即時反映（ストア更新 → 再描画）

---

## 7. 既存コードへの影響

| ファイル | 変更内容 |
|---|---|
| `src/app/play/team/page.tsx` | 「今日の練習設定」セクション追加（チーム全体メニューセレクト）、一括休養UIの配置改善 |
| `src/app/play/page.tsx` | 練習メニューセレクトボックスを削除、`advanceDay()` の引数を削除 |
| `src/stores/world-store.ts` | `setTeamPracticeMenu()` アクション追加、`advanceDay()` の引数変更 |
| `src/engine/world/world-state.ts` | `HighSchool.practiceMenu` フィールドの確認・追加 |
| `src/engine/calendar/day-processor.ts` | `advanceDay` の menuId 引数をなくし、school.practiceMenu から参照 |
| `tests/` | `advanceDay()` を呼ぶテストの引数更新 |

---

## 8. リスク・トレードオフ

- **advanceDay() の引数変更**: 既存テストや他の呼び出し箇所への影響が大きい。移行期間中は `advanceDay(menuId?: PracticeMenuId)` とオプショナルにして、引数が渡された場合はそちらを優先する後方互換モードで対応
- **初期データ**: 旧セーブデータには `practiceMenu` フィールドがない可能性。`hydrate()` で `practiceMenu ?? 'batting_basic'` のデフォルト値を設定する

---

## 9. 段階実装案

### MVP（Phase 11.5-B, 1日）
1. `setTeamPracticeMenu()` ストアアクション追加
2. チーム画面に「チーム全体メニュー」セレクトを追加（ホームの既存コードをコピー移動）
3. ホーム画面の練習メニューセレクトを削除
4. `advanceDay()` を引数なし化（store 参照）

### 拡張（翌日）
5. 一括休養セクションを「今日の練習設定」の中に組み込み、対象者リストも表示
6. 「まとめて設定:全員休養」「まとめてクリア」等のヘルパーボタン追加
