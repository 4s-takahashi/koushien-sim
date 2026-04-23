# Phase 12-J 実装レポート — リアルな野球アニメーション v0.29.0

## 概要

**報告された問題（高橋さん）**:
> ヒットを打ってるのに、ショートやセカンドが１塁に投げてアウトと表示されているアニメーションが出ている。

**根本原因**:
- `buildGroundOutSequence()` が常に「ゴロ→内野手→一塁送球→アウト」という固定パターンで動いていた
- 実際の `pitchResult.batContact.fieldResult.type`（ヒット/アウト/フライ等）を参照していなかった
- page.tsx でも `latest.outcome === 'in_play'` という不正確な判定でアウト/セーフを決定していた

---

## 実装内容

### バージョン: v0.28.1 → v0.29.0 (feat)

---

## 新規追加ファイル

### `tests/ui/match-visual/play-sequences.test.ts`
- 43 件のユニットテスト
- `buildPlaySequence` 統一API の全 fieldResultType ケース
- `buildFlyoutSequence` / `buildPopupSequence` / `buildHitSequence` / `buildInfieldHitSequence`
- `buildDoubleSequence` / `buildTripleSequence` / `buildSacrificeFlySequence`
- 後方互換性（`buildGroundOutSequence` が引き続き動作すること）

---

## 変更ファイル

### `src/ui/match-visual/useBallAnimation.ts`

#### 追加: 型定義
- `BatContactForAnimation` に `fieldResultType`, `fielderPosition`, `runnersOnBase` フィールド追加
- `FielderAbility` インターフェース（将来の拡張用型定義）
- `PlayPhaseKind` に `'flyBall'` を追加
- `PlayPhaseData` に `{ kind: 'flyBall'; from; to; peakHeight }` を追加
- `PlaySequenceState` に `ballHeightNorm?: number` を追加
- `PlayPhaseData['result']` に `baseKey?: string` を追加（表示位置）

#### 追加: ユーティリティ関数
- `getFielderForOutfield(direction)` — 外野手位置判定
- `getThrowTarget(runnersOnBase, isHit)` — 送球先判断（将来拡張用）
- `calcLandingPos(direction, distance, scale)` — 打球着弾位置計算

#### 追加: シーケンス構築関数
| 関数名 | 説明 | フェーズ数 |
|--------|------|-----------|
| `buildFlyoutSequence(contact, isOutfield)` | 外野フライアウト | 3 (flyBall/fielderMove/result) |
| `buildPopupSequence(contact)` | 内野ポップアップ | 3 (flyBall/fielderMove/result) |
| `buildHitSequence(contact)` | シングルヒット（外野） | 5 (flyBall/fielderMove/throw/batterRun/result) |
| `buildInfieldHitSequence(contact)` | 内野安打 | 5 (groundRoll/fielderMove/throw/batterRun/result) |
| `buildDoubleSequence(contact)` | 二塁打 | 6 (flyBall/fielderMove/throw/batterRun×2/result) |
| `buildTripleSequence(contact)` | 三塁打 | 7 (flyBall/fielderMove/throw/batterRun×3/result) |
| `buildSacrificeFlySequence(contact)` | 犠牲フライ | 4 (flyBall/fielderMove/throw/result) |
| `buildPlaySequence(contact)` | **統一API** | fieldResultType に自動選択 |

#### 修正: `triggerPlaySequence` アニメーションループ
- `flyBall` フェーズの処理を追加（二次ベジェ曲線で放物線軌跡）
- `ballHeight` 変数を追加して各フェーズでボール高さを設定
- `PlaySequenceState.ballHeightNorm` に `ballHeight` を反映

---

### `src/ui/match-visual/BallparkCanvas.ts`

#### 修正: `renderBallpark()`
- ボールの高さ: `state.playSequenceState?.ballHeightNorm` を優先取得

#### 修正: `drawResultFlash()`
- 引数に `baseKey: string` を追加
- `baseKey` の値（first/second/third/catcher）に応じた表示位置に対応
- ヒット判定テキスト（「ヒット！」「二塁打！」等）の表示位置が対応する塁の近くに

---

### `src/app/play/match/[matchId]/page.tsx`

#### 変更: インポート
```diff
- import { computeTrajectory, buildGroundOutSequence } from '...';
+ import { computeTrajectory, buildPlaySequence } from '...';
```

#### 変更: アニメーション呼び出しロジック
**変更前**:
```typescript
const isGroundBall = batContact.contactType === 'ground_ball' || ...;
if (isGroundBall) {
  const isOut = latest.outcome === 'in_play';  // ← 不正確！
  triggerPlaySequence(buildGroundOutSequence(contact, isOut));
} else {
  triggerHitAnimation(trajectory);
}
```

**変更後**:
```typescript
const isHomeRun = trajectory.type === 'home_run';
const fieldResultType = batContact.fieldResult?.type; // ← エンジンの実際の結果を参照
if (isHomeRun) {
  triggerHitAnimation(trajectory);
  setTimeout(() => triggerHomeRunEffect(), ...);
} else {
  triggerPlaySequence(buildPlaySequence({
    ...contact,
    fieldResultType,  // ← 正しい結果でシーケンスを選択
  }));
}
```

---

### `src/version.ts`
- VERSION: `'0.28.1'` → `'0.29.0'`
- CHANGELOG に Phase 12-J エントリ追加

---

## テスト結果

```
Test Files  1 passed (1)  ← play-sequences.test.ts
     Tests  43 passed (43)

全体:
Test Files  5 failed | 83 passed (88)
     Tests  25 failed | 1041 passed (1066)
```

- **新規 43 件全通過**
- **既存テスト破壊なし**
- 25 件の失敗はすべて autumn-tournament 関連の既存バグ（除外対象）

---

## buildPlaySequence の分岐ロジック

```
fieldResultType
├── 'single'
│   ├── ground_ball/bunt_ground → buildInfieldHitSequence (内野安打！)
│   └── fly_ball/line_drive    → buildHitSequence (ヒット！)
├── 'double'                   → buildDoubleSequence (二塁打！)
├── 'triple'                   → buildTripleSequence (三塁打！)
├── 'sacrifice_fly'            → buildSacrificeFlySequence (犠牲フライ！)
├── 'out'
│   ├── ground_ball/bunt_ground → buildGroundOutSequence (アウト！)
│   ├── popup                   → buildPopupSequence (アウト！)
│   └── fly_ball/line_drive     → buildFlyoutSequence (アウト！)
├── 'double_play'              → buildGroundOutSequence (アウト！)
├── 'sacrifice'                → buildGroundOutSequence (アウト！)
├── 'error'
│   ├── ground_ball            → buildGroundOutSequence (isOut=false → セーフ扱い)
│   └── fly_ball               → buildFlyoutSequence
├── 'fielders_choice'          → buildGroundOutSequence
└── default (未設定)           → contactType から推定
    ├── ground_ball            → buildGroundOutSequence
    ├── popup                  → buildPopupSequence
    └── fly_ball/line_drive    → buildFlyoutSequence
```

---

## 修正前後の比較

| 状況 | 修正前 | 修正後 |
|------|--------|--------|
| ヒット（シングル） | ゴロ→一塁アウト表示 | 外野/内野に応じたヒット表示 |
| 外野フライアウト | ゴロ→一塁アウト表示 | フライ→外野手キャッチ→アウト |
| ポップフライ | ゴロ→一塁アウト表示 | 高い弧→内野手キャッチ→アウト |
| 二塁打 | ゴロ→一塁アウト表示 | 外野打球→2段階走塁→二塁打 |
| 三塁打 | ゴロ→一塁アウト表示 | 外野打球→3段階走塁→三塁打 |
| 犠牲フライ | ゴロ→一塁アウト表示 | フライ→キャッチ→バックホーム |
| ゴロアウト | ゴロ→一塁アウト（方向正しい） | ゴロ→一塁アウト（変更なし） |
| ホームラン | 変更なし | 変更なし（triggerHitAnimation維持） |

---

## 将来の拡張（型定義済み）

- `FielderAbility` インターフェース（守備力・肩力・守備範囲）
- `runnersOnBase` パラメータ（走者情報による送球先変更）
- `getThrowTarget()` 関数（走者状況での動的送球先判断）
- 癖・勝負強さパラメータは将来の `FielderAbility` 拡張として記載済み
