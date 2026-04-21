# Phase 11.5 — 実装計画・工数・サブフェーズ分割

**作成日:** 2026-04-21

---

## 1. サブフェーズ一覧

| サブフェーズ | 内容 | 工数目安 | 依存 |
|---|---|---|---|
| 11.5-A | ホーム画面再設計 | 1〜2日 | なし |
| 11.5-B | チーム画面・練習メニュー改善 | 1日 | 11.5-A |
| 11.5-C | 評価者システム基盤 | 2〜3日 | なし（並列可） |
| 11.5-D | 選手評価言葉化MVP | 2日 | なし（並列可） |
| 11.5-E | 選手プロフィール拡充 | 2〜3日 | 11.5-D |
| 11.5-F | 対戦相手スカウティング言葉化 | 2日 | 11.5-D |
| 11.5-G | マネージャー管理 | 2〜3日 | 11.5-F |

**合計目安: 12〜17日**（並列進行なら7〜10日）

---

## 2. 推奨実装順序

### Week 1（並列3ライン）

```
Day 1-2: [Line 1] 11.5-A ホーム画面再設計
          [Line 2] 11.5-C 評価者システム基盤（型定義・24人データ・ランク計算）
          [Line 3] 11.5-D 言葉化ライブラリ（ability-narrative.ts 作成）

Day 3:   [Line 1] 11.5-B チーム画面練習メニュー統合（11.5-A完了後）
          [Line 2] 11.5-C 続き（WorldState統合・月次バッチ）
          [Line 3] 11.5-D 続き（StatRowView拡張・選手詳細画面反映）
```

### Week 2（順次）

```
Day 4-5: 11.5-E 選手プロフィール拡充
           （PracticeHistory, EventHistory, 悩み生成）

Day 6-7: 11.5-F 対戦相手スカウティング言葉化
           （ManagerStaff型、ScoutingReport生成、他校選手画面更新）

Day 8-9: 11.5-G マネージャー管理
           （/play/staff画面、経験値・ランクアップ）

Day 10:  全体動作確認・小バグ修正
```

---

## 3. サブフェーズ別詳細

### 11.5-A: ホーム画面再設計

**新規ファイル:** なし（既存ファイルの変更のみ）

**変更ファイル:**
```
src/app/play/page.tsx                    [大規模変更]
src/ui/projectors/homeProjector.ts       [中規模変更]
src/ui/projectors/view-state-types.ts    [型追加]
src/stores/world-store.ts                [advanceDay引数変更]
```

**テスト対象:**
- `tests/ui/projectors/homeProjector.test.ts`（新規作成）
- `tests/stores/world-store.test.ts`（advanceDay の変更）

**完了条件:**
- [ ] ホーム画面にタブ（自校/他校/評価者）が表示される
- [ ] 自校タブで怪我人・注意者リストが表示される
- [ ] 「今日やること」から練習メニューセレクトが削除されている
- [ ] 「1日進む」が引数なしで動作する（store の practiceMenu を使用）
- [ ] 既存テスト全通過

---

### 11.5-B: チーム画面・練習メニュー改善

**変更ファイル:**
```
src/app/play/team/page.tsx               [中規模変更]
src/stores/world-store.ts                [setTeamPracticeMenu追加]
```

**完了条件:**
- [ ] チーム画面に「今日の練習設定」セクションが表示される
- [ ] チーム全体メニューのドロップダウンが機能する
- [ ] 一括休養UIの改善（対象者リスト表示）
- [ ] 既存テスト全通過

---

### 11.5-C: 評価者システム基盤

**新規ファイル:**
```
src/engine/types/evaluator.ts
src/engine/evaluator/evaluator-registry.ts
src/engine/evaluator/rank-calculator.ts
tests/engine/evaluator/rank-calculator.test.ts
```

**変更ファイル:**
```
src/engine/world/world-state.ts          [evaluatorState追加]
src/engine/world/hydrate.ts             [初期化]
src/engine/calendar/day-processor.ts    [月次バッチ]
src/ui/projectors/homeProjector.ts      [evaluatorHighlights]
```

**テスト仕様:**
```ts
// rank-calculator.test.ts
describe('calcEvaluatorRank', () => {
  it('速球派投手をvocity特化評価者が高評価する', () => {
    const fastPitcher = mockPlayer({ pitching: { velocity: 90 } });
    const evaluator = INITIAL_EVALUATORS.find(e => e.id === 'scout_fujiwara')!;
    const rank = calcEvaluatorRank(evaluator, fastPitcher);
    expect(['SS', 'S', 'A']).toContain(rank);
  });

  it('辛口評価者（柴田）はSSSを出しにくい', () => {
    const topPlayer = mockPlayer({ overall: 99 });
    const shibata = INITIAL_EVALUATORS.find(e => e.id === 'critic_shibata')!;
    const rank = calcEvaluatorRank(shibata, topPlayer);
    expect(rank).not.toBe('SSS');
  });
});
```

**完了条件:**
- [ ] 24人の評価者データが登録されている
- [ ] `calcEvaluatorRank()` のunit testが全通過
- [ ] WorldState に evaluatorState が含まれる
- [ ] 旧セーブデータを読み込んでも evaluatorState がデフォルト初期化される
- [ ] ホームの「評価者」タブに評価者ハイライトが表示される

---

### 11.5-D: 選手評価言葉化MVP

**新規ファイル:**
```
src/ui/labels/ability-narrative.ts
tests/ui/labels/ability-narrative.test.ts
```

**変更ファイル:**
```
src/ui/projectors/view-state-types.ts    [StatRowView.narrative追加]
src/ui/projectors/playerProjector.ts    [narrateAbility呼び出し]
src/app/play/team/[playerId]/page.tsx   [UI: 言葉表示]
```

**テスト仕様:**
```ts
// ability-narrative.test.ts
describe('narrateAbility', () => {
  it('power 85 → ランク7の言葉を返す', () => {
    const result = narrateAbility('power', 85, 'test-seed');
    expect(result).toBeTruthy();
    // ランク7のいずれかが返ることを確認
    const rank7words = ABILITY_NARRATIVES.power[6];
    expect(rank7words).toContain(result);
  });

  it('同じseedなら同じ言葉が返る（決定論的）', () => {
    const r1 = narrateAbility('contact', 72, 'player-abc');
    const r2 = narrateAbility('contact', 72, 'player-abc');
    expect(r1).toBe(r2);
  });

  it('異なるseedなら異なる言葉になりうる', () => {
    const results = new Set(
      ['a', 'b', 'c', 'd', 'e'].map(seed => narrateAbility('power', 50, seed))
    );
    // 候補が複数あれば少なくとも2種類は出る
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  it('全13能力について ランク1〜7 の言葉が存在する', () => {
    const keys: AbilityNarrativeKey[] = [
      'stamina', 'speed', 'armStrength', 'fielding', 'focus', 'mental',
      'contact', 'power', 'eye', 'technique',
      'velocity', 'control', 'pitchStamina',
    ];
    for (const key of keys) {
      for (let val = 0; val <= 100; val += 17) {
        expect(() => narrateAbility(key, val, 'test')).not.toThrow();
        expect(narrateAbility(key, val, 'test')).toBeTruthy();
      }
    }
  });
});
```

**完了条件:**
- [ ] 全13能力 × 7段階 × 2候補以上（最低182パターン）の言葉プールが完成
- [ ] unit testが全通過
- [ ] 自校選手詳細画面で言葉が表示される
- [ ] 数値バーと言葉が併存する（段階的移行）

---

### 11.5-E: 選手プロフィール拡充

**新規ファイル:**
```
src/engine/types/player-history.ts
tests/ui/projectors/playerConcern.test.ts
```

**変更ファイル:**
```
src/engine/types/player.ts               [eventHistory, practiceHistory追加]
src/engine/world/hydrate.ts             [デフォルト空配列]
src/engine/calendar/day-processor.ts    [practiceHistory記録]
src/engine/match/result.ts              [イベント記録（試合活躍）]
src/ui/projectors/playerProjector.ts    [concern, historyの生成]
src/ui/projectors/view-state-types.ts   [ConcernView, PracticeHistoryView型]
src/app/play/team/[playerId]/page.tsx   [UI: 悩み・練習履歴・イベント]
```

**完了条件:**
- [ ] 選手詳細画面に「今の気持ち」が表示される（動的生成）
- [ ] 直近14日の練習履歴が表示される
- [ ] 重要イベント（試合活躍・怪我・成長）がイベント履歴に記録される
- [ ] 旧セーブデータでは空の状態から新規記録が始まる（エラーなし）

---

### 11.5-F: 対戦相手スカウティング言葉化

**新規ファイル:**
```
src/engine/types/manager-staff.ts
src/engine/scouting/manager-scouting.ts
src/ui/labels/scouting-narrative.ts
tests/engine/scouting/manager-scouting.test.ts
```

**変更ファイル:**
```
src/engine/world/world-state.ts          [managerStaff追加]
src/engine/world/hydrate.ts             [デフォルトマネージャー]
src/app/play/player/[playerId]/page.tsx [スカウティングレポート言葉化]
```

**テスト仕様:**
```ts
// manager-scouting.test.ts
describe('generateScoutingReport', () => {
  it('Fランクマネージャーは1項目しか返さない', () => {
    const report = generateScoutingReport(mockPitcher(), 'F', 'seed1');
    expect(report.evaluations.length).toBe(1);
  });

  it('Sランクマネージャーは6〜7項目返す', () => {
    const report = generateScoutingReport(mockPitcher(), 'S', 'seed1');
    expect(report.evaluations.length).toBeGreaterThanOrEqual(6);
  });

  it('同じseedなら同じ評価（決定論的）', () => {
    const r1 = generateScoutingReport(mockPitcher(), 'C', 'fixed-seed');
    const r2 = generateScoutingReport(mockPitcher(), 'C', 'fixed-seed');
    expect(r1.evaluations.map(e => e.text)).toEqual(r2.evaluations.map(e => e.text));
  });
});
```

**完了条件:**
- [ ] 他校選手画面でマネージャー偵察レポートが表示される
- [ ] マネージャーランクCの場合、3〜4項目が表示される
- [ ] ランク表示インジケーターが表示される
- [ ] unit testが全通過

---

### 11.5-G: マネージャー管理

**新規ファイル:**
```
src/app/play/staff/page.tsx
src/app/play/staff/page.module.css
```

**変更ファイル:**
```
src/engine/types/manager-staff.ts        [experience, traits追加]
src/engine/calendar/day-processor.ts    [経験値加算]
src/stores/world-store.ts                [levelUpManager]
src/app/play/team/page.tsx              [スタッフへのリンク追加]
```

**完了条件:**
- [ ] `/play/staff` ページが表示される
- [ ] マネージャーの経験値・ランクが表示される
- [ ] 試合日に経験値が加算される
- [ ] 経験値100でランクアップのUI通知がある
- [ ] ナビゲーションに「スタッフ」リンクが追加される

---

## 4. テスト戦略

### 既存テスト（826件）の維持
- **全サブフェーズで `npm test -- --run` が通過すること**を完了条件に含める
- `advanceDay()` の引数変更（11.5-A/B）が最もリスクが高い → 最初にテストを更新してから実装

### 新規テスト
```
tests/engine/evaluator/rank-calculator.test.ts  （11.5-C）
tests/ui/labels/ability-narrative.test.ts       （11.5-D）
tests/engine/scouting/manager-scouting.test.ts  （11.5-F）
```

---

## 5. 既存 Phase 11-B/C への影響

### Phase 11-B（データ・記録）への影響

| 11.5 の変更 | 11-B への影響 |
|---|---|
| 評価者ランクシステム | 「評価者が注目した選手」を年度別ランキングに追加できる（B1の拡張）|
| イベント履歴 | 殿堂入り条件に「評価者にSSSを付けられた」を追加できる（B2の拡張）|
| 練習履歴 | 試合ハイライト（B3）にトレーニング背景を加えられる |

**11-B への変更は不要（11.5 の型設計が 11-B の拡張を見越した設計になっている）**

### Phase 11-C（甲子園）への影響

| 11.5 の変更 | 11-C への影響 |
|---|---|
| 評価者システム | 甲子園出場で評価者の注目度が大幅上昇するイベントを追加できる |
| マネージャー経験値 | 甲子園出場校の試合観戦で経験値ボーナス |
| 選手心境 | 甲子園前の「pre_tournament」心境テンプレートが自然に機能する |

**11-C への変更は不要。11.5 の設計が 11-C の拡張を自然にサポートする。**

---

## 6. バージョン計画

| フェーズ | バージョン | 変更種別 |
|---|---|---|
| 11.5-A + 11.5-B | v0.19.0 | minor（UX大変更） |
| 11.5-C + 11.5-D | v0.19.1 | minor（新機能）|
| 11.5-E | v0.19.2 | minor（新機能）|
| 11.5-F + 11.5-G | v0.19.3 | minor（新機能）|

---

## 7. 実装時の注意事項

### セーブデータ互換性

すべての新規フィールドは `optional` で追加する。

```ts
// NG: 既存セーブが壊れる
interface Player { eventHistory: PlayerEvent[]; }

// OK: optional + hydrateで初期化
interface Player { eventHistory?: PlayerEvent[]; }
// hydrate.ts で: eventHistory: state.eventHistory ?? []
```

### advanceDay() の引数変更（最重要・要注意）

`advanceDay(menuId)` → `advanceDay()` の変更は影響範囲が広い。

移行手順:
1. `advanceDay(menuId?: PracticeMenuId)` と optional 化
2. 引数がある場合は一時的に `playerSchool.practiceMenu` を更新してから実行
3. 全テストが通ることを確認
4. 1〜2週間後に引数を完全削除（別 PR）

### パフォーマンス注意

評価者ランク計算（全選手 × 24評価者）は月次バッチのみで実行。
日次処理では実行しない（処理時間が長くなるため）。

---

## 8. チェックリスト（実装完了確認）

### Phase 11.5 全体

- [ ] docs/phase11_5/ の全8設計書が存在する
- [ ] 全826件（既存）+ 新規テストが全通過
- [ ] v0.19.x のバージョン更新が完了
- [ ] セーブデータ互換性: 旧セーブを読み込んでエラーが出ない
- [ ] TypeScript strict モードを通過

### 各サブフェーズ（A〜G 完了時）

- [ ] 11.5-A: タブUI、怪我人リスト、練習メニューselect削除
- [ ] 11.5-B: チーム画面に練習設定セクション追加
- [ ] 11.5-C: 24評価者登録、ランク計算、ホーム評価者タブ
- [ ] 11.5-D: 全13能力言葉化、自校選手詳細で言葉表示
- [ ] 11.5-E: 悩み生成、練習履歴14日、イベント履歴
- [ ] 11.5-F: マネージャースカウティングレポート表示
- [ ] 11.5-G: /play/staff ページ、経験値・ランクアップ
