# Phase 6.0 実装レポート

## 概要

Phase 6.0 では以下の4つの主要機能を実装しました：

1. **セーブ/ロードシステム**（localStorage ベース）
2. **トーナメント表 UI**（48校シングルエリミネーション）
3. **試合表示強化**（イニング別打席フロー・ハイライト）
4. **デプロイ準備**（`next build` 成功・`vercel.json` 作成）

---

## 1. セーブ/ロードシステム

### 実装ファイル

| ファイル | 役割 |
|---|---|
| `src/engine/save/world-serializer.ts` | WorldState の JSON シリアライズ/デシリアライズ |
| `src/engine/save/world-save-manager.ts` | localStorage セーブ管理（スロット/自動保存） |
| `src/app/save/SaveLoadPanel.tsx` | セーブ/ロード選択 UI（モーダル） |
| `src/app/save/SaveLoadPanel.module.css` | セーブパネルスタイル |

### セーブスロット構成

| スロットID | 種別 | 上書き保護 |
|---|---|---|
| `world_slot_1` | 手動スロット 1 | なし |
| `world_slot_2` | 手動スロット 2 | なし |
| `world_slot_3` | 手動スロット 3 | なし |
| `world_auto_year` | 年度終了自動保存 | あり |
| `world_auto_monthly` | 月次自動保存 | なし（ローテーション） |
| `world_pre_tournament` | 大会前自動保存 | なし |

### 技術的課題と解決策

**Map 型のシリアライズ問題**

`WorldState` には `Map<string, ScoutReport>` や `Map<string, PersonEntry>` など複数の Map フィールドが含まれ、`JSON.stringify` では直列化されない。

解決: `world-serializer.ts` で `mapToObj()` / `objToMap()` ヘルパーを実装し、シリアライズ/デシリアライズ時に変換。型キャスト（`as ScoutState['scoutReports']` 等）でコンパイルエラーも解消。

**SSR 安全性**

Next.js App Router では `typeof window` ガードを使用し、サーバーサイドで localStorage にアクセスしないよう実装。

**チェックサム検証**

Web Crypto API（SHA-256）でセーブデータの整合性を検証。ブラウザ環境外ではフォールバックハッシュを使用。

---

## 2. トーナメント表 UI

### 実装ファイル

| ファイル | 役割 |
|---|---|
| `src/engine/world/tournament-bracket.ts` | トーナメントブラケットデータ構造・シミュレーション |
| `src/ui/projectors/tournamentProjector.ts` | WorldState → TournamentViewState 射影 |
| `src/app/tournament/page.tsx` | トーナメント表示ページ |
| `src/app/tournament/page.module.css` | トーナメントスタイル |

### 48校トーナメント構造

```
1回戦: 32校 → 16試合（下位32校が対戦）
2回戦: 16勝者 + 16シード校 = 32校 → 16試合
3回戦: 16 → 8試合 (ベスト8)
4回戦:  8 → 4試合 (準々決勝)
5回戦:  4 → 2試合 (準決勝)
6回戦:  2 → 1試合 (決勝)
```

- reputation 上位16校がシード（2回戦から参加）
- 下位32校が1回戦（不戦勝なし）

### 勝者伝播ロジック

1回戦→2回戦は特殊ルール: 1回戦勝者は 2回戦の `awaySchoolId` に入り、シード校が `homeSchoolId` として事前配置済み。2回戦以降は標準の `floor(i/2)` 伝播。

### ViewState 型定義

```typescript
TournamentMatchView {
  isPlayerSchoolMatch: boolean
  isPlayerSchoolHome: boolean
  isPlayerSchoolAway: boolean
  isUpset: boolean
  isCompleted: boolean
  winnerName: string | null
  // ...
}

TournamentBracketView {
  typeName: '夏の大会' | '秋の大会' | '甲子園'
  rounds: TournamentRoundView[]
  championName: string | null
  playerSchoolBestRound: number
  isPlayerSchoolWinner: boolean
}
```

---

## 3. 試合表示強化

### 実装変更

**`WorldDayResult` 型拡張**（`src/engine/world/world-ticker.ts`）:

```typescript
playerMatchInnings?: import('../match/types').InningResult[] | null;
```

**`resultsProjector.ts` 更新**:
- `playerMatchInnings` が存在する場合、打席フロー（`atBatFlow`）を生成
- ハイライト生成: `home_run` → 💥, `strikeout` (3者連続) → 🔥

### 打席フロー構造

```typescript
AtBatFlowEntry {
  inning: number
  half: 'top' | 'bottom'
  outcomeType: string
  rbiCount: number
  scoreAfter: { home: number; away: number }
}
```

---

## 4. デプロイ準備

### 作成/変更ファイル

| ファイル | 内容 |
|---|---|
| `vercel.json` | Vercel デプロイ設定 |
| `tsconfig.build.json` | ビルド専用 tsconfig（テスト・スクリプト除外） |
| `next.config.ts` | `typescript.tsconfigPath: 'tsconfig.build.json'` |

### ビルド結果

```
▲ Next.js 16.2.3 (Turbopack)
✓ Compiled successfully in 5.6s
✓ TypeScript type check passed
✓ 9 static pages generated
```

**静的ページ**: `/`, `/ob`, `/results`, `/scout`, `/team`, `/tournament`, `/_not-found`

**動的ページ**: `/team/[playerId]`

---

## テスト結果

| テストスイート | テスト数 | 結果 |
|---|---|---|
| `tests/engine/save/phase6/world-save.test.ts` | 14 | ✅ 全件通過 |
| `tests/engine/world/phase6/tournament-bracket.test.ts` | 17 | ✅ 全件通過 |
| `tests/ui/projectors/phase6-results.test.ts` | 6 | ✅ 全件通過 |
| **全テスト合計** | **489** | **✅ 全件通過** |

（Phase 5 以前の 446 テスト + Phase 6 新規 43 テスト）

---

## WorldState への追加フィールド

```typescript
// src/engine/world/world-state.ts
interface WorldState {
  // ...既存フィールド...
  activeTournament?: TournamentBracket | null;   // 進行中のトーナメント
  tournamentHistory?: TournamentBracket[];         // 過去大会履歴
}
```

既存テストとの後方互換性のため、両フィールドをオプショナル（`?`）として定義。

---

## セーブデータ互換性

セーブデータバージョン: `6.0.0`

`validateWorldSaveData()` で以下のフィールドを検証:
- `version`: string
- `seed`: string
- `playerSchoolId`: string
- `currentDate`: object
- `schools`: array (length > 0)
- `manager`: object
- `seasonState`: object
