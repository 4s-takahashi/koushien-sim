# Phase 11.5-A — ホーム画面再設計

**作成日:** 2026-04-21
**対象ファイル:** `src/app/play/page.tsx`、`src/ui/projectors/homeProjector.ts`、`src/ui/projectors/view-state-types.ts`

---

## 1. 目的

現状のホーム画面は「練習メニューを選んで1日進む」操作画面に過ぎない。
これを**「今日のチームで何が起きているか」を伝える情報ハブ**に変える。

- 自校のニュース・コンディション状況を一覧表示
- 他校ニュース・評価者情報をタブで切替表示
- 怪我人・怪我注意者をここで把握 → 休養判断へ誘導
- 練習メニューの決定はチーム画面に移管（ホームからは削除）

---

## 2. 現状 vs 変更後

### 現状のホーム画面構造

```
[ナビゲーション]
[進行インジケーター（日付・大会情報）]

[今日やること] ← 練習メニューセレクトボックス + 「1日進む」ボタン ← ここが主役
[チーム概要]
[注目選手]
[チーム状況（怪我人・好調者）]
[OB情報]
[次の予定]
[スカウト状況]
[最近のニュース]
[クイックナビ]
```

### 変更後のホーム画面構造

```
[ナビゲーション]
[進行インジケーター（日付・大会情報・次の試合）]

[緊急バナー: 怪我人/怪我注意者 ← 赤/オレンジ強調、チーム画面への誘導リンク付き]
[試合待機バナー / 中断試合バナー（既存ロジック維持）]

[タブ: 自校 | 他校 | 評価者]

--- 「自校」タブ ---
[今日のチーム状況サマリー]
  - コンディション良好/注意/危険の人数
  - チーム全体のやる気指数
[怪我人・怪我注意者リスト（名前・状態・残日数）]
[最近のチームニュース（5件）]
[今日やること: タスクタイプ表示 + 「1日進む」「1週間進む」ボタン]
  ← 練習メニュー選択はここには「なし」（チーム画面へ委譲）

--- 「他校」タブ ---
[他校ニュース（直近7日・上位8件）]
[注目校ランキング（評判値順 5校）]

--- 「評価者」タブ ---
[今週の評価者注目ランキング（評価者が注目する選手 Top5）]
[最新の評価コメント（架空テキスト）]
（Phase 11.5-C 評価者システム実装後に詳細化）
```

---

## 3. ワイヤーフレーム（ASCII）

```
┌────────────────────────────────────────────────────┐
│ ホーム  チーム  ニュース  スカウト  大会  試合結果  OB │ ← nav
├────────────────────────────────────────────────────┤
│  令和8年 4月21日（火）  春季練習  次：夏大会まで89日  │ ← progress
│  チーム総合力: 382                                  │
├────────────────────────────────────────────────────┤
│ 🏥 負傷中 2名 / ⚠️ けが注意 3名                     │ ← 緊急バナー
│ → チーム画面で一括休養する                          │   （該当者がいる場合のみ）
├────────────────────────────────────────────────────┤
│  [ 自校 ]  [ 他校 ]  [ 評価者 ]                     │ ← タブ
├────────────────────────────────────────────────────┤
│                                                    │
│  チーム状況                                         │
│  ┌──────────┬──────────┬──────────┐              │
│  │ 良好 18  │ 注意 3   │ 危険 2   │              │
│  └──────────┴──────────┴──────────┘              │
│  全体やる気: ███████░░░ 65                          │
│                                                    │
│  ⚠️ けが注意・負傷中                                 │
│  ┌──────────────────────────────────┐             │
│  │ 🏥 田中 一郎  軽い肉離れ（残5日）   │             │
│  │ ⚠️ 鈴木 二郎  疲労蓄積（要休養）    │             │
│  │ ⚠️ 佐藤 三郎  疲労蓄積（要休養）    │             │
│  │            チーム画面で一括休養 →  │             │
│  └──────────────────────────────────┘             │
│                                                    │
│  最近の出来事                                        │
│  ┌──────────────────────────────────┐             │
│  │ ⭐ 中村 太郎が守備練習でブレイク！   │  high       │
│  │ 📈 練習試合で打率.320達成           │  medium     │
│  │ 😢 木村 翔が疲労でやる気低下        │  low        │
│  └──────────────────────────────────┘             │
│                                                    │
│  今日やること                                        │
│  ┌──────────────────────────────────┐             │
│  │ 🏋 練習日                          │             │
│  │ 今日の練習: 打撃・基礎              │ ← 読み取り専用
│  │ （変更はチーム画面から）            │             │
│  │                                   │             │
│  │ [ ▶ 1日進む ]  [ ▶▶ 1週間進む ]   │             │
│  └──────────────────────────────────┘             │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## 4. 型定義

```ts
// src/ui/projectors/view-state-types.ts に追加

/** 改訂版 HomeViewState（Phase 11.5-A） */
export interface HomeViewState {
  // --- 既存フィールド（維持）---
  date: DateDisplay;
  seasonPhaseLabel: string;
  tournament: TournamentStatus | null;
  tournamentStart: { name: string; daysAway: number; date: string } | null;
  isInTournamentSeason: boolean;
  team: TeamSummary;
  featuredPlayers: FeaturedPlayer[];
  upcomingSchedule: ScheduleItem[];
  recentNews: NewsItem[];
  scoutBudgetRemaining: number;
  scoutBudgetTotal: number;
  recentGraduates: GraduateItem[];
  todayTask: TodayTask;

  // --- 新規フィールド（Phase 11.5-A）---
  /** チームコンディションサマリー */
  teamConditionSummary: TeamConditionSummary;
  /** 今日の練習メニュー（読み取り専用、変更はチーム画面から） */
  todayPracticeLabel: string;
  /** 他校ニュース */
  otherSchoolNews: NewsItem[];
  /** 評価者ハイライト（簡易版、Phase 11.5-C で拡充） */
  evaluatorHighlights: EvaluatorHighlight[];
}

export interface TeamConditionSummary {
  /** コンディション良好の選手数 */
  goodCount: number;
  /** コンディション注意の選手数（疲労50〜70） */
  cautionCount: number;
  /** コンディション危険の選手数（疲労70+、または怪我注意） */
  dangerCount: number;
  /** チーム全体の平均モチベーション */
  avgMotivation: number;
  /** 怪我人詳細（ホーム表示用） */
  injuredPlayers: InjuredPlayerBrief[];
  /** 怪我注意者詳細 */
  warningPlayers: InjuredPlayerBrief[];
}

export interface InjuredPlayerBrief {
  id: string;
  name: string;
  /** 表示用状態テキスト */
  statusText: string;
  /** 重要度: 'critical' | 'warning' */
  severity: 'critical' | 'warning';
}

export interface EvaluatorHighlight {
  evaluatorName: string;
  evaluatorType: 'media' | 'critic' | 'scout';
  playerName: string;
  playerId: string;
  /** 注目度ランク */
  rank: EvaluatorRank;
  /** 短評（1〜2文） */
  comment: string;
}

export type EvaluatorRank = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
```

---

## 5. データフロー

```
WorldState
  ├─ playerSchool.players          → teamConditionSummary を計算
  ├─ worldState.practiceMenu       → todayPracticeLabel
  ├─ worldState.newsLog            → recentNews（自校）、otherSchoolNews（他校）
  └─ worldState.evaluators[]       → evaluatorHighlights（Phase 11.5-C 実装後）
       ↓
  homeProjector.ts（既存）を拡張
       ↓
  HomeViewState
       ↓
  src/app/play/page.tsx（UI）
```

### homeProjector.ts への変更

```ts
// 既存の projectHome() 関数に以下を追加

function buildTeamConditionSummary(
  players: Player[],
): TeamConditionSummary {
  const injured = players.filter(p => p.condition.injury !== null);
  const warning = players.filter(p =>
    !p.condition.injury && p.condition.fatigue >= 70
  );
  const caution = players.filter(p =>
    !p.condition.injury && p.condition.fatigue >= 50 && p.condition.fatigue < 70
  );
  const good = players.filter(p =>
    !p.condition.injury && p.condition.fatigue < 50
  );

  const avgMotivation = players.length > 0
    ? Math.round(players.reduce((sum, p) => sum + getMotivation(p), 0) / players.length)
    : 50;

  return {
    goodCount: good.length,
    cautionCount: caution.length,
    dangerCount: injured.length + warning.length,
    avgMotivation,
    injuredPlayers: injured.map(p => ({
      id: p.id,
      name: `${p.lastName} ${p.firstName}`,
      statusText: p.condition.injury
        ? `${p.condition.injury.type}（残${p.condition.injury.remainingDays}日）`
        : '負傷中',
      severity: 'critical' as const,
    })),
    warningPlayers: warning.map(p => ({
      id: p.id,
      name: `${p.lastName} ${p.firstName}`,
      statusText: '疲労蓄積（要休養）',
      severity: 'warning' as const,
    })),
  };
}
```

---

## 6. UI 変更点

### 削除するもの（ホームから移管）

- 練習メニューセレクトボックス（`<select>` で練習メニューを選ぶUI）
- ※ 「1日進む」「1週間進む」ボタン自体は残す（練習メニューは当日設定をそのまま使う）
- ※ 練習メニュー変更機能はチーム画面に全面移管

### 追加するもの

- タブコンポーネント（自校/他校/評価者）
- TeamConditionSummary カード（3グリッド: 良好/注意/危険）
- 平均やる気インジケーター（プログレスバー）
- 怪我人/怪我注意者リスト（コンパクト表示）
- 「1日進む」際の確認フロー改善（怪我注意者がいる場合は「〇人が要休養です。このまま進めますか？」）

### 変更するもの

- 「今日やること」カードを読み取り専用に変更
  - 練習メニュー名は表示するが、変更不可（リンクでチーム画面へ誘導）

---

## 7. 既存コードへの影響

| ファイル | 変更内容 |
|---|---|
| `src/app/play/page.tsx` | タブUI追加、練習メニューselect削除、TeamConditionSummaryカード追加 |
| `src/ui/projectors/homeProjector.ts` | `buildTeamConditionSummary()` 追加、`otherSchoolNews` 追加 |
| `src/ui/projectors/view-state-types.ts` | `TeamConditionSummary`、`InjuredPlayerBrief`、`EvaluatorHighlight` 型追加 |
| `src/stores/world-store.ts` | `advanceDay(menuId)` の `menuId` 引数を optional にする（既存のチーム設定から取得） |

---

## 8. リスク・トレードオフ

- **「練習メニューをホームで選べない」という操作変更は大きなUX変更**。移行期間中のユーザーが戸惑う可能性がある。緩和策: ホームの「今日やること」に「練習メニューを変更する → [チーム画面]」のリンクを目立たせる
- **advanceDay() のメニュー引数削除**: 現状 `advanceDay(menuId)` となっているが、メニューは store 側の `playerSchool.practiceMenu` から取得する方式に変える。既存テスト（`advanceDay` を呼び出すテスト）への影響を確認すること

---

## 9. 段階実装案

### MVP（Phase 11.5-A, 1〜2日）
1. タブ UI の追加（自校タブのみ機能する状態でOK）
2. `TeamConditionSummary` を `homeProjector` で生成し、怪我人/注意者リスト表示
3. 「今日やること」カードから練習メニュー選択を削除し、読み取り専用化
4. `advanceDay()` を引数なし or store参照に変更

### 拡張（Phase 11.5-A 後半）
5. 「他校」タブの実装（他校ニュースの抽出ロジック）
6. 「評価者」タブのプレースホルダー（Phase 11.5-C 実装後に詳細化）
7. 1日進む際の「怪我注意者がいます」確認ダイアログ
