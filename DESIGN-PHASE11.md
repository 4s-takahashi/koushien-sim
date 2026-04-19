# Phase 11 — 拡張計画（A → D → B → C）

**作成日:** 2026-04-19
**状態:** 実装中
**実装順序:** A（体験深化）→ D（磨き込み）→ B（データ）→ C（甲子園）

---

## Phase 11-A: プレイ体験の深化

### A1. 個別練習メニュー（Issue #4）

#### 型定義
```ts
// HighSchool 側
interface HighSchool {
  // 既存フィールド...
  individualPracticeOverrides?: Record<string, PracticeMenuId>;
  // { [playerId]: 'batting_basic' | ... } — 未指定なら team menu
}
```

#### データフロー
- UI: Team画面で選手ごとに練習メニューを選択
- Store: `setIndividualMenu(playerId, menuId)` action
- Ticker: `advanceSchoolFull` で選手ごとに different menuId を適用
  - 現在は team 全体 1つの menuId → 個別オーバーライド検査を追加

#### UI変更
- `/play/team` 選手一覧の「練習」列を追加
- ドロップダウンで individual menu 選択
- 空 = team default

### A2. 監督の戦術スタイル

#### 型定義
```ts
type ManagerStyle = 'aggressive' | 'balanced' | 'defensive' | 'small_ball';

interface Manager {
  // 既存...
  style: ManagerStyle;
}
```

#### 影響範囲
- 打撃ブースト（aggressive: 長打+5%）
- 盗塁ブースト（aggressive + small_ball: 成功率+10%）
- 守備固め（defensive: エラー率-10%）
- バント頻度（small_ball: CPU バント頻度+20%）

### A3. 選手モチベーションシステム

#### 型定義
```ts
// Player
interface Player {
  // 既存...
  motivation?: number; // 0-100, default 50
}
```

#### 計算ロジック
- 試合出場 → +5
- ホームラン・好投 → +10
- ベンチ → -2/日
- 休養 → +3
- 同ポジションライバル多い → -1/日
- 70以上でモラル良好、30以下で集中力低下

#### 影響
- 試合時のパフォーマンスに ±10% 補正
- 練習効率に ±20% 補正

### A4. OB システム拡充

- 卒業選手のキャリア保存（既に基盤あり）
- OB から監督登用（特殊効果あり）
- OB 寄付金（reputation 高い OB が資金援助）
- OB 顔出し（ホーム画面「今週のOB」）

---

## Phase 11-D: 磨き込み・QA

1. **統合テスト拡充**: 全体フロー（新ゲーム→1年→夏大会→2年→秋大会→2年末）
2. **UI 微調整**:
   - モバイル対応
   - ロード時間最適化
   - キーボードナビゲーション
3. **バグ収穫**: 本番で発見された問題の修正

---

## Phase 11-B: データ・記録

### B1. 年度別スタッツ・ランキング
- /play/records/[year] 新設
- 打率・本塁打・打点・勝数・防御率の上位10名
- シーズン別・通算の切り替え

### B2. 伝説選手の殿堂
- 卒業時に stats が上位の選手を「殿堂入り」
- 条件: 甲子園出場 or 甲子園ベスト8以上 or 通算 HR >=20 or 打率 >=.350
- /play/hall-of-fame ページ

### B3. 試合ハイライトリプレイ
- MatchResult に narration 履歴を保存
- /play/results/[matchId] で試合の全実況を再生可能
- 決勝戦は自動保存、その他は手動セーブ

---

## Phase 11-C: 甲子園システム

### C1. 都道府県制
- 全国47都道府県、各都道府県に 20-30校
- player school は 1都道府県に所属
- 既存の prefecture フィールド活用

### C2. 地方大会 → 県大会 → 甲子園
- **地方大会**: 都道府県内予選（8〜16校）
- **県大会**: 都道府県代表 1校
- **甲子園**: 47都道府県 + 東京・北海道の代表49校

### C3. 甲子園ブラケット
- 1回戦 24試合 + 代表校 1校 (49校)
- 2回戦 16試合
- 3回戦 8試合
- 準々決勝 4試合
- 準決勝 2試合
- 決勝 1試合

---

## 実装順序・並列化戦略

1. **Phase 11-A**:
   - A1 個別練習メニュー（エージェント1）
   - A2 監督戦術スタイル（エージェント2）
   - A3 モチベーション（エージェント3）
   - A4 OB拡充（エージェント4 — 低優先）

2. **Phase 11-D**: Phase 11-A 完了後、手動で磨き込み

3. **Phase 11-B**: エージェント並列投入

4. **Phase 11-C**: 大規模なので設計のみ先行、実装は別日

---

## 制約

- 全既存テスト（612件）維持
- save/load 互換性維持
- TypeScript strict 通す
- `engine/match/` コアは慎重に（runner.ts は触らない方針）
- 各機能を独立した PR にして main に push
- バージョン: v0.17.x (patch)、大きい変更は v0.18.0 (minor)
