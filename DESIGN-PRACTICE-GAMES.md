# 練習試合・紅白戦 システム設計書

**作成日**: 2026-04-17
**担当**: Claude Sonnet
**対象フェーズ**: Practice Game System (Phase 5-B)

---

## 1. 概要

### 目的
大会期間外（spring_practice / post_summer / off_season / pre_season）に、
プレイヤーが能動的に「練習試合」または「紅白戦」をスケジュールし、
選手の実戦経験を積ませる機能を追加する。

### 試合種別
| 種別 | 英名 | 相手 | 疲労 | 成長ボーナス |
|------|------|------|------|------------|
| 練習試合 | `scrimmage` | 他校（AIチーム） | 中 | 中 |
| 紅白戦 | `intra_squad` | 自校2チーム分割 | 小 | 小 |

### 基本ルール
- 大会期間中（summer_tournament / autumn_tournament / koshien）は実施不可
- 1日1試合まで
- 予約は最大7日先まで
- 練習試合の相手は同一都道府県 + 近隣評判の学校から自動提案

---

## 2. データ型設計

### `src/engine/types/practice-game.ts`

```typescript
/** 練習試合種別 */
type PracticeGameType = 'scrimmage' | 'intra_squad';

/** 予約済み練習試合 */
interface ScheduledPracticeGame {
  id: string;
  type: PracticeGameType;
  scheduledDate: GameDate;
  opponentSchoolId: string | null;  // intra_squad は null
}

/** 練習試合結果 */
interface PracticeGameRecord {
  id: string;
  type: PracticeGameType;
  date: GameDate;
  opponentSchoolId: string | null;
  opponentSchoolName: string | null;
  result: 'win' | 'loss' | 'draw';
  finalScore: { player: number; opponent: number };
  highlights: string[];
  mvpPlayerId: string | null;
  fatigueDelta: number;  // 疲労増分（0〜15）
}
```

### `WorldState` への追加フィールド
```typescript
scheduledPracticeGames?: ScheduledPracticeGame[];
practiceGameHistory?: PracticeGameRecord[];
```

---

## 3. エンジン設計

### `src/engine/world/practice-game.ts`

#### `schedulePracticeMatch(world, opponentSchoolId, date): WorldState`
- バリデーション: 大会期間外か、重複予約なし、7日先以内
- `scheduledPracticeGames` に追加して返す

#### `scheduleIntraSquad(world, date): WorldState`
- opponentSchoolId = null で追加

#### `executePracticeGame(scheduled, playerSchool, opponentSchool | null, rng): PracticeGameRecord`
- quick-game を使って試合シミュレーション
- 疲労増分を計算して返す

#### `suggestOpponents(world, maxCount): HighSchool[]`
- 同都道府県 + 評判差 ±30 以内の学校を最大5校返す

---

## 4. world-ticker 統合

`advanceWorldDay` 内で、新日付が `scheduledPracticeGames` にマッチする場合に
`executePracticeGame` を呼び出し、`WorldDayResult` に `practiceGameResult` フィールドとして返す。

実行後は `scheduledPracticeGames` から削除し、`practiceGameHistory` に追加。

---

## 5. UI 設計

### `/play/page.tsx` の変更
クイックナビに「練習試合の設定」リンクを追加。

### `/play/practice/page.tsx`（新規）
- 現在の予約一覧
- 「練習試合を申込む」フォーム（相手選択 + 日付）
- 「紅白戦を予約する」ボタン（日付のみ）
- 対戦相手候補表示

### `src/ui/projectors/practiceProjector.ts`（新規）
`projectPracticeView(world): PracticeViewState`

---

## 6. テスト計画

`tests/engine/world/practice-game.test.ts`:
1. `schedulePracticeMatch` — 通常予約、大会期間中の拒否、重複の拒否
2. `scheduleIntraSquad` — 予約成功
3. `executePracticeGame` — 結果生成（win/loss/draw）、疲労増分
4. `suggestOpponents` — 5校以内、評判差フィルタ
5. world-ticker 統合 — 予約日当日に試合が実行される、WorldDayResult に結果が入る
